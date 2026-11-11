/**
 * Capa WebGPU de «Memoria» (three/webgpu + TSL). Si el navegador no tiene WebGPU,
 * WebGPURenderer usa su backend WebGL2. Se carga con import() solo en /memoria, en un momento ocioso.
 *
 * Planos sincronizados con el DOM: cada <img> visible de la trama tiene un plano en un canvas fijo
 * (aria-hidden, sin eventos). El DOM sigue siendo la verdad: layout, foco, alt, enlaces.
 * La imagen DOM se oculta (opacity) solo cuando su plano ya se dibujó.
 *
 * Efecto: la foto aparece desvaída (sepia, grano, viñeta, leve desenfoque, trama de tela).
 * El puntero deja una estela (textura 2D que decae y se difunde) y donde pasa, el color vuelve
 * como tinte que entra en la tela. Hover/foco revela la foto entera.
 */
import * as THREE from "three/webgpu";
import { dot, float, fract, length, min, mix, sin, smoothstep, texture, time, uniform, uv, vec2, vec3 } from "three/tsl";

export type GLHandle = { backend: "webgpu" | "webgl2"; stop: () => void; onFail: (cb: (why: string) => void) => void };

const makeUniforms = (fire: boolean) => ({
  rect: uniform(new THREE.Vector4(0, 0, 1, 1)),
  cover: uniform(new THREE.Vector4(1, 1, 0, 0)),
  hover: uniform(0),
  appear: uniform(0),
  texel: uniform(new THREE.Vector2(1 / 512, 1 / 512)),
  fire: uniform(fire ? 1 : 0),
});

type Entry = {
  mesh: THREE.Mesh;
  tex: THREE.Texture;
  mat: THREE.MeshBasicNodeMaterial;
  u: ReturnType<typeof makeUniforms>;
  img: HTMLImageElement;
  cell: HTMLElement;
  bmp: ImageBitmap;
  hoverT: number;
  lastSeen: number;
  drawn: boolean;
};

const MAX_TEXTURES = 72;

