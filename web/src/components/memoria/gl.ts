/**
 * Capa WebGPU de «Memoria» (three/webgpu + TSL; cae a WebGL2). Un solo canvas fijo, un solo draw call.
 *
 * El DOM sigue siendo la verdad (layout, foco, alt, enlaces). Cada foto del DOM es una instancia de un
 * InstancedMesh; sus píxeles viven en un ATLAS (una textura grande con casillas). Así:
 *  - no se crea un material por foto (compilar nodos en el hilo principal era el tirón al bajar)
 *  - las fotos se descargan y decodifican en un Worker (fetch + createImageBitmap fuera del hilo principal)
 *    y se suben al atlas de a 1–2 por cuadro: llegan como un flujo, desenfocadas, y se «desenrollan»
 *  - las posiciones se miden una vez (y al cambiar el layout); por cuadro solo se resta el scroll
 *
 * Efectos: las fotos están a color desde el principio; cada una llega «quemándose al revés»: primero ceniza,
 * después un frente de brasas que sube y la deja restaurada (el Taller ardió en 2017; acá todo vuelve).
 * El puntero es calor (estela en GPU, ping-pong): el aire tiembla y entibia la foto donde pasa.
 * Las fotos cuelgan como tela: el borde de abajo se atrasa con la velocidad del scroll y se mece;
 * el puntero las abomba como una lupa; con hover la foto se repliega y se oscurece para el título.
 */
