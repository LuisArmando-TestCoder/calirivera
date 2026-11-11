/**
 * Fondo del hero: las exposiciones de Cali pasan una tras otra y cada cambio es un «quemado al revés»
 * (three/webgpu + TSL, cae a WebGL2). Un solo quad a pantalla completa, dos texturas fijas (actual y siguiente).
 *
 * Cada cambio: un frente de brasas sube con bordes de ruido; delante queda la foto anterior, en el frente
 * se hace carbón y chispas, y detrás la nueva aparece primero gris de ceniza y después recupera el color.
 * Entre cambios: zoom lento (Ken Burns), grano de película y el puntero como calor (el aire tiembla).
 * La imagen se lleva a un rango oscuro (escenario) para que el lema, en blanco con mix-blend-mode: difference,
 * se lea siempre: sobre oscuro queda claro y sobre una brasa clara se invierte.
 */
import * as THREE from "three/webgpu";
import { clearFire, reportFire } from "@/components/fx/fire-bus";
import { createFluid } from "@/components/fx/fluid";
import {
  abs,
  max,
  min,
  clamp,
  dot,
  float,
  floor,
  fract,
  mix,
  mx_noise_float,
  pow,
  select,
  sin,
  smoothstep,
  step,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export type Slide = { src: string; w: number; h: number };
export type BurnHandle = { stop: () => void; backend: "webgpu" | "webgl2" };

const HOLD = 6500; // ms quieta
const BURN = 2600; // ms del cambio

async function decode(url: string, size: number): Promise<ImageBitmap> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const b = await r.blob();
  // estirada a un cuadrado fijo: la textura nunca cambia de tamaño (no se recrea en la GPU); el recorte
  // «cover» con el aspecto real se hace en el shader
  return createImageBitmap(b, { resizeWidth: size, resizeHeight: size, resizeQuality: "high" });
}