export async function startMemoriaGL(root: HTMLElement, layer: HTMLElement, opts: { forceWebGL?: boolean } = {}): Promise<GLHandle> {
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

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
  const geo = new THREE.PlaneGeometry(1, 1);
  const uRes = uniform(new THREE.Vector2(1, 1));

  // ---------- estela del puntero: canvas 2D chico que decae y se difunde ----------
  const tc = document.createElement("canvas");
  const tctx = tc.getContext("2d", { willReadFrequently: false })!;
  // tamaño fijo (WebGL no deja cambiar el tamaño de una textura ya subida): se estira a la pantalla
  tc.width = 256;
  tc.height = 160;
  const trailTex = new THREE.CanvasTexture(tc);
  trailTex.flipY = false;
  trailTex.generateMipmaps = false;
  trailTex.minFilter = THREE.LinearFilter;
  trailTex.magFilter = THREE.LinearFilter;
  trailTex.colorSpace = THREE.NoColorSpace;

  let W = 0;
  let H = 0;
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
  };
  resize();
  tctx.fillStyle = "#000";
  tctx.fillRect(0, 0, tc.width, tc.height);

  const ptr = { x: -1, y: -1, sx: -1, sy: -1, active: 0, down: false, speed: 0 };
  const onPtr = (e: PointerEvent) => {
    ptr.x = e.clientX / W;
    ptr.y = e.clientY / H;
    if (ptr.sx < 0) {
      ptr.sx = ptr.x;
      ptr.sy = ptr.y;
    }
    ptr.active = performance.now();
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

  const paintTrail = (now: number) => {
    const w = tc.width;
    const h = tc.height;
    tctx.globalCompositeOperation = "source-over";
    tctx.filter = "none";
    tctx.globalAlpha = 1;
    tctx.fillStyle = `rgba(0,0,0,${coarse ? 0.025 : 0.04})`; // decae: el color se vuelve a ir, despacio
    tctx.fillRect(0, 0, w, h);
    tctx.filter = "blur(1.2px)"; // se difunde como tinte en tela
    tctx.drawImage(tc, 0, 0);
    tctx.filter = "none";
    const live = now - ptr.active < 1400 || ptr.down;
    if (!live || ptr.x < 0) return;
    const k = 0.2; // inercia
    const px = ptr.sx;
    const py = ptr.sy;
    ptr.sx += (ptr.x - ptr.sx) * k;
    ptr.sy += (ptr.y - ptr.sy) * k;
    const v = Math.hypot((ptr.sx - px) * W, (ptr.sy - py) * H);
    ptr.speed += (v - ptr.speed) * 0.2;
    const r = (coarse ? 0.11 : 0.075) * w + Math.min(18, ptr.speed * 0.25);
    const x = ptr.sx * w;
    const y = ptr.sy * h;
    // el canvas se estira a la pantalla: se compensa para que el halo sea redondo
    const sy = (h / w) * (W / Math.max(1, H));
    tctx.save();
    tctx.translate(x, y);
    tctx.scale(1, sy);
    tctx.translate(-x, -y);
    const g = tctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.55, "rgba(255,255,255,0.22)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    tctx.globalCompositeOperation = "lighter";
    tctx.fillStyle = g;
    tctx.beginPath();
    tctx.arc(x, y, r, 0, Math.PI * 2);
    tctx.fill();
    tctx.restore();
    tctx.globalCompositeOperation = "source-over";
  };

  // ---------- material: recuerdo desvaído que el puntero colorea ----------
  const makeEntry = (img: HTMLImageElement, cell: HTMLElement, bmp: ImageBitmap): Entry => {
    // ImageBitmap: tamaño natural (un <img> en el layout reporta su ancho CSS y WebGL lo sube mal)
    const tex = new THREE.Texture(bmp as unknown as HTMLImageElement);
    tex.flipY = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const u = makeUniforms(cell.hasAttribute("data-fire"));
    const vUv = uv();
    // ImageBitmap sin flip: v crece hacia abajo en la textura
    const cuv = vec2(vUv.x, float(1).sub(vUv.y)).mul(u.cover.xy).add(u.cover.zw);
    const col = texture(tex, cuv).rgb;
    const t = u.texel.mul(2.2);
    const tap = (ox: number, oy: number) => texture(tex, cuv.add(vec2(t.x.mul(ox), t.y.mul(oy)))).rgb;
    const blur = col.add(tap(1, 1)).add(tap(-1, 1)).add(tap(1, -1)).add(tap(-1, -1)).mul(0.2);
    const g = dot(blur, vec3(0.299, 0.587, 0.114));
    const sepia = vec3(g.mul(1.06).add(0.03), g.mul(0.95).add(0.018), g.mul(0.78).add(0.008));
    const paper = vec3(0.86, 0.83, 0.77);
    // posición en pantalla (origen arriba-izquierda) → estela y grano en píxeles
    const sp = vec2(u.rect.x.add(vUv.x.mul(u.rect.z)), u.rect.y.add(float(1).sub(vUv.y).mul(u.rect.w)));
    const px = sp.mul(uRes);
    const grain = fract(sin(dot(px.add(time.mul(41.0)), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(0.075);
    const weave = sin(px.x.mul(1.05)).mul(sin(px.y.mul(1.05))).mul(0.5).add(0.5); // hilos de la trama
    const vig = smoothstep(0.78, 0.22, length(vUv.sub(0.5))).mul(0.28).add(0.72);
    const faded = mix(sepia, paper, 0.2).mul(vig).add(grain).add(weave.sub(0.5).mul(0.03));
    const trail = texture(trailTex, sp).r;
    const reveal = smoothstep(0.1, 0.62, trail.add(weave.mul(0.14)).add(u.hover)).min(1);
    const base = mix(faded, col, reveal);
    // 2017: borde de brasa (solo recuerdos marcados lostInFire)
    const edge = min(min(vUv.x, float(1).sub(vUv.x)), min(vUv.y, float(1).sub(vUv.y)));
    const ember = smoothstep(0.06, 0.0, edge.add(grain.mul(0.25))).mul(u.fire);
    const color = mix(base, vec3(0.75, 0.22, 0.12), ember.mul(0.85));

    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
    mat.colorNode = color;
    mat.opacityNode = u.appear;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, tex, mat, u, img, cell, bmp, hoverT: 0, lastSeen: 0, drawn: false };
  };

  const entries = new Map<HTMLImageElement, Entry>();
  const pending = new Set<HTMLImageElement>();
  const near = new Set<HTMLImageElement>();
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        const img = e.target as HTMLImageElement;
        if (e.isIntersecting) near.add(img);
        else near.delete(img);
      }
    },
    { rootMargin: "40% 0px 40% 0px" },
  );
  const observeAll = () => root.querySelectorAll<HTMLImageElement>("[data-mem] img").forEach((img) => io.observe(img));
  observeAll();

  // hover / foco → revela la foto entera
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

  const dispose = (e: Entry) => {
    scene.remove(e.mesh);
    e.mat.dispose();
    e.tex.dispose();
    e.bmp.close();
    e.cell.removeAttribute("data-gl-ready");
    entries.delete(e.img);
  };

  // ---------- ciclo ----------
  let frame = 0;
  let failed = false;
  const failCbs: ((why: string) => void)[] = [];
  const dts: number[] = [];
  let last = performance.now();
  let running = false;
  let stopped = false;

  const tick = () => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    frame++;
    if (frame > 20 && frame < 200) dts.push(dt);
    if (frame === 200) {
      dts.sort((a, b) => a - b);
      const p75 = dts[Math.floor(dts.length * 0.75)];
      if (p75 > 45) return fail(`lento (p75 ${Math.round(p75)} ms por cuadro)`); // el equipo no da: volvemos al modo DOM
    }
    paintTrail(now);
    trailTex.needsUpdate = true;

    for (const img of near) {
      if (!img.complete || !img.naturalWidth) continue;
      const cell = img.closest<HTMLElement>("[data-mem]");
      if (!cell || cell.hidden) continue;
      if (!entries.has(img) && !pending.has(img)) {
        if (entries.size >= MAX_TEXTURES) {
          const old = [...entries.values()].filter((e) => !near.has(e.img)).sort((a, b) => a.lastSeen - b.lastSeen)[0];
          if (old) dispose(old);
          else continue;
        }
        if (pending.size >= 4) continue; // pocas decodificaciones a la vez
        pending.add(img);
        const max = coarse ? 768 : 1024; // presupuesto de memoria de GPU por foto
        const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        createImageBitmap(img, {
          resizeWidth: Math.max(1, Math.round(img.naturalWidth * scale)),
          resizeHeight: Math.max(1, Math.round(img.naturalHeight * scale)),
          resizeQuality: "high",
        })
          .then((bmp) => {
            pending.delete(img);
            if (failed || stopped) return bmp.close();
            entries.set(img, makeEntry(img, cell, bmp));
          })
          .catch(() => pending.delete(img));
      }
    }
    for (const e of entries.values()) {
      const r = e.img.getBoundingClientRect();
      const vis = near.has(e.img) && !e.cell.hidden && r.width > 1 && r.bottom > -20 && r.top < H + 20;
      e.mesh.visible = vis;
      if (!vis) continue;
      e.lastSeen = frame;
      e.mesh.position.set(r.left + r.width / 2, -(r.top + r.height / 2), 0);
      e.mesh.scale.set(r.width, r.height, 1);
      e.u.rect.value.set(r.left / W, r.top / H, r.width / W, r.height / H);
      // object-fit: cover
      const ia = e.bmp.width / e.bmp.height;
      const ra = r.width / r.height;
      if (ia > ra) e.u.cover.value.set(ra / ia, 1, (1 - ra / ia) / 2, 0);
      else e.u.cover.value.set(1, ia / ra, 0, (1 - ia / ra) / 2);
      e.u.texel.value.set(1 / e.bmp.width, 1 / e.bmp.height);
      const target = hovered === e.cell ? 1 : 0;
      e.hoverT += (target - e.hoverT) * 0.12;
      e.u.hover.value = e.hoverT;
      e.u.appear.value = Math.min(1, e.u.appear.value + 0.06);
      if (!e.drawn && e.u.appear.value > 0.95) {
        e.drawn = true;
        e.cell.setAttribute("data-gl-ready", "");
      }
    }
    renderer.render(scene, camera);
  };

  const safeTick = () => {
    try {
      tick();
    } catch (err) {
      fail(`error al dibujar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  const play = () => {
    if (running || failed) return;
    running = true;
    last = performance.now();
    renderer.setAnimationLoop(safeTick);
    canvas.style.visibility = "visible";
  };
  const pause = () => {
    if (!running) return;
    running = false;
    renderer.setAnimationLoop(null);
    canvas.style.visibility = "hidden";
  };

  // pausar fuera de pantalla y con la pestaña oculta
  let onScreen = true;
  const fieldIO = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen && !document.hidden) play();
    else pause();
  });
  fieldIO.observe(root);
  const onVis = () => (document.hidden || !onScreen ? pause() : play());
  document.addEventListener("visibilitychange", onVis);
  const onResize = () => resize();
  window.addEventListener("resize", onResize);
  const onLayout = () => observeAll();
  window.addEventListener("memoria:layout", onLayout);

  function stop() {
    if (stopped) return;
    stopped = true;
    pause();
    io.disconnect();
    fieldIO.disconnect();
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("memoria:layout", onLayout);
    window.removeEventListener("pointermove", onPtr);
    window.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    root.removeEventListener("pointerover", onOver);
    root.removeEventListener("pointerout", onOut);
    root.removeEventListener("focusin", onOver);
    root.removeEventListener("focusout", onOut);
    for (const e of [...entries.values()]) dispose(e);
    trailTex.dispose();
    geo.dispose();
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
  return { backend, stop, onFail: (cb) => failCbs.push(cb) };
}