import * as THREE from "three/webgpu";
import { clearFire, reportFire } from "@/components/fx/fire-bus";
import { createFluid } from "@/components/fx/fluid";
import {
  abs,
  attribute,
  clamp,
  dot,
  exp,
  float,
  floor,
  fract,
  max,
  min,
  mix,
  mx_noise_float,
  positionGeometry,
  pow,
  screenUV,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";

export type GLHandle = {
  backend: "webgpu" | "webgl2";
  /** sin efectos: mismas fotos, mismo canvas, sin ceniza, calor ni tela (y sin las pasadas de la estela) */
  setPlain: (on: boolean) => void;
  stop: () => void;
  onFail: (cb: (why: string) => void) => void;
  /** pausa el dibujo mientras otra capa (p. ej. el visor) tiene la GPU */
  hold: (on: boolean) => void;
};
export type GLOptions = {
  forceWebGL?: boolean;
  /** medir posiciones en cada cuadro (elementos que se mueven por transform, p. ej. la cinta de la home) */
  live?: boolean;
  /** lado de cada casilla del atlas en px (512 detalle, 256 vista general) */
  slot?: number;
  /** empezar sin efectos */
  plain?: boolean;
  /**
   * Dónde está el origen del contenido en la pantalla (px). Por defecto el documento: { x: 0, y: -scrollY }.
   * Una cinta horizontal fijada (Memoria) devuelve su propio desplazamiento: así las posiciones se miden una vez
   * y por cuadro solo se suma este origen, sin volver a leer el layout.
   */
  origin?: () => { x: number; y: number };
  /** eje principal del recorrido (para precargar hacia adelante y doblar la tela en esa dirección) */
  axis?: "x" | "y";
  /**
   * Mientras la GPU dibuja una foto, su <img> del DOM no descarga nada (se le quita la fuente y se le devuelve
   * si la GPU se apaga o no puede con esa foto). Para páginas con cientos de fotos: sin esto cada una se bajaba
   * dos veces, una por el navegador y otra por el decodificador.
   */
  detachImages?: boolean;
};

type Cell = {
  el: HTMLElement;
  frame: HTMLElement;
  img: HTMLImageElement | null;
  src: HTMLElement | null;
  x: number;
  y: number;
  w: number;
  h: number;
  ia: number;
  seed: number;
  fire: number;
  url: string;
  hover: number;
  seenAt: number;
  ready: boolean;
  skip: boolean;
  /** el marco es un <img> con object-fit: contain: se dibuja solo la parte que ocupa la foto */
  contain: boolean;
};
type Slot = { idx: number; url: string; readyAt: number; lastUsed: number };

// Worker de decodificación: fetch + createImageBitmap redimensionado a la casilla (estirado: el recorte
// «cover» se hace en el shader con el aspecto real). Nada de esto toca el hilo principal.
const WORKER_SRC = `
const live = new Map();
self.onmessage = async (e) => {
  const { id, url, size, cancel } = e.data;
  if (cancel) { live.get(id)?.abort(); return; }
  const ac = new AbortController();
  live.set(id, ac);
  try {
    const r = await fetch(url, { credentials: "same-origin", signal: ac.signal, priority: e.data.high ? "high" : "low" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const b = await r.blob();
    const bmp = await createImageBitmap(b, { resizeWidth: size, resizeHeight: size, resizeQuality: "high", colorSpaceConversion: "none", premultiplyAlpha: "none" });
    if (ac.signal.aborted) { bmp.close(); self.postMessage({ id, cancelled: true }); }
    else self.postMessage({ id, bmp }, [bmp]);
  } catch (err) {
    self.postMessage(ac.signal.aborted ? { id, cancelled: true } : { id, error: String(err) });
  } finally {
    live.delete(id);
  }
};`;

export async function startMemoriaGL(root: HTMLElement, layer: HTMLElement, opts: GLOptions = {}): Promise<GLHandle> {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const renderer = new THREE.WebGPURenderer({ antialias: false, alpha: true, powerPreference: "high-performance", forceWebGL: Boolean(opts.forceWebGL) });
  await renderer.init();
  const backend: GLHandle["backend"] = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "webgpu" : "webgl2";
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75));
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("role", "presentation");
  layer.appendChild(canvas);

  // ---------- atlas ----------
  const ATLAS = coarse ? 2048 : 4096;
  const SLOT = Math.min(opts.slot ?? 512, ATLAS / 2);
  const PER = Math.floor(ATLAS / SLOT);
  const NSLOT = PER * PER;
  const atlas = new THREE.RenderTarget(ATLAS, ATLAS, { depthBuffer: false });
  atlas.texture.generateMipmaps = false;
  atlas.texture.minFilter = THREE.LinearFilter;
  atlas.texture.magFilter = THREE.LinearFilter;

  // Una sola textura de origen, reutilizada: todos los bitmaps miden SLOT×SLOT, así que cambiar su imagen
  // no recrea nada en la GPU ni reconstruye el material (crear una Texture nueva por foto sí lo hacía).
  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = SLOT;
  srcCanvas.height = SLOT;
  const srcTex = new THREE.Texture(srcCanvas as unknown as HTMLImageElement);
  srcTex.flipY = false;
  srcTex.colorSpace = THREE.NoColorSpace;
  srcTex.generateMipmaps = false;
  srcTex.minFilter = THREE.LinearFilter;
  srcTex.magFilter = THREE.LinearFilter;
  srcTex.needsUpdate = true;
  const blitScene = new THREE.Scene();
  const blitCam = new THREE.OrthographicCamera(0, ATLAS, 0, -ATLAS, -1, 1);
  const uBlit = uniform(new THREE.Vector4(0, 0, SLOT, SLOT));
  const blitMat = new THREE.MeshBasicNodeMaterial({ depthTest: false, depthWrite: false });
  blitMat.colorNode = texture(srcTex, screenUV.mul(ATLAS).sub(uBlit.xy).div(uBlit.zw)).rgb; // copia cruda (sRGB codificado)
  const blitMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blitMat);
  blitMesh.frustumCulled = false;
  blitMesh.scale.set(SLOT, SLOT, 1);
  blitScene.add(blitMesh);
  let lastBmp: ImageBitmap | null = null;

  const blit = (idx: number, bmp: ImageBitmap) => {
    srcTex.image = bmp as unknown as HTMLImageElement;
    srcTex.needsUpdate = true;
    const sx = (idx % PER) * SLOT;
    const sy = Math.floor(idx / PER) * SLOT;
    uBlit.value.set(sx, sy, SLOT, SLOT);
    blitMesh.position.set(sx + SLOT / 2, -(sy + SLOT / 2), 0);
    renderer.autoClear = false;
    renderer.setRenderTarget(atlas);
    renderer.render(blitScene, blitCam);
    renderer.setRenderTarget(null);
    renderer.autoClear = true;
    lastBmp?.close(); // el anterior ya se copió
    lastBmp = bmp;
  };

  // ---------- el puntero como antorcha: fluido de Navier–Stokes en la GPU (components/fx/fluid.ts) ----------
  const fluid = createFluid(renderer, { coarse });
  const fireId = `gl-${Math.random().toString(36).slice(2, 8)}`;
  const uPtr = uniform(new THREE.Vector2(-2, -2)); // 0..1, y hacia abajo
  const uPtrPx = uniform(new THREE.Vector2(-9999, -9999));
  const uEnergy = uniform(0);
  const uAspect = uniform(1);
  const uRes = uniform(new THREE.Vector2(1, 1));
  const uVel = uniform(0);
  const uVelX = uniform(0);
  const uFx = uniform(opts.plain ? 0 : 1);
  const uBulgeR = uniform(coarse ? 120 : 170);

  // ---------- instancias ----------
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  const geo = new THREE.PlaneGeometry(1, 1, 14, 14);
  const mkAttr = () => {
    const a = new THREE.InstancedBufferAttribute(new Float32Array(NSLOT * 4), 4);
    a.setUsage(THREE.DynamicDrawUsage);
    return a;
  };
  const aRect = mkAttr(); // x, y, w, h (px, pantalla)
  const aSlot = mkAttr(); // u0, v0, du, dv en el atlas
  const aParam = mkAttr(); // hover, appear, fire, aspecto de la imagen
  const aMore = mkAttr(); // semilla, -, -, -
  geo.setAttribute("iRect", aRect);
  geo.setAttribute("iSlot", aSlot);
  geo.setAttribute("iParam", aParam);
  geo.setAttribute("iMore", aMore);

  const iRect = attribute("iRect", "vec4");
  const iSlot = attribute("iSlot", "vec4");
  const iParam = attribute("iParam", "vec4");
  const iMore = attribute("iMore", "vec4");

  // vértices: tela colgada + lupa del puntero + repliegue al hover
  const hov = iParam.x;
  const pg = positionGeometry.xy.add(0.5); // 0..1, y hacia arriba
  const lp = pg.sub(0.5).mul(float(1).sub(hov.mul(0.075))).add(0.5);
  const sx0 = iRect.x.add(lp.x.mul(iRect.z));
  const sy0 = iRect.y.add(float(1).sub(lp.y).mul(iRect.w));
  const hang = pow(float(1).sub(lp.y), 1.7); // arriba fijo (la cuerda), abajo suelto
  const sway = sin(sx0.mul(0.0045).add(time.mul(0.8)).add(iMore.x.mul(6.283)));
  // la tela se atrasa contra el movimiento: vertical (scroll) o lateral (la cinta horizontal)
  const sy1 = sy0.add(uVel.mul(hang).mul(sway.mul(0.35).add(1)).mul(1.9).mul(uFx)).add(uVelX.mul(hang).mul(sway).mul(0.4).mul(uFx));
  const sx1 = sx0.add(uVel.mul(hang).mul(sway).mul(0.55).mul(uFx)).add(uVelX.mul(hang).mul(sway.mul(0.3).add(1)).mul(1.6).mul(uFx));
  const dp = vec2(sx1, sy1).sub(uPtrPx);
  const d2 = dot(dp, dp);
  const bulge = exp(d2.div(uBulgeR.mul(uBulgeR)).negate()).mul(uEnergy).mul(16).mul(uFx);
  const dn = dp.div(sqrt(d2).add(1));
  const sx = sx1.add(dn.x.mul(bulge));
  const sy = sy1.add(dn.y.mul(bulge));

  // fragmento
  const vu = uv();
  const cv = vec2(vu.x, float(1).sub(vu.y)); // y hacia abajo
  const ia = iParam.w;
  const ra = iRect.z.div(iRect.w);
  const sc = select(ia.greaterThan(ra), vec2(ra.div(ia), 1), vec2(1, ia.div(ra)));
  const cuv = cv.sub(0.5).mul(sc).mul(float(1).sub(hov.mul(0.03))).add(0.5);
  const appear = iParam.y;
  const px = screenUV.mul(uRes);
  // la antorcha: el aire que mueve deforma la foto (contra la corriente) y donde hay calor tiembla
  const fv = fluid.vel.xy;
  const fd = fluid.dye;
  const heat = fd.x;
  const scorch = fd.y;
  // temblor del aire caliente: ondas anchas y lentas, apenas perceptibles (antes vibraba y cansaba la vista)
  const shimmer = vec2(sin(px.y.mul(0.028).add(time.mul(1.3))), sin(px.x.mul(0.022).add(time.mul(1.1)))).mul(heat.mul(0.0011));
  const haze = fv.mul(vec2(-0.000034, -0.000034)).add(shimmer).mul(uFx);
  const at = (o: Parameters<typeof cuv.add>[0]) => texture(atlas.texture, iSlot.xy.add(clamp(cuv.add(o).add(haze), 0.003, 0.997).mul(iSlot.zw))).rgb;
  const lin = (c: ReturnType<typeof at>) => pow(c, vec3(2.2));
  const center = at(vec2(0, 0));
  const split = clamp(uVel.add(uVelX), -40, 40).mul(0.00045).mul(uFx);
  const photo = lin(vec3(at(vec2(0, split)).r, center.g, at(vec2(0, split.negate())).b)); // a color, siempre

  // Quemado al revés: la foto vuelve de la ceniza. Un frente de brasas sube de abajo hacia arriba
  // (con bordes de ruido) y deja la imagen restaurada a su paso.
  const seed = iMore.x.mul(10);
  const n1 = mx_noise_float(vec3(cv.mul(vec2(4.5, 6)), seed)).mul(0.5).add(0.5);
  const n2 = mx_noise_float(vec3(cv.mul(19), seed.add(3))).mul(0.5).add(0.5);
  const field = float(1).sub(cv.y).mul(0.55).add(n1.mul(0.35)).add(n2.mul(0.1));
  const front = appear.mul(1.28).sub(0.14);
  const restored = smoothstep(front.add(0.014), front.sub(0.014), field);
  const band = smoothstep(0.085, 0.0, abs(field.sub(front)));
  const lum = dot(photo, vec3(0.299, 0.587, 0.114));
  const ash = mix(vec3(0.012, 0.01, 0.01), vec3(0.075, 0.068, 0.064), smoothstep(0.6, 0.95, n2)).add(lum.mul(0.05)); // carbón con el fantasma de la foto
  const flick = sin(time.mul(17).add(n2.mul(30))).mul(0.22).add(0.78);
  const emberCol = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.85, 0.4), band.mul(band)).mul(flick).mul(2.4);
  // chispas sueltas en la ceniza, justo por encima del frente
  const cell = floor(px.div(3));
  const rnd = fract(sin(dot(cell, vec2(12.9898, 78.233)).add(floor(time.mul(14)))).mul(43758.5453));
  const near = smoothstep(0.22, 0.0, field.sub(front)).mul(step(front, field));
  const spark = step(0.982, rnd).mul(near);
  const grain = fract(sin(dot(px.add(time.mul(41.0)), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(0.025);
  const restoredF = max(restored, float(1).sub(uFx)); // sin efectos: la foto, directo
  const burnt = mix(ash, photo, restoredF).add(emberCol.mul(band).mul(uFx)).add(vec3(1.0, 0.6, 0.2).mul(spark.mul(1.4).mul(uFx)));
  // ---------- el fuego hecho de la foto ----------
  // La llama no trae su color: lo toma de los píxeles que quema. Se muestrea la foto río arriba de la
  // corriente (donde estaba el aire hace un instante) y ese pigmento arrastrado es el color del fuego,
  // encendido hasta su tono más puro, con un núcleo blanco solo donde arde más.
  const pxToUv = sc.div(iRect.zw); // de px de pantalla a uv de la foto
  const smear = fv.mul(-0.024).mul(uFx).mul(pxToUv); // estela de pigmento, contra la corriente
  const pig = lin(at(smear.mul(0.33)))
    .add(lin(at(smear.mul(0.66))))
    .add(lin(at(smear)))
    .add(photo)
    .mul(0.25);
  const pmax = max(max(pig.x, pig.y), pig.z);
  const hue = pig.div(max(pmax, 0.035)); // el tono del píxel, a pleno
  const plum = dot(pig, vec3(0.299, 0.587, 0.114));
  // Quemadura de color (color burn, literal) teñida con el propio tono de la foto: se tuesta, no se borra.
  const toast = mix(mix(vec3(1.0, 0.72, 0.46), hue.mul(0.75).add(0.2), 0.45), vec3(0.88, 0.36, 0.12), clamp(scorch.mul(0.9), 0, 0.7));
  const burned = vec3(1).sub(min(vec3(1), vec3(1).sub(burnt).div(max(toast, vec3(0.02)))));
  // por fuerte que sea el fuego, al menos un tercio de la foto queda siempre (nunca llega al negro)
  const kept = mix(burned, burnt, 0.34);
  const scorched = mix(burnt, kept, clamp(scorch.mul(1.25), 0, 1).mul(uFx));
  const tp = px.mul(0.012).add(fv.mul(0.0006));
  const tongues = mx_noise_float(vec3(tp.x, tp.y, time.mul(0.55))).mul(0.5).add(0.5);
  const flame = clamp(heat.mul(tongues.mul(0.4).add(0.7)), 0, 1.5);
  const body = vec3(flame.mul(1.6), flame.mul(flame).mul(0.95), flame.mul(flame).mul(flame).mul(0.42)); // cuerpo negro
  const pigFire = hue.mul(flame.mul(1.5)).add(vec3(1.0, 0.94, 0.8).mul(flame.mul(flame).mul(flame).mul(0.32)));
  const fire = mix(body, pigFire, 0.72).mul(0.72).mul(uFx);
  // Y lo que importa: cuando el calor se va y queda la marca, la foto vuelve más luminosa que antes.
  // El fuego no la borra; la templa.
  const rise = clamp(scorch.sub(heat.mul(1.15)), 0, 1).mul(uFx);
  const tempered = photo.mul(rise.mul(0.55)).add(hue.mul(plum.mul(rise).mul(0.18)));
  const base = scorched.add(fire).add(tempered).add(grain.mul(uFx)).mul(float(1).sub(hov.mul(0.4)));
  // recuerdos marcados lostInFire (2017): el borde guarda la brasa
  const edge = min(min(cv.x, float(1).sub(cv.x)), min(cv.y, float(1).sub(cv.y)));
  const ember = smoothstep(0.05, 0.0, edge.add(n2.mul(0.02))).mul(iParam.z);
  const color = mix(base, vec3(0.85, 0.3, 0.1), ember.mul(0.8));
  // con efectos la ceniza aparece enseguida sobre el placeholder; sin efectos la foto se funde
  const mask = mix(appear, smoothstep(0.0, 0.05, appear), uFx);

  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
  mat.positionNode = vec3(sx, sy.negate(), 0);
  mat.colorNode = color;
  mat.opacityNode = mask;
  const mesh = new THREE.InstancedMesh(geo, mat, NSLOT);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // ---------- tamaño ----------
  let W = 0;
  let H = 0;
  let forceDraw = true; // algo cambió por fuera del ciclo (tamaño, modo, layout): hay que redibujar
  const resize = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setSize(W, H, false);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    camera.left = 0;
    camera.right = W;
    camera.top = 0;
    camera.bottom = -H;
    camera.updateProjectionMatrix();
    uRes.value.set(W, H);
    fluid.resize(W, H);
    forceDraw = true;
    uAspect.value = W / Math.max(1, H);
  };
  resize();

  // ---------- puntero ----------
  const ptr = { x: -9999, y: -9999, sx: -9999, sy: -9999, t: 0, down: false, speed: 0 };
  const onPtr = (e: PointerEvent) => {
    ptr.x = e.clientX;
    ptr.y = e.clientY;
    if (ptr.sx < -999) {
      ptr.sx = ptr.x;
      ptr.sy = ptr.y;
    }
    ptr.t = performance.now();
  };
  const onDown = (e: PointerEvent) => {
    ptr.down = true;
    onPtr(e);
  };
  const onUp = () => {
    ptr.down = false;
  };
  window.addEventListener("pointermove", onPtr, { passive: true });
  window.addEventListener("pointerdown", onDown, { passive: true });
  window.addEventListener("pointerup", onUp, { passive: true });
  window.addEventListener("pointercancel", onUp, { passive: true });

  // ---------- celdas (DOM → datos) ----------
  let cells: Cell[] = [];
  const byEl = new Map<HTMLElement, Cell>();
  const hash = (str: string) => {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return (h >>> 0) / 4294967296;
  };
  const pickUrl = (c: Cell) => {
    const cur = c.img?.currentSrc;
    if (cur && /^https?:/.test(cur)) return cur; // la que eligió el navegador (formato y ancho): la caché HTTP la comparte
    const d = c.src?.dataset;
    const src = d?.src ?? c.img?.getAttribute("src") ?? "";
    const widths = (d?.widths ?? "").split(",").filter(Boolean).map(Number).sort((a, b) => a - b);
    if (widths.length && /-\d+\.jpg$/.test(src)) {
      const want = Math.max(SLOT, Math.round(c.w * Math.min(2, devicePixelRatio || 1)));
      const w = widths.find((x) => x >= want) ?? widths.at(-1)!;
      return new URL(src.replace(/-\d+\.jpg$/, `-${w}.webp`), location.href).href;
    }
    return src ? new URL(src, location.href).href : "";
  };
  // ---------- fuentes del DOM en pausa ----------
  const parked = new WeakMap<Element, { src: string | null; srcset: string | null }>();
  const park = (c: Cell) => {
    if (!opts.detachImages || !c.img || parked.has(c.img)) return;
    if (c.img.complete && c.img.naturalWidth > 0) return; // ya la tiene: no hay nada que ahorrar
    if (!c.url) c.url = pickUrl(c);
    if (!c.url) return;
    for (const n of [c.img, ...(c.img.parentElement?.querySelectorAll("source") ?? [])]) {
      parked.set(n, { src: n.getAttribute("src"), srcset: n.getAttribute("srcset") });
      n.removeAttribute("srcset");
      if (n === c.img) n.removeAttribute("src");
    }
  };
  const unpark = (c: Cell) => {
    if (!c.img) return;
    for (const n of [...(c.img.parentElement?.querySelectorAll("source") ?? []), c.img]) {
      const p = parked.get(n);
      if (!p) continue;
      parked.delete(n);
      if (p.srcset !== null) n.setAttribute("srcset", p.srcset);
      if (p.src !== null) n.setAttribute("src", p.src);
    }
  };

  const collect = () => {
    const prev = byEl;
    const next: Cell[] = [];
    root.querySelectorAll<HTMLElement>("[data-mem]").forEach((el) => {
      const old = prev.get(el);
      if (old) return next.push(old);
      const img = el.querySelector<HTMLImageElement>("img:not([aria-hidden])") ?? el.querySelector("img"); // no la copia desenfocada de fondo
      const holder = img?.parentElement;
      const frame = (el.hasAttribute("data-gl-frame")
        ? el
        : (el.querySelector<HTMLElement>("[data-gl-frame]") ??
          (holder && getComputedStyle(holder).display !== "contents" ? holder : img) ??
          el)) as HTMLElement;
      const src = el.querySelector<HTMLElement>("[data-src]");
      const nw = Number(src?.dataset.w) || img?.naturalWidth || Number(img?.getAttribute("width")) || 1;
      const nh = Number(src?.dataset.h) || img?.naturalHeight || Number(img?.getAttribute("height")) || 1;
      next.push({
        el,
        frame,
        img,
        src,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        ia: nw / nh,
        seed: hash(el.dataset.mem ?? String(next.length)),
        fire: el.hasAttribute("data-fire") ? 1 : 0,
        url: "",
        hover: 0,
        seenAt: 0,
        ready: false,
        skip: false,
        contain: frame === img && getComputedStyle(frame).objectFit === "contain",
      });
    });
    cells = next;
    byEl.clear();
    for (const c of cells) byEl.set(c.el, c);
  };
  const axisX = opts.axis === "x";
  const origin = opts.origin ?? (() => ({ x: 0, y: -window.scrollY }));
  // c.x / c.y quedan en coordenadas del contenido: pantalla = c + origen
  const measureCell = (c: Cell, o: { x: number; y: number }) => {
    if (c.el.hidden) {
      c.w = 0;
      return;
    }
    const r = c.frame.getBoundingClientRect();
    c.x = r.left - o.x;
    c.y = r.top - o.y;
    c.w = r.width;
    c.h = r.height;
    if (c.contain && r.height > 0) {
      // caja más ancha o más alta que la foto: centrar el rectángulo real (lo que haría object-fit)
      const boxA = r.width / r.height;
      if (boxA > c.ia) {
        c.w = r.height * c.ia;
        c.x += (r.width - c.w) / 2;
      } else {
        c.h = r.width / c.ia;
        c.y += (r.height - c.h) / 2;
      }
    }
  };
  let measured = false;
  const measure = () => {
    const o = origin();
    for (const c of cells) measureCell(c, o); // un solo pase de lectura: un layout
    for (const c of cells) park(c);
    measured = true;
  };
  collect();
  root.dataset.glOn = "";

  // ---------- flujo de decodificación ----------
  const worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" })));
  const slots = new Map<string, Slot>();
  const free: number[] = Array.from({ length: NSLOT }, (_, i) => NSLOT - 1 - i);
  const pending = new Map<number, string>();
  const failedUrls = new Set<string>();
  const inbox: { url: string; bmp: ImageBitmap }[] = [];
  let reqId = 0;
  const MAX_INFLIGHT = coarse ? 3 : 6;
  worker.onmessage = (e: MessageEvent<{ id: number; bmp?: ImageBitmap; error?: string; cancelled?: boolean }>) => {
    const url = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (!url) return e.data.bmp?.close();
    if (e.data.bmp) {
      if (stopped) return e.data.bmp.close();
      inbox.push({ url, bmp: e.data.bmp });
    } else if (!e.data.cancelled) {
      failedUrls.add(url);
      for (const c of cells) if (c.url === url) unpark(c); // que la muestre el navegador
    }
  };
  const inflight = (url: string) => {
    for (const u of pending.values()) if (u === url) return true;
    return false;
  };

  let frame = 0;
  const visibleUrls = new Set<string>();
  const takeSlot = (): number | null => {
    const f = free.pop();
    if (f !== undefined) return f;
    // la casilla usada hace más tiempo que no está en pantalla
    let victim: Slot | null = null;
    for (const sl of slots.values()) if (!visibleUrls.has(sl.url) && (!victim || sl.lastUsed < victim.lastUsed)) victim = sl;
    if (!victim) return null;
    slots.delete(victim.url);
    for (const c of cells)
      if (c.url === victim.url) {
        c.ready = false;
        c.seenAt = 0;
        c.el.removeAttribute("data-gl-ready");
      }
    return victim.idx;
  };

  // hover / foco
  let hovered: HTMLElement | null = null;
  const onOver = (e: Event) => {
    hovered = (e.target as HTMLElement).closest<HTMLElement>("[data-mem]");
  };
  const onOut = (e: PointerEvent | FocusEvent) => {
    const to = (e.relatedTarget as HTMLElement | null)?.closest?.("[data-mem]");
    if (!to) hovered = null;
  };
  root.addEventListener("pointerover", onOver);
  root.addEventListener("pointerout", onOut);
  root.addEventListener("focusin", onOver);
  root.addEventListener("focusout", onOut);

  // ---------- ciclo ----------
  let failed = false;
  let stopped = false;
  const failCbs: ((why: string) => void)[] = [];
  const dts: number[] = [];
  let last = performance.now();
  let running = false;
  let lastO = origin();
  let lastPtrUV = { x: -5, y: -5 };
  let vel = 0;
  let velX = 0;
  let plain = Boolean(opts.plain);
  const fArr = { r: aRect.array as Float32Array, s: aSlot.array as Float32Array, p: aParam.array as Float32Array, m: aMore.array as Float32Array };

  // Dibujar solo cuando algo cambia. Con todo quieto (sin scroll, sin fotos llegando, sin puntero, sin fuego)
  // el cuadro se salta entero: la GPU y la batería descansan y la imagen en pantalla es la misma.
  let idle = 0;
  let wakeO = { x: NaN, y: NaN };
  let wakePtr = 0;
  let wakeHover: HTMLElement | null = null;
  const tick = () => {
    const now = performance.now();
    if (idle > 3 && !opts.live) {
      const o0 = origin();
      // (un latido cada ~45 cuadros por si el navegador descartó el lienzo: pestaña que vuelve, GPU que se reinicia)
      if (!forceDraw && idle++ % 45 !== 0 && measured && o0.x === wakeO.x && o0.y === wakeO.y && ptr.t === wakePtr && hovered === wakeHover && !inbox.length && !pending.size) {
        last = now;
        return;
      }
    }
    forceDraw = false;
    const dt = now - last;
    last = now;
    frame++;
    // huecos grandes = pestaña/panel en segundo plano (el navegador limita a ~1 fps): no cuentan como lentitud
    if (frame > 20 && dts.length < 180 && dt < 250) dts.push(dt);
    if (dts.length === 180 && frame > 0) {
      frame = -1e9; // medir una sola vez
      dts.sort((a, b) => a - b);
      const p75 = dts[Math.floor(dts.length * 0.75)];
      if (p75 > 45) return fail(`lento (p75 ${Math.round(p75)} ms por cuadro)`);
    }
    const o = origin();
    const k = Math.min(2, dt / 16.7);
    // velocidad = cuánto se movió el contenido (hacia arriba / hacia la izquierda es positivo, como el scroll)
    vel += (Math.max(-60, Math.min(60, lastO.y - o.y)) - vel) * Math.min(1, 0.18 * k);
    velX += (Math.max(-60, Math.min(60, lastO.x - o.x)) - velX) * Math.min(1, 0.18 * k);
    lastO = o;
    uVel.value = vel;
    uVelX.value = velX;

    // puntero (con inercia) → uniformes de la estela y de la lupa
    const live = now - ptr.t < 1400 || ptr.down;
    const px0 = ptr.sx;
    const py0 = ptr.sy;
    ptr.sx += (ptr.x - ptr.sx) * 0.22;
    ptr.sy += (ptr.y - ptr.sy) * 0.22;
    ptr.speed += (Math.hypot(ptr.sx - px0, ptr.sy - py0) - ptr.speed) * 0.2;
    uPtr.value.set(ptr.sx / W, ptr.sy / H);
    uPtrPx.value.set(ptr.sx, ptr.sy);
    uEnergy.value += ((live ? Math.min(1, 0.25 + ptr.speed / 25) : 0) - uEnergy.value) * 0.08;

    let busy = Math.abs(vel) > 0.02 || Math.abs(velX) > 0.02 || uEnergy.value > 0.003 || Math.hypot(ptr.x - ptr.sx, ptr.y - ptr.sy) > 0.3;
    if (!plain && ptr.sx > -999) {
      const cur = { x: ptr.sx / W, y: ptr.sy / H };
      if (fluid.step(dt / 1000, cur, lastPtrUV.x < -1 ? cur : lastPtrUV, live ? 1 : 0)) busy = true;
      lastPtrUV = cur;
      // el fuego solo se ve sobre las fotos: fuera de ellas casi no suena
      const on = hovered ? 1 : 0.18;
      const e = fluid.energy;
      reportFire(fireId, { heat: e.heat * on, flow: e.flow * on, swirl: e.swirl * on, pan: e.pan });
    }

    // posiciones
    if (opts.live) {
      if (frame % 30 === 1) collect();
      for (const c of cells) measureCell(c, o);
    } else if (!measured) measure();

    // qué está cerca de la pantalla (y adelante, en la dirección del recorrido)
    visibleUrls.clear();
    const v = axisX ? velX : vel;
    const ahead = v >= 0 ? 1.6 : 0.6;
    const behind = v >= 0 ? 0.6 : 1.6;
    const want: { c: Cell; d: number }[] = [];
    for (const c of cells) {
      if (c.w < 2) continue;
      const top = c.y + o.y;
      const lx = c.x + o.x;
      if (axisX) {
        if (lx + c.w < -W * behind || lx > W * (1 + ahead)) continue;
        if (top + c.h < -H || top > 2 * H) continue;
      } else {
        if (top + c.h < -H * behind || top > H * (1 + ahead)) continue;
        if (!opts.live && (lx + c.w < -W || lx > 2 * W)) continue;
      }
      if (!c.url) c.url = pickUrl(c);
      if (!c.url || failedUrls.has(c.url)) continue;
      const onScreen = top + c.h > -40 && top < H + 40 && lx + c.w > -40 && lx < W + 40;
      if (onScreen) visibleUrls.add(c.url);
      const sl = slots.get(c.url);
      if (sl) {
        c.ready = true;
        continue;
      }
      // Prioridad: lo que está EN pantalla va siempre antes que lo que se precarga, sin importar su lugar en
      // la línea de tiempo; dentro de cada grupo, lo más cercano al centro primero.
      want.push({ c, d: (onScreen ? 0 : 1e6) + Math.abs(top + c.h / 2 - H / 2) + (opts.live || axisX ? Math.abs(lx + c.w / 2 - W / 2) : 0) });
    }
    const waitingOnScreen = want.reduce((n, w) => n + (w.d < 1e6 ? 1 : 0), 0);
    // Si hay fotos en pantalla esperando, se sueltan los pedidos de fotos que ya quedaron lejos (el visitante
    // pasó de largo): dejan de ocupar la red y el decodificador.
    if (waitingOnScreen && pending.size) {
      for (const [id, url] of pending) {
        if (visibleUrls.has(url)) continue;
        pending.delete(id);
        worker.postMessage({ id, cancel: true });
      }
    }
    // con fotos en pantalla esperando se abren más pedidos a la vez; precargar espera su turno
    const cap = waitingOnScreen ? MAX_INFLIGHT + 4 : Math.abs(v) > 24 ? 0 : MAX_INFLIGHT;
    // pedir decodificaciones (las más cercanas primero)
    if (pending.size < cap && want.length) {
      want.sort((a, b) => a.d - b.d);
      for (const { c, d } of want) {
        if (pending.size >= cap) break;
        if (waitingOnScreen && d >= 1e6) break; // primero todo lo visible
        if (inflight(c.url)) continue;
        if (slots.size + pending.size >= NSLOT && free.length === 0) {
          let evictable = false;
          for (const sl of slots.values()) if (!visibleUrls.has(sl.url)) evictable = true;
          if (!evictable) {
            if (!c.skip) {
              c.skip = true;
              c.el.setAttribute("data-gl-skip", ""); // sin casilla: que se vea la <img> del DOM
              unpark(c);
            }
            continue;
          }
        }
        const id = ++reqId;
        pending.set(id, c.url);
        worker.postMessage({ id, url: c.url, size: SLOT, high: d < 1e6 });
      }
    }
    // subir al atlas de a poco: es un flujo, no una avalancha
    // (y de lo que ya llegó, primero lo que está en pantalla)
    let budget = coarse ? 1 : 2;
    if (inbox.length > 1) inbox.sort((a, b) => Number(visibleUrls.has(b.url)) - Number(visibleUrls.has(a.url)));
    if (inbox.length && visibleUrls.has(inbox[0].url)) budget += 1;
    while (budget-- > 0 && inbox.length) {
      const { url, bmp } = inbox.shift()!;
      if (slots.has(url)) {
        bmp.close();
        continue;
      }
      const idx = takeSlot();
      if (idx === null) {
        bmp.close();
        continue;
      }
      blit(idx, bmp);
      slots.set(url, { idx, url, readyAt: now, lastUsed: frame });
    }

    // instancias
    let n = 0;
    const inv = 1 / ATLAS;
    for (const c of cells) {
      if (c.w < 2 || !c.url) continue;
      const sl = slots.get(c.url);
      if (!sl) continue;
      const top = c.y + o.y;
      const lx = c.x + o.x;
      if (top + c.h < -60 || top > H + 60 || lx + c.w < -60 || lx > W + 60) continue;
      if (n >= NSLOT) break;
      sl.lastUsed = frame;
      if (!c.seenAt) c.seenAt = Math.max(now, sl.readyAt);
      if (c.skip) {
        c.skip = false;
        c.el.removeAttribute("data-gl-skip");
      }
      const target = hovered === c.el ? 1 : 0;
      c.hover += (target - c.hover) * Math.min(1, 0.14 * k);
      if (Math.abs(target - c.hover) > 0.003) busy = true;
      const ap = Math.min(1, (now - c.seenAt) / (plain ? 380 : 1500)); // el frente de brasas tarda un respiro en subir
      if (ap < 1) busy = true;
      if (ap >= 1 && !c.el.hasAttribute("data-gl-ready")) c.el.setAttribute("data-gl-ready", "");
      const q = n * 4;
      fArr.r[q] = lx;
      fArr.r[q + 1] = top;
      fArr.r[q + 2] = c.w;
      fArr.r[q + 3] = c.h;
      fArr.s[q] = (sl.idx % PER) * SLOT * inv;
      fArr.s[q + 1] = Math.floor(sl.idx / PER) * SLOT * inv;
      fArr.s[q + 2] = SLOT * inv;
      fArr.s[q + 3] = SLOT * inv;
      fArr.p[q] = c.hover;
      fArr.p[q + 1] = ap < 1 ? 1 - Math.pow(1 - ap, 2) : 1;
      fArr.p[q + 2] = c.fire;
      fArr.p[q + 3] = c.ia;
      fArr.m[q] = c.seed;
      n++;
    }
    mesh.count = n;
    aRect.needsUpdate = true;
    aSlot.needsUpdate = true;
    aParam.needsUpdate = true;
    aMore.needsUpdate = true;
    renderer.render(scene, camera);
    if (want.length || pending.size || inbox.length) busy = true;
    idle = busy ? 0 : idle + 1;
    wakeO = o;
    wakePtr = ptr.t;
    wakeHover = hovered;
  };

  const safeTick = () => {
    try {
      tick();
    } catch (err) {
      fail(`error al dibujar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  let held = false;
  const play = () => {
    if (running || failed || stopped || held) return;
    running = true;
    forceDraw = true;
    last = performance.now();
    lastO = origin();
    renderer.setAnimationLoop(safeTick);
    canvas.style.visibility = "visible";
  };
  const pause = () => {
    if (!running) return;
    running = false;
    renderer.setAnimationLoop(null);
    clearFire(fireId);
    canvas.style.visibility = "hidden";
  };

  let onScreen = true;
  const fieldIO = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen && !document.hidden) play();
    else pause();
  });
  fieldIO.observe(root);
  const onVis = () => (document.hidden || !onScreen ? pause() : play());
  document.addEventListener("visibilitychange", onVis);
  let relayout = 0;
  const remeasure = () => {
    cancelAnimationFrame(relayout);
    relayout = requestAnimationFrame(() => {
      collect();
      measured = false;
      forceDraw = true;
    });
  };
  const ro = new ResizeObserver(remeasure);
  ro.observe(root);
  // celdas que entran o salen sin cambiar el tamaño (el visor cambia de foto, filtros, etc.)
  const mo = new MutationObserver((list) => {
    if (list.some((m) => [...m.addedNodes, ...m.removedNodes].some((n) => n instanceof HTMLElement && (n.matches("[data-mem]") || n.querySelector("[data-mem]")))))
      remeasure();
  });
  mo.observe(root, { childList: true, subtree: true });
  const onResize = () => {
    resize();
    remeasure();
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("memoria:layout", remeasure);
  void document.fonts?.ready.then(remeasure);

  function stop() {
    if (stopped) return;
    stopped = true;
    pause();
    cancelAnimationFrame(relayout);
    worker.terminate();
    fieldIO.disconnect();
    ro.disconnect();
    mo.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("memoria:layout", remeasure);
    window.removeEventListener("pointermove", onPtr);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    root.removeEventListener("pointerover", onOver);
    root.removeEventListener("pointerout", onOut);
    root.removeEventListener("focusin", onOver);
    root.removeEventListener("focusout", onOut);
    for (const { bmp } of inbox) bmp.close();
    inbox.length = 0;
    for (const c of cells) {
      c.el.removeAttribute("data-gl-ready");
      c.el.removeAttribute("data-gl-skip");
      unpark(c);
    }
    delete root.dataset.glOn;
    atlas.dispose();
    fluid.dispose();
    srcTex.dispose();
    lastBmp?.close();
    geo.dispose();
    mat.dispose();
    blitMat.dispose();
    renderer.dispose();
    canvas.remove();
  }
  function fail(why: string) {
    if (failed) return;
    failed = true;
    stop();
    failCbs.forEach((cb) => cb(why));
  }

  play();
  const hold = (on: boolean) => {
    held = on;
    if (on) pause();
    else if (onScreen && !document.hidden) play();
  };
  const setPlain = (on: boolean) => {
    forceDraw = true;
    plain = on;
    uFx.value = on ? 0 : 1;
    if (on) {
      uEnergy.value = 0;
    }
  };
  return { backend, stop, onFail: (cb) => failCbs.push(cb), hold, setPlain };
}
