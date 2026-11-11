/**
 * El catálogo como libro de verdad (three/webgpu + TSL; cae a WebGL2). Un solo canvas.
 *
 * Llega cerrado sobre la mesa y hecho ceniza: un frente de brasas lo restaura de abajo hacia arriba mientras
 * suben chispas; después la tapa gira sobre el lomo y se abre la primera doble página.
 * Las hojas se doblan al pasar (el borde de afuera se atrasa, como el papel), hay sombra en el canal del lomo,
 * la hoja que pasa proyecta sombra sobre la de abajo, el grosor de hojas se reparte entre los dos lados,
 * tapas duras con el color de la portada y sombra de contacto en la mesa.
 *
 * Hojas: la hoja i tiene adelante la página 2i+1 y atrás la 2i+2 (la hoja 0 es la portada).
 * Con s hojas pasadas: izquierda = página 2s, derecha = página 2s+1.
 * Las páginas se dibujan con pdf.js en un canvas y suben como textura; se precargan las vecinas.
 */
import * as THREE from "three/webgpu";
import {
  abs,
  clamp,
  cos,
  dot,
  exp,
  float,
  fract,
  frontFacing,
  hash,
  instanceIndex,
  max,
  mix,
  mx_noise_float,
  normalize,
  positionGeometry,
  positionWorld,
  pow,
  select,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import type { Doc } from "./pdfjs-types";

// Los tipos de TSL siguen el tipo exacto de cada nodo (float/vec3/convert…); en las funciones que arman
// el papel según el lado se usan nodos sin tipar para no pelear con el compilador.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export type BookHandle = {
  next: () => void;
  prev: () => void;
  /** acercar (>1) o alejar (<1); 0 = volver a ver el libro entero */
  zoomBy: (factor: number) => void;
  destroy: () => void;
};
type State = { left: number | null; right: number | null };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function startBook(
  host: HTMLElement,
  doc: Doc,
  opts: { aspect: number; onState: (s: State) => void; onFail: (why: string) => void },
): Promise<BookHandle> {
  const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
  await renderer.init();
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  host.appendChild(canvas);

  const n = doc.numPages;
  const LEAVES = Math.ceil(n / 2);
  const H = 1; // alto de página (unidades de mundo)
  const W = H / opts.aspect; // ancho de página
  const EPS = Math.min(0.0035, 0.12 / LEAVES); // grosor de una hoja
  const BOARD = 0.012; // grosor de la tapa dura

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);

  // ---------- uniformes compartidos ----------
  const uAppear = uniform(0); // 0 ceniza → 1 restaurado
  const uLight = uniform(new THREE.Vector3(-0.35, 0.45, 0.82).normalize());

  // Quemado al revés sobre todo el libro (posición de mundo): sube desde abajo, con bordes de ruido
  const burn = (col: N): N => {
    const p = positionWorld.xy.div(H);
    const nA = mx_noise_float(vec3(p.mul(5), 1.7)).mul(0.5).add(0.5);
    const nB = mx_noise_float(vec3(p.mul(17), 4.1)).mul(0.5).add(0.5);
    const field = p.y.add(0.55).mul(0.6).add(nA.mul(0.3)).add(nB.mul(0.1));
    const front = uAppear.mul(1.35).sub(0.15);
    const restored = smoothstep(front.add(0.012), front.sub(0.012), field);
    const band = smoothstep(0.07, 0.0, abs(field.sub(front)));
    const lum = dot(col, vec3(0.299, 0.587, 0.114));
    const ash = mix(vec3(0.012, 0.011, 0.01), vec3(0.07, 0.064, 0.06), smoothstep(0.6, 0.95, nB)).add(lum.mul(0.05));
    const flick = sin(time.mul(17).add(nB.mul(30))).mul(0.22).add(0.78);
    const ember = mix(vec3(1, 0.28, 0.04), vec3(1, 0.85, 0.4), band.mul(band)).mul(flick).mul(2.4);
    return mix(ash, col, restored).add(ember.mul(band));
  };
  const grain = fract(sin(dot(positionWorld.xy.mul(900), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(0.035);

  // ---------- texturas de página ----------
  const blank = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 4;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f4f1ea";
    g.fillRect(0, 0, 4, 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const texCache = new Map<number, THREE.CanvasTexture>();
  const pending = new Set<number>();
  const order: number[] = [];
  const TEX_W = Math.min(1600, Math.round(Math.max(900, host.clientWidth * 0.5 * Math.min(devicePixelRatio || 1, 2))));
  let coverColor = new THREE.Color("#3a2c22");
  let disposed = false;

  const renderPage = async (p: number) => {
    if (p < 1 || p > n || texCache.has(p) || pending.has(p)) return;
    pending.add(p);
    try {
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: TEX_W / base.width });
      const c = document.createElement("canvas");
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      await page.render({ canvas: c, viewport: vp, background: "#fff" }).promise;
      page.cleanup();
      if (disposed) return;
      if (p === 1) {
        // color de la tapa dura: el promedio de la portada, un poco más oscuro
        const g = document.createElement("canvas").getContext("2d")!;
        g.canvas.width = g.canvas.height = 1;
        g.drawImage(c, 0, 0, 1, 1);
        const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
        coverColor = new THREE.Color(`rgb(${r},${gg},${b})`).multiplyScalar(0.55);
        boardMat.color = coverColor;
        uBoard.value.copy(coverColor);
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      texCache.set(p, t);
      order.push(p);
      // memoria: no más de 14 páginas en la GPU
      while (order.length > 14) {
        const old = order.shift()!;
        if (Math.abs(old - 2 * flipped) > 6) {
          texCache.get(old)?.dispose();
          texCache.delete(old);
        } else order.push(old);
        if (order.every((o) => Math.abs(o - 2 * flipped) <= 6)) break;
      }
    } catch {
      /* página que no se pudo dibujar: queda papel en blanco */
    } finally {
      pending.delete(p);
    }
  };
  const tex = (p: number | null) => (p && texCache.get(p)) || blank;
  const prefetch = () => {
    const c = 2 * flipped;
    for (const p of [c + 1, c, c + 2, c + 3, c - 1, c + 4, c + 5, c - 2]) void renderPage(p);
  };

  // ---------- material de papel ----------
  // shade: luz lambert + canal del lomo + sombra de la hoja que pasa (uShadowU: dónde cae, uShadowK: cuánto)
  type PaperOpts = { front: N; back?: N; side: "right" | "left" | "leaf" };
  const uTheta = uniform(0); // ángulo de la hoja que pasa (0 = derecha, π = izquierda)
  const uBend = uniform(0); // cuánto se atrasa el borde
  const uLeafZ = uniform(0);
  const uShadowR = uniform(0); // sombra sobre la página derecha
  const uShadowL = uniform(0);
  const uShadowPos = uniform(1); // proyección del borde de la hoja (0 lomo → 1 afuera)

  // Cómo se dobla la hoja depende de DÓNDE se la toma y de cómo se mueve:
  //   uGrab   punto por donde se la agarra (u: del lomo al borde, v: de abajo a arriba)
  //   uBend   cuánto se atrasa (+) o se adelanta (−) el borde: gravedad + velocidad del giro
  //   uTwist  la esquina lejana al dedo llega después: la hoja se tuerce en diagonal
  //   uLocal  1 = solo se levanta cerca del dedo (la esquina que se asoma al acercar el puntero)
  const uGrab = uniform(new THREE.Vector2(0.9, 0.5));
  const uTwist = uniform(0);
  const uLocal = uniform(0);
  const uRz = uniform(0); // alto del bloque de hojas quietas a la derecha y a la izquierda
  const uLz = uniform(0);
  const leafAngle = (u: N, v: N): N => {
    // tomada cerca del borde, la hoja hace un arco largo; cerca del lomo, se quiebra tarde
    const p: N = mix(float(2.5), float(1.25), uGrab.x);
    const dv: N = abs(v.sub(uGrab.y));
    const near: N = mix(float(1), exp(dv.mul(dv).div(0.05).negate()), uLocal);
    const lag: N = uBend.mul(pow(u, p)).mul(near).add(uTwist.mul(u).mul(pow(dv, 1.3)));
    // la hoja nunca gira más allá de quedar acostada de un lado o del otro
    return clamp(uTheta.sub(lag.mul(sin(uTheta))), 0, Math.PI);
  };

  const paper = ({ front, back, side }: PaperOpts) => {
    const u: N = uv().x;
    let col: N;
    let shade: N;
    if (side === "leaf") {
      const a = leafAngle(u, uv().y);
      const nrm = normalize(vec3(sin(a).negate(), 0, cos(a)));
      const lam = max(dot(select(frontFacing, nrm, nrm.negate()), uLight), 0);
      const fc = front.rgb;
      const bc = back!.rgb;
      col = select(frontFacing, fc, bc);
      // el lomo oscurece; la curva brilla un poco donde la luz le pega de frente
      shade = lam.mul(0.5).add(0.55).mul(mix(float(0.72), float(1), smoothstep(0, 0.14, u)));
    } else {
      col = front.rgb;
      const d: N = side === "right" ? u : float(1).sub(u); // distancia al lomo
      const gutter = mix(float(0.7), float(1), smoothstep(0, 0.13, d));
      const sk: N = side === "right" ? uShadowR : uShadowL;
      const shadow = float(1).sub(sk.mul(exp(pow(d.sub(uShadowPos), 2).div(0.012).negate())).mul(0.42)).sub(sk.mul(smoothstep(uShadowPos, uShadowPos.sub(0.25), d)).mul(0.12));
      shade = dot(vec3(0, 0, 1), uLight).mul(0.45).add(0.6).mul(gutter).mul(shadow);
    }
    const warm = vec3(1.0, 0.985, 0.955);
    const m = new THREE.MeshBasicNodeMaterial({ side: side === "leaf" ? THREE.DoubleSide : THREE.FrontSide });
    m.colorNode = burn(col.mul(warm).mul(shade).add(grain));
    return m;
  };

  // ---------- geometría ----------
  const pageGeo = (x0: number) => {
    const g = new THREE.PlaneGeometry(W, H, 48, 1);
    g.translate(x0 + W / 2, 0, 0);
    return g;
  };
  const rightTex = texture(blank);
  const leftTex = texture(blank);
  const leafFront = texture(blank);
  const leafBack = texture(blank, vec2(float(1).sub(uv().x), uv().y)); // la cara de atrás se lee espejada

  const right = new THREE.Mesh(pageGeo(0), paper({ front: rightTex, side: "right" }));
  const left = new THREE.Mesh(pageGeo(-W), paper({ front: leftTex, side: "left" }));
  const leafGeo = new THREE.PlaneGeometry(W, H, 48, 18); // también se dobla a lo alto (torsión)
  leafGeo.translate(W / 2, 0, 0);
  const leafMat = paper({ front: leafFront, back: leafBack, side: "leaf" });
  // la hoja que pasa: se curva en el vértice
  {
    // El papel no se estira: la posición es la suma de tramos cortos, cada uno con su ángulo (una curva de
    // largo constante desde el lomo), no un plano girado.
    const u: N = positionGeometry.x.div(W);
    const v: N = positionGeometry.y.div(H).add(0.5);
    const STEPS = 10;
    let px: N = float(0);
    let pz: N = float(0);
    for (let k = 0; k < STEPS; k++) {
      const a: N = leafAngle(u.mul((k + 0.5) / STEPS), v);
      px = px.add(cos(a));
      pz = pz.add(sin(a));
    }
    const seg: N = u.mul(W / STEPS);
    px = px.mul(seg);
    pz = pz.mul(seg).add(uLeafZ);
    // Choque con lo que está quieto: ningún punto de la hoja puede meterse en el bloque de hojas de su lado
    // (ni en la página de abajo). Donde tocaría, apoya.
    const floor: N = select(px.greaterThanEqual(0), uRz, uLz).add(0.0007);
    leafMat.positionNode = vec3(px, positionGeometry.y, max(pz, floor));
  }
  const leaf = new THREE.Mesh(leafGeo, leafMat);
  leaf.frustumCulled = false;

  // canto de las hojas (rayitas de papel) y tapas duras
  const uBoard = uniform(new THREE.Color("#3a2c22"));
  const edgeMat = new THREE.MeshBasicNodeMaterial();
  {
    const stripes = sin(positionWorld.z.mul(2600)).mul(0.5).add(0.5);
    edgeMat.colorNode = burn(mix(vec3(0.78, 0.75, 0.69), vec3(0.93, 0.91, 0.86), stripes).mul(0.92));
  }
  const boardMat = new THREE.MeshBasicNodeMaterial({ color: coverColor });
  {
    const cloth = mx_noise_float(vec3(positionWorld.xy.mul(160), 2)).mul(0.06);
    const rim = smoothstep(0.0, 0.02, abs(positionWorld.z)).mul(0.25); // canto más claro
    boardMat.colorNode = burn((uBoard as N).mul(float(0.85).add(cloth)).add(rim.mul(0.12)));
  }
  const stackR = new THREE.Mesh(new THREE.BoxGeometry(W, H, 1), edgeMat);
  const stackL = new THREE.Mesh(new THREE.BoxGeometry(W, H, 1), edgeMat);
  const boardR = new THREE.Mesh(new THREE.BoxGeometry(W * 1.03, H * 1.035, BOARD), boardMat);
  const boardL = new THREE.Mesh(new THREE.BoxGeometry(W * 1.03, H * 1.035, BOARD), boardMat);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(BOARD * 2, H * 1.035, BOARD), boardMat);
  stackR.position.x = W / 2;
  stackL.position.x = -W / 2;
  boardR.position.set(W / 2 + W * 0.015, 0, -BOARD / 2);
  boardL.position.set(-W / 2 - W * 0.015, 0, -BOARD / 2);
  spine.position.set(0, 0, -BOARD / 2);

  // sombra de contacto en la mesa
  const shadowMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  {
    const q = uv().sub(0.5).mul(vec2(2.0, 2.0));
    const d = dot(q, q);
    shadowMat.colorNode = vec3(0, 0, 0);
    shadowMat.opacityNode = exp(d.mul(-3.2)).mul(0.55).mul(uAppear.mul(0.7).add(0.3));
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 2.9, H * 1.6), shadowMat);
  shadow.position.z = -BOARD - 0.002;

  // chispas: suben mientras el libro vuelve de la ceniza (y algunas, poquitas, después)
  const uSparks = uniform(1);
  const sparkMat = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  {
    const i = instanceIndex.toFloat();
    const r1 = hash(i);
    const r2 = hash(i.add(17.3));
    const r3 = hash(i.add(91.7));
    const life = fract(time.mul(r3.mul(0.25).add(0.18)).add(r1));
    const x = r1.sub(0.5).mul(W * 2.2).add(sin(time.mul(1.3).add(i)).mul(0.03));
    const y = r2.sub(0.5).mul(H * 1.05).add(life.mul(0.12));
    const z = life.mul(0.55).add(0.02);
    sparkMat.positionNode = vec3(x, y, z);
    sparkMat.scaleNode = float(0.006).mul(float(1).sub(life)).add(0.002);
    sparkMat.colorNode = vec4(mix(vec3(1, 0.85, 0.45), vec3(1, 0.3, 0.05), life), 1);
    sparkMat.opacityNode = smoothstep(0, 0.1, life).mul(float(1).sub(life)).mul(uSparks);
  }
  const sparks = new THREE.Sprite(sparkMat);
  sparks.count = 260;
  sparks.frustumCulled = false;

  const book = new THREE.Group();
  book.add(shadow, boardR, boardL, spine, stackR, stackL, right, left, leaf, sparks);
  scene.add(book);

  // ---------- estado ----------
  let flipped = 0; // hojas pasadas
  type Flip = { leafIndex: number; from: number; to: number; t0: number; dur: number; drag?: boolean };
  let flip: Flip | null = null;
  let dragTheta = 0;
  let hoverPeel = 0;
  let flipDir: 1 | -1 = 1; // hacia dónde viaja la hoja que se mueve
  let omega = 0; // velocidad angular de la hoja (rad/s), suavizada
  let prevTh = 0;
  let bendT = performance.now();
  let peelTarget = 0;
  let camX = W / 2; // el libro cerrado se centra en la tapa; abierto, en el lomo
  // la entrada espera a la portada: mientras tanto el libro es ceniza con chispas (máx. 4 s)
  const created = performance.now();
  let t0 = 0;
  const INTRO = 1900;
  let introDone = false;

  const leftPage = () => (flipped > 0 ? 2 * flipped : null);
  const rightPage = () => (2 * flipped + 1 <= n ? 2 * flipped + 1 : null);
  const report = () => opts.onState({ left: leftPage(), right: rightPage() });

  // por dónde se tomó la hoja (sin puntero: del borde, a media altura)
  const grab = { u: 0.9, v: 0.5, ptr: false };
  const startFlip = (dir: 1 | -1, dur = 900, fromPointer = false) => {
    if (flip) return;
    if (!fromPointer) Object.assign(grab, { u: 0.9, v: 0.5, ptr: false });
    if (dir === 1 && flipped >= LEAVES) return;
    if (dir === -1 && flipped <= 0) return;
    const leafIndex = dir === 1 ? flipped : flipped - 1;
    flipDir = dir;
    flip = { leafIndex, from: dir === 1 ? 0 : Math.PI, to: dir === 1 ? Math.PI : 0, t0: performance.now(), dur };
    if (dir === -1) flipped -= 1; // la hoja vuelve: lo de abajo ya es la doble página anterior
    prefetch();
    rustle();
  };
  // el papel suena (si el sitio tiene el sonido encendido) y el teléfono da un toque al caer la hoja
  const coarse = matchMedia("(pointer: coarse)").matches;
  const rustle = () => window.dispatchEvent(new CustomEvent("sfx", { detail: "page" }));
  const thud = () => {
    if (coarse) navigator.vibrate?.(8);
  };

  // ---------- lupa: acercarse a leer ----------
  // zoom 1 = el libro entero. Acercado, arrastrar mueve la vista (no pasa hojas) y el doble toque vuelve.
  const view = { z: 1, x: 0, y: 0, tz: 1, tx: 0, ty: 0 };
  const MAXZ = 3.4;
  const clampView = () => {
    view.tz = Math.max(1, Math.min(MAXZ, view.tz));
    const rx = W * (1 - 1 / view.tz);
    const ry = (H / 2) * (1 - 1 / view.tz) * 1.15;
    view.tx = Math.max(-rx, Math.min(rx, view.tx));
    view.ty = Math.max(-ry, Math.min(ry, view.ty));
    if (view.tz <= 1.001) view.tx = view.ty = 0;
  };
  const zoomTo = (z: number, at?: { x: number; y: number }) => {
    const before = view.tz;
    view.tz = z;
    clampView();
    if (at && view.tz > 1) {
      // el punto tocado se queda bajo el dedo
      const k = 1 - before / view.tz;
      view.tx += (at.x - camX - view.tx) * k;
      view.ty += (at.y - view.ty) * k;
    }
    clampView();
  };

  // ---------- puntero: tocar, arrastrar la esquina, levantarla al acercarse ----------
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const toBook = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  };
  type Down = { x: number; dir: 1 | -1; moved: number; sx: number; sy: number; pan: boolean; canFlip: boolean };
  let down: Down | null = null;
  const pts = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  let lastTap = { t: 0, x: 0, y: 0 };
  let vel = 0; // rad/s del arrastre, para el «latigazo» al soltar
  let lastTheta = 0;
  let lastT = 0;
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  let peelV = 0.1;
  const zoomed = () => view.tz > 1.04;
  const bookAt = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
    const at = ray.ray.intersectPlane(plane, hit);
    return at ? { x: at.x, y: at.y } : undefined;
  };

  const cancelDragFlip = () => {
    if (!flip?.drag) return;
    const to = flip.leafIndex < flipped ? Math.PI : 0; // vuelve a donde estaba
    flip = { leafIndex: flip.leafIndex, from: dragTheta, to, t0: performance.now(), dur: 260 };
  };
  const onDown = (e: PointerEvent) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // puntero que ya no existe (o sintético): se sigue sin captura
    }
    if (pts.size === 2) {
      // dos dedos: pellizco para acercar
      const [a, b2] = [...pts.values()];
      pinch = Math.hypot(a.x - b2.x, a.y - b2.y);
      cancelDragFlip();
      down = null;
      return;
    }
    if (!introDone) return;
    const p = toBook(e);
    if (!p) return;
    const inside = Math.abs(p.y) <= H / 2 + 0.05 && Math.abs(p.x) <= W + 0.05;
    const dir: 1 | -1 = p.x >= 0 ? 1 : -1;
    const canFlip = inside && !flip && !zoomed() && !((dir === 1 && flipped >= LEAVES) || (dir === -1 && flipped <= 0));
    down = { x: p.x, dir, moved: 0, sx: e.clientX, sy: e.clientY, pan: zoomed(), canFlip };
    if (canFlip) Object.assign(grab, { u: Math.min(1, Math.max(0.15, Math.abs(p.x) / W)), v: Math.min(1, Math.max(0, p.y / H + 0.5)), ptr: true });
    vel = 0;
    lastT = performance.now();
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent) => {
    const prev = pts.get(e.pointerId);
    if (prev) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b2] = [...pts.values()];
      const d = Math.hypot(a.x - b2.x, a.y - b2.y);
      if (pinch > 0) zoomTo(view.tz * (d / pinch), bookAt((a.x + b2.x) / 2, (a.y + b2.y) / 2));
      pinch = d;
      return;
    }
    const p = toBook(e);
    // el libro se inclina apenas hacia el puntero: es un objeto, no una imagen
    if (e.pointerType === "mouse") {
      const r = canvas.getBoundingClientRect();
      tilt.ty = (((e.clientX - r.left) / r.width) * 2 - 1) * 0.045;
      tilt.tx = (((e.clientY - r.top) / r.height) * 2 - 1) * 0.03;
    }
    if (down && prev) {
      const travelled = Math.hypot(e.clientX - down.sx, e.clientY - down.sy);
      if (down.pan) {
        // acercado: arrastrar recorre la página
        const r = canvas.getBoundingClientRect();
        const unit = (2 * W * 1.45) / view.z / r.width; // unidades del libro por px, aprox.
        view.tx -= (e.clientX - prev.x) * unit;
        view.ty += (e.clientY - prev.y) * unit;
        clampView();
        view.x = view.tx;
        view.y = view.ty;
        down.moved = Math.max(down.moved, travelled);
        return;
      }
      if (p && down.canFlip) {
        down.moved = Math.max(down.moved, Math.abs(p.x - down.x));
        if (down.moved > 0.02) {
          // arrastrar: el ángulo sigue al dedo (de la esquina hacia el lomo y más allá)
          const frac = down.dir === 1 ? (W - p.x) / (2 * W) : (p.x + W) / (2 * W);
          dragTheta = Math.max(0.02, Math.min(Math.PI - 0.02, frac * Math.PI));
          if (!flip) {
            flip = { leafIndex: down.dir === 1 ? flipped : flipped - 1, from: 0, to: 0, t0: 0, dur: 0, drag: true };
            flipDir = down.dir;
            if (down.dir === -1) flipped -= 1;
            prefetch();
            rustle();
            lastTheta = down.dir === -1 ? Math.PI - dragTheta : dragTheta;
          }
          if (down.dir === -1) dragTheta = Math.PI - dragTheta;
          const now = performance.now();
          const dt = Math.max(1, now - lastT);
          vel = vel * 0.6 + ((dragTheta - lastTheta) / dt) * 1000 * 0.4;
          lastTheta = dragTheta;
          lastT = now;
        }
      }
      return;
    }
    // sin tocar: la esquina se levanta y el cursor dice qué va a pasar
    const inside = p && introDone && Math.abs(p.y) < H / 2 && Math.abs(p.x) < W;
    peelTarget = p && inside && !flip && !zoomed() && p.x > W * 0.78 && flipped < LEAVES ? 1 : 0;
    if (p && peelTarget) peelV = Math.min(1, Math.max(0, p.y / H + 0.5));
    const edge = p && inside && Math.abs(p.x) > W * 0.55;
    canvas.style.cursor = !inside ? "default" : zoomed() ? "grab" : edge ? "pointer" : "zoom-in";
  };
  const onUp = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (pts.size < 2) pinch = 0;
    canvas.style.cursor = zoomed() ? "grab" : "default";
    if (!down) return;
    const d = down;
    down = null;
    if (flip?.drag) {
      // soltar: un latigazo la termina en su dirección; si no, cae para el lado más cercano
      const th = dragTheta;
      const to = vel > 1.6 ? Math.PI : vel < -1.6 ? 0 : th > Math.PI / 2 ? Math.PI : 0;
      const rest = Math.abs(to - th) / Math.PI;
      flip = { leafIndex: flip.leafIndex, from: th, to, t0: performance.now(), dur: Math.max(220, (420 + 380 * rest) / (1 + Math.min(1.5, Math.abs(vel) / 4))) };
      return;
    }
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 8) return; // fue un arrastre (recorrer la página), no un toque
    const p = toBook(e);
    const now = performance.now();
    const dbl = now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
    lastTap = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    if (dbl) {
      // doble toque: acercarse a ese punto, o volver al libro entero
      if (zoomed()) zoomTo(1);
      else if (p) zoomTo(2.3, { x: p.x, y: p.y });
      return;
    }
    // un toque en la franja de afuera de una página la pasa; el centro se reserva para el doble toque
    if (d.canFlip && p && Math.abs(p.x) > W * 0.55) {
      startFlip(d.dir, 900, true);
      lastTap.t = 0; // ese toque ya pasó la hoja: no cuenta como primera mitad de un doble toque
    }
  };
  // rueda: con Ctrl o pellizco del trackpad acerca; sola, pasa de hoja (o recorre la página si está acercado)
  let wheelAcc = 0;
  let wheelAt = 0;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) return zoomTo(view.tz * Math.exp(-e.deltaY * 0.012), bookAt(e.clientX, e.clientY));
    if (zoomed()) {
      view.tx += e.deltaX * 0.0016;
      view.ty -= e.deltaY * 0.0016;
      return clampView();
    }
    const now = performance.now();
    if (now - wheelAt < 650) return; // una hoja por gesto
    const dlt = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    wheelAcc = Math.sign(dlt) === Math.sign(wheelAcc) ? wheelAcc + dlt : dlt;
    if (Math.abs(wheelAcc) > 60 && introDone) {
      startFlip(wheelAcc > 0 ? 1 : -1);
      wheelAcc = 0;
      wheelAt = now;
    }
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("pointerleave", () => {
    peelTarget = 0;
    tilt.tx = tilt.ty = 0;
  });

  // ---------- tamaño ----------
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    // que la doble página entre con aire, tanto a lo ancho como a lo alto
    const fov = (camera.fov * Math.PI) / 180;
    // aire alrededor: el libro es un objeto sobre la mesa, no una pantalla llena
    const needH = (H * 1.55) / (2 * Math.tan(fov / 2));
    const needW = (W * 2 * 1.45) / (2 * Math.tan(fov / 2) * camera.aspect);
    const dist = Math.max(needH, needW);
    // acercado: la cámara baja hacia la página y mira más de frente (se lee mejor)
    const d = dist / view.z;
    const lean = 0.42 / (1 + (view.z - 1) * 0.9);
    camera.position.set(camX + view.x, view.y - d * lean, d * 0.92);
    camera.lookAt(camX + view.x, view.y - 0.01, 0);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  // ---------- ciclo ----------
  prefetch();
  report();
  let failed = false;
  const tick = () => {
    const now = performance.now();
    // entrada: de la ceniza, después la tapa se abre sola
    if (!t0 && (texCache.has(1) || now - created > 4000)) t0 = now;
    const k = t0 ? Math.min(1, (now - t0) / INTRO) : 0;
    uAppear.value = k;
    uSparks.value = 1 - k * 0.85;
    if (k >= 1 && !introDone) {
      introDone = true;
      if (n > 1) startFlip(1, 1300);
    }

    let theta = 0;
    if (flip) {
      if (flip.drag) theta = dragTheta;
      else {
        const t = Math.min(1, (now - flip.t0) / flip.dur);
        theta = flip.from + (flip.to - flip.from) * ease(t);
        if (t >= 1) {
          if (flip.to === Math.PI) flipped = flip.leafIndex + 1;
          else flipped = flip.leafIndex;
          flip = null;
          thud();
          report();
          prefetch();
        }
      }
    }
    // la hoja de arriba se levanta un poquito cuando el puntero está en la esquina
    hoverPeel += (peelTarget - hoverPeel) * 0.12;
    const peeling = !flip && hoverPeel > 0.01 && flipped < LEAVES;

    // páginas planas y hoja en movimiento
    const restR = flip ? (flip.leafIndex + 1) * 2 + 1 : rightPage();
    const restL = flip ? (flip.leafIndex > 0 ? flip.leafIndex * 2 : null) : leftPage();
    rightTex.value = tex(restR && restR <= n ? restR : null);
    leftTex.value = tex(restL);
    right.visible = !!(restR && restR <= n) || (!flip && rightPage() !== null);
    left.visible = restL !== null;
    if (flip || peeling) {
      const li = flip ? flip.leafIndex : flipped;
      leafFront.value = tex(2 * li + 1);
      leafBack.value = tex(2 * li + 2 <= n ? 2 * li + 2 : null);
      leaf.visible = true;
      const th = flip ? theta : hoverPeel * 0.2;
      uTheta.value = th;
      if (flip) {
        // la curva sale del movimiento: el borde se atrasa según la velocidad del giro, y el peso del papel
        // lo vence hacia el lado en que está (derecha antes de la vertical, izquierda después)
        const dtS = Math.max(0.004, (now - bendT) / 1000);
        omega += ((th - prevTh) / dtS - omega) * 0.35;
        const speed = Math.max(-1, Math.min(1, omega * 0.17));
        const weight = Math.cos(th);
        // tomada con el dedo, la hoja además se arquea entre el lomo y la mano, hacia el lado del que viene
        const held = flip.drag ? 0.5 * flipDir : 0;
        uBend.value += (0.4 * weight + 0.85 * speed + held - uBend.value) * 0.22;
        const twist = (grab.ptr ? 0.75 : 0.2) * (0.45 * weight + 0.7 * speed) + held * 0.9;
        uTwist.value += (twist - uTwist.value) * 0.22;
        uLocal.value += (0 - uLocal.value) * 0.3;
        uGrab.value.set(grab.u, grab.v);
      } else {
        // la esquina se asoma donde está el puntero: el borde se adelanta (se levanta), solo cerca del dedo
        uBend.value = -2.4;
        uTwist.value = 0;
        uLocal.value = 1;
        uGrab.value.set(0.95, peelV);
        omega = 0;
      }
      prevTh = th;
      bendT = now;
      const lstack = (flip ? flip.leafIndex : flipped) * EPS;
      const rstack = (LEAVES - (flip ? flip.leafIndex + 1 : flipped + 1)) * EPS;
      uLeafZ.value = rstack + (lstack - rstack) * (th / Math.PI) + 0.0008;
      // sombra sobre la página que queda debajo
      const sideR = th < Math.PI / 2;
      uShadowR.value = sideR ? Math.sin(th) : 0;
      uShadowL.value = sideR ? 0 : Math.sin(th);
      uShadowPos.value = Math.abs(Math.cos(th));
      if (peeling) right.visible = rightPage() !== null && 2 * flipped + 3 <= n; // debajo de la esquina: la página siguiente
      if (peeling) rightTex.value = tex(2 * flipped + 3 <= n ? 2 * flipped + 3 : null);
    } else {
      leaf.visible = false;
      uShadowR.value = uShadowL.value = 0;
    }

    // grosor de hojas a cada lado
    const lCount = flip ? flip.leafIndex : flipped;
    const rCount = LEAVES - lCount - (flip || peeling ? 1 : 0);
    const lz = Math.max(EPS, lCount * EPS);
    const rz = Math.max(EPS, rCount * EPS);
    // los bloques quietos contra los que choca la hoja: al caer, la hoja pasa a ser parte del bloque de ese
    // lado (lCount/rCount cambian) y la siguiente es la que se dobla
    uLz.value = lz;
    uRz.value = rz;
    stackR.scale.z = rz;
    stackR.position.z = rz / 2 - 0.0005;
    stackL.scale.z = lz;
    stackL.position.z = lz / 2 - 0.0005;
    stackL.visible = boardL.visible = lCount > 0 || (flip !== null && theta > Math.PI / 2);
    stackR.visible = rCount > 0;
    right.position.z = rz + 0.0002;
    left.position.z = lz + 0.0002;

    // cámara: cerrado mira la tapa; abierto, el lomo
    const open = flipped > 0 || (flip !== null && theta > 0.3);
    const target = open ? 0 : W / 2;
    let moved = false;
    if (Math.abs(target - camX) > 0.0005) {
      camX += (target - camX) * 0.06;
      moved = true;
    }
    // lupa e inclinación, con inercia
    if (Math.abs(view.tz - view.z) > 0.001 || Math.abs(view.tx - view.x) > 0.0005 || Math.abs(view.ty - view.y) > 0.0005) {
      view.z += (view.tz - view.z) * 0.16;
      view.x += (view.tx - view.x) * 0.2;
      view.y += (view.ty - view.y) * 0.2;
      moved = true;
    }
    if (moved) resize();
    const calm = zoomed() || flip?.drag ? 0 : 1; // quieto mientras se lee de cerca o se arrastra una hoja
    tilt.x += (tilt.tx * calm - tilt.x) * 0.06;
    tilt.y += (tilt.ty * calm - tilt.y) * 0.06;
    book.rotation.set(tilt.x, tilt.y, 0);
    try {
      renderer.render(scene, camera);
    } catch (err) {
      if (!failed) {
        failed = true;
        opts.onFail(String(err));
      }
    }
  };
  renderer.setAnimationLoop(tick);

  return {
    next: () => (introDone ? startFlip(1) : undefined),
    prev: () => (introDone ? startFlip(-1) : undefined),
    zoomBy: (f) => zoomTo(f === 0 ? 1 : view.tz * f),
    destroy: () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      for (const t of texCache.values()) t.dispose();
      blank.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
      renderer.dispose();
      canvas.remove();
    },
  };
}