export async function startHeroBurn(
  host: HTMLElement,
  slides: Slide[],
  opts: { forceWebGL?: boolean; onSlide?: (i: number) => void; onReady?: () => void },
): Promise<BurnHandle> {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const SIZE = coarse ? 1024 : 1600;
  const renderer = new THREE.WebGPURenderer({ antialias: false, alpha: false, powerPreference: "high-performance", forceWebGL: Boolean(opts.forceWebGL) });
  await renderer.init();
  const backend = (renderer.backend as unknown as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "webgpu" : "webgl2";
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, coarse ? 1.25 : 1.5));
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.opacity = "0";
  host.appendChild(canvas);

  // el puntero como antorcha (Navier–Stokes, components/fx/fluid.ts)
  const fluid = createFluid(renderer, { coarse });

  const mkTex = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 2;
    const t = new THREE.Texture(c as unknown as HTMLImageElement);
    t.colorSpace = THREE.SRGBColorSpace;
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.flipY = false;
    return t;
  };
  const texA = mkTex();
  const texB = mkTex();

  const uProg = uniform(0); // 0 = solo A, 1 = solo B
  const uAspA = uniform(1);
  const uAspB = uniform(1);
  const uScreen = uniform(1);
  const uZoomA = uniform(0); // 0..1, avance del Ken Burns de cada una
  const uZoomB = uniform(0);
  const uDriftA = uniform(new THREE.Vector2(0, 0));
  const uDriftB = uniform(new THREE.Vector2(0, 0));
  const uPtr = uniform(new THREE.Vector2(-5, -5));
  const uHeat = uniform(0);
  const uRes = uniform(new THREE.Vector2(1, 1));
  const uSeed = uniform(0);

  const v: N = uv();
  const p: N = vec2(v.x, v.y); // en el QuadMesh de three, uv().y ya crece hacia abajo
  const px: N = p.mul(uRes);

  // la antorcha: el aire que mueve deforma la imagen y donde hay calor tiembla
  const fv: N = fluid.vel.xy;
  const heat: N = fluid.dye.x;
  const scorch: N = fluid.dye.y;
  // temblor del aire caliente: ondas anchas y lentas, apenas perceptibles
  const shimmer: N = vec2(sin(px.y.mul(0.02).add(time.mul(1.3))), sin(px.x.mul(0.016).add(time.mul(1.1)))).mul(heat.mul(0.0012));
  const haze: N = fv.mul(-0.000032).add(shimmer);

  const cover = (asp: N, zoom: N, drift: N, o: N = vec2(0, 0)) => {
    const r: N = uScreen.div(asp);
    const sc: N = select(r.greaterThan(1), vec2(1, float(1).div(r)), vec2(r, 1));
    const z: N = float(1).sub(zoom.mul(0.08)); // se acerca un 8 % mientras dura
    const c: N = p.add(haze).add(o).sub(0.5).mul(sc).mul(z).add(0.5).add(drift.mul(zoom));
    return c;
  };
  const grade = (c: N) => {
    // a escenario oscuro: compresión de luces, un poco de añil en las sombras, viñeta
    const lin: N = pow(c, vec3(1.3));
    const lum: N = dot(lin, vec3(0.299, 0.587, 0.114));
    // luces comprimidas con suavidad (las claras no pasan de ~0,42): el lema en difference siempre contrasta
    const toned: N = mix(lin, vec3(lum), 0.15).div(lum.mul(1.4).add(1)).mul(0.34).add(vec3(0.006, 0.008, 0.024));
    const d: N = p.sub(0.5).mul(vec2(1.2, 1));
    const vig: N = smoothstep(0.95, 0.25, dot(d, d).mul(2.2));
    return toned.mul(vig.mul(0.65).add(0.35));
  };
  const A: N = grade(texture(texA, clamp(cover(uAspA, uZoomA, uDriftA), 0.001, 0.999)).rgb);
  const B: N = grade(texture(texB, clamp(cover(uAspB, uZoomB, uDriftB), 0.001, 0.999)).rgb);

  // frente de brasas: sube de abajo hacia arriba con dos octavas de ruido
  const q: N = p.mul(vec2(uScreen, 1));
  const n1: N = mx_noise_float(vec3(q.mul(2.2), uSeed)).mul(0.5).add(0.5);
  const n2: N = mx_noise_float(vec3(q.mul(9), uSeed.add(7))).mul(0.5).add(0.5);
  const field: N = float(1).sub(p.y).mul(0.5).add(n1.mul(0.38)).add(n2.mul(0.12));
  const front: N = uProg.mul(1.36).sub(0.18);
  const d: N = field.sub(front); // < 0: ya pasó (B), > 0: todavía A
  const passed: N = smoothstep(0.012, -0.012, d);
  const band: N = smoothstep(0.045, 0.0, abs(d));
  const lumA: N = dot(A, vec3(0.3, 0.59, 0.11));
  const lumB: N = dot(B, vec3(0.3, 0.59, 0.11));
  const charred: N = mix(vec3(0.008, 0.007, 0.007), vec3(0.06, 0.055, 0.052), smoothstep(0.55, 0.95, n2)).add(lumA.mul(0.08));
  const ahead: N = mix(A, charred, smoothstep(0.16, 0.02, d)); // delante del frente: la anterior se carboniza
  const reborn: N = mix(vec3(lumB.mul(0.55)).add(0.015), B, smoothstep(0.0, 0.2, d.negate())); // detrás: ceniza → color
  const flick: N = sin(time.mul(19).add(n2.mul(31))).mul(0.2).add(0.8);
  const ember: N = mix(vec3(1.0, 0.26, 0.04), vec3(1.0, 0.82, 0.42), band.mul(band)).mul(flick).mul(1.7);
  const cell: N = floor(px.div(3));
  const rnd: N = fract(sin(dot(cell, vec2(12.9898, 78.233)).add(floor(time.mul(16)))).mul(43758.5453));
  const near: N = smoothstep(0.25, 0.0, d).mul(step(0.0, d));
  const spark: N = step(0.985, rnd).mul(near);
  const live: N = step(0.001, uProg).mul(step(uProg, 0.999)); // sin frente cuando no hay cambio
  const grain: N = fract(sin(dot(px.add(time.mul(37)), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5).mul(0.03);
  const comp: N = mix(ahead, reborn, passed)
    .add(ember.mul(band).mul(live))
    .add(vec3(1.0, 0.6, 0.22).mul(spark.mul(live).mul(1.6)));
  // ---------- el fuego hecho de la imagen ----------
  // La llama toma su color de los píxeles que quema: pigmento arrastrado río arriba de la corriente
  // (sin el oscurecido de escena, para que el tono sea el de la obra), encendido a pleno.
  const rawAt = (o: N) =>
    mix(
      texture(texA, clamp(cover(uAspA, uZoomA, uDriftA, o), 0.001, 0.999)).rgb,
      texture(texB, clamp(cover(uAspB, uZoomB, uDriftB, o), 0.001, 0.999)).rgb,
      passed,
    );
  const smear: N = fv.mul(-0.024).div(uRes); // px → uv
  const pig: N = pow(rawAt(vec2(0, 0)).add(rawAt(smear.mul(0.4))).add(rawAt(smear)).mul(1 / 3), vec3(2.2));
  const pmax: N = max(max(pig.x, pig.y), pig.z);
  const hue: N = pig.div(max(pmax, 0.035));
  const plum: N = dot(pig, vec3(0.299, 0.587, 0.114));
  // color burn literal teñido con el propio tono de la obra: se tuesta, nunca llega al negro
  const toast: N = mix(mix(vec3(1.0, 0.7, 0.44), hue.mul(0.75).add(0.2), 0.45), vec3(0.88, 0.34, 0.1), clamp(scorch.mul(0.9), 0, 0.7));
  const burned: N = vec3(1).sub(min(vec3(1), vec3(1).sub(comp.mul(1.6)).div(max(toast, vec3(0.02))))).mul(0.62);
  const scorched: N = mix(comp, mix(burned, comp, 0.34), clamp(scorch.mul(1.2), 0, 1));
  const tp: N = px.mul(0.009).add(fv.mul(0.0005));
  const tongues: N = mx_noise_float(vec3(tp.x, tp.y, time.mul(0.5))).mul(0.5).add(0.5);
  const flame: N = clamp(heat.mul(tongues.mul(0.4).add(0.7)), 0, 1.5);
  const body: N = vec3(flame.mul(1.5), flame.mul(flame).mul(0.85), flame.mul(flame).mul(flame).mul(0.38));
  const pigFire: N = hue.mul(flame.mul(1.25)).add(vec3(1.0, 0.94, 0.8).mul(flame.mul(flame).mul(flame).mul(0.3)));
  const fire: N = mix(body, pigFire, 0.72).mul(0.52); // el escenario sigue oscuro: el lema tiene que leerse
  // al enfriarse, la obra vuelve más luminosa que antes: el fuego no la borra, la templa
  const rise: N = clamp(scorch.sub(heat.mul(1.15)), 0, 1);
  const tempered: N = pig.mul(rise.mul(0.2)).add(hue.mul(plum.mul(rise).mul(0.08)));
  const col: N = scorched.add(fire).add(tempered).add(grain);

  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = vec4(col, 1);
  const quad = new THREE.QuadMesh(mat);

  // ---------- tamaño, puntero ----------
  const resize = () => {
    const r = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), true);
    uRes.value.set(r.width, r.height);
    uScreen.value = r.width / Math.max(1, r.height);
    fluid.resize(r.width, r.height);
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  let lastMove = 0;
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    uPtr.value.set((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    lastMove = performance.now();
  };
  addEventListener("pointermove", onMove, { passive: true });

  // ---------- diapositivas ----------
  const bitmaps = new Map<number, Promise<ImageBitmap>>();
  const want = (i: number) => {
    const k = ((i % slides.length) + slides.length) % slides.length;
    if (!bitmaps.has(k)) {
      const pr = decode(new URL(slides[k].src, location.href).href, SIZE);
      pr.catch(() => bitmaps.delete(k));
      bitmaps.set(k, pr);
    }
    return bitmaps.get(k)!;
  };
  const put = (t: THREE.Texture, bmp: ImageBitmap) => {
    t.image = bmp as unknown as HTMLImageElement;
    t.needsUpdate = true;
  };
  const aspect = (i: number) => slides[i % slides.length].w / Math.max(1, slides[i % slides.length].h);
  const rndDrift = () => new THREE.Vector2((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.03);

  let cur = 0;
  put(texA, await want(0));
  uAspA.value = aspect(0);
  uDriftA.value.copy(rndDrift());
  void want(1);

  let stopped = false;
  let running = false;
  let phase: "hold" | "burn" = "hold";
  let t0 = performance.now();
  let pending = false;
  let heatLvl = 0;
  let half = false;
  const sm = { x: -5, y: -5 };
  let lastT = performance.now();

  // depuración (solo desarrollo): host.__freeze(0..1) congela el cambio en ese punto
  let freeze: number | null = null;
  if (process.env.NODE_ENV !== "production") (host as unknown as { __freeze: (k: number | null) => void }).__freeze = (k) => (freeze = k);

  const tick = () => {
    const now = performance.now();
    const el = now - t0;
    heatLvl += ((now - lastMove < 900 ? 1 : 0) - heatLvl) * 0.06;
    uHeat.value = heatLvl;
    // puntero suavizado → la antorcha
    const tx = uPtr.value.x;
    const ty = uPtr.value.y;
    if (sm.x < -1) {
      sm.x = tx;
      sm.y = ty;
    }
    const prev = { x: sm.x, y: sm.y };
    sm.x += (tx - sm.x) * 0.28;
    sm.y += (ty - sm.y) * 0.28;
    // la antorcha solo existe mientras el puntero está SOBRE el escenario (no al pasar por lo de abajo)
    const inside = tx >= 0 && tx <= 1 && ty >= 0 && ty <= 1;
    const fire = fluid.step((now - lastT) / 1000, sm, prev, inside && now - lastMove < 1200 ? 1 : 0);
    // lo que se oye: el fuego del puntero + el frente de brasas cuando cambia la exposición
    const front = phase === "burn" ? Math.sin(Math.PI * uProg.value) : 0;
    const e = fluid.energy;
    // el inicio suena MUY bajito: menos de la mitad que el resto, y con una curva que hace que la cola se
    // apague antes que la llama que se ve (sin escalón: sigue siendo una curva continua)
    const h = Math.min(1, e.heat + front * 0.18);
    reportFire("hero", {
      heat: Math.pow(h, 1.7) * 0.4,
      flow: Math.max(e.flow, front * 0.25) * 0.5,
      swirl: Math.max(e.swirl, front * 0.3),
      pan: front > e.heat ? 0 : e.pan,
    });
    lastT = now;
    if (phase === "hold") {
      uZoomA.value = Math.min(1, el / (HOLD + BURN));
      if (el > HOLD && !pending && slides.length > 1) {
        pending = true;
        const next = (cur + 1) % slides.length;
        want(next)
          .then((bmp) => {
            if (stopped) return;
            put(texB, bmp);
            uAspB.value = aspect(next);
            uDriftB.value.copy(rndDrift());
            uZoomB.value = 0;
            uSeed.value = Math.random() * 50;
            phase = "burn";
            t0 = performance.now();
            opts.onSlide?.(next);
          })
          .catch(() => {
            pending = false;
            t0 = performance.now() - HOLD / 2; // reintentar más tarde
          });
      }
    } else {
      const k = freeze ?? Math.min(1, el / BURN);
      uProg.value = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease in-out
      uZoomA.value = Math.min(1, (HOLD + el) / (HOLD + BURN));
      uZoomB.value = 0;
      if (k >= 1) {
        // la nueva pasa a ser la actual
        cur = (cur + 1) % slides.length;
        void want(cur).then((bmp) => {
          if (stopped) return;
          put(texA, bmp);
          uAspA.value = uAspB.value;
          uDriftA.value.copy(uDriftB.value);
          uZoomA.value = 0;
          uProg.value = 0;
        });
        phase = "hold";
        pending = false;
        t0 = now;
        void want(cur + 1);
      }
    }
    // entre cambios y sin fuego solo queda el acercamiento lento: con la mitad de los cuadros se ve igual
    half = !half;
    if (phase === "hold" && !fire && half) return;
    quad.render(renderer);
  };

  const play = () => {
    if (running || stopped) return;
    running = true;
    renderer.setAnimationLoop(tick);
  };
  const pause = () => {
    if (!running) return;
    running = false;
    clearFire("hero");
    renderer.setAnimationLoop(null);
  };
  let onScreen = true;
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen && !document.hidden) play();
    else pause();
  });
  io.observe(host);
  const onVis = () => (document.hidden || !onScreen ? pause() : play());
  document.addEventListener("visibilitychange", onVis);

  play();
  requestAnimationFrame(() => {
    canvas.style.opacity = "1";
    opts.onReady?.();
  });

  return {
    backend,
    stop() {
      if (stopped) return;
      stopped = true;
      pause();
      io.disconnect();
      ro.disconnect();
      removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      void Promise.allSettled([...bitmaps.values()]).then((rs) => rs.forEach((r) => r.status === "fulfilled" && r.value.close()));
      fluid.dispose();
      texA.dispose();
      texB.dispose();
      mat.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
