/**
 * Fluido de Navier–Stokes en la GPU (TSL; corre igual en WebGPU y WebGL2), para que el puntero sea una antorcha:
 * mueve el aire, deja calor que sube y se enrosca, y una quemadura que tarda en enfriarse.
 *
 * Grilla de velocidad chica (≈ 1/6 de la pantalla) y otra más fina para el «tinte»:
 *   r = calor (la llama, se va en ~1,5 s)   g = quemadura (el chamuscado, se va en ~4 s)
 * Cada cuadro: rotor → advección de la velocidad (+ empuje del puntero, + flotación del calor, + confinamiento
 * de vorticidad para que la llama haga lenguas) → divergencia → presión (Jacobi) → resta del gradiente
 * (incompresible) → advección del tinte (+ calor nuevo a lo largo del trazo, no solo en el punto).
 * Esquema de unidades como el de Pavel Dobryakov (WebGL-Fluid-Simulation): velocidad en texeles por segundo.
 *
 * Todo en coordenadas de screenUV (0..1, y hacia abajo): quien lo usa muestrea `vel` y `dye` con screenUV.
 * Cuando el puntero se queda quieto y el tinte se apagó, la simulación se duerme (cero pasadas).
 */
import * as THREE from "three/webgpu";
import { abs, clamp, dot, exp, float, max, mix, normalize, screenUV, texture, uniform, vec2, vec4 } from "three/tsl";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

export type Fluid = {
  /** velocidad (xy, texeles/s) en screenUV */
  vel: N;
  /** tinte: r = calor, g = quemadura */
  dye: N;
  /**
   * Un paso. ptr/prev en 0..1 (y hacia abajo); strength 0..1 (0 = el puntero no está).
   * Devuelve false si está dormida (no hizo nada).
   */
  step: (dt: number, ptr: { x: number; y: number }, prev: { x: number; y: number }, strength: number) => boolean;
  resize: (w: number, h: number) => void;
  dispose: () => void;
  /**
   * Espejo en CPU del estado del fluido, con las mismas constantes de la simulación (lo que se deposita, cómo
   * decae): calor presente, velocidad del aire, cuánto se enrosca y dónde. Leer la textura de la GPU en cada
   * cuadro costaría más que la simulación; esto la sigue de cerca sin costo, y es lo que alimenta el sonido.
   */
  energy: { heat: number; flow: number; swirl: number; pan: number };
};

export function createFluid(renderer: THREE.WebGPURenderer, opts: { coarse?: boolean; quality?: "low" | "high" } = {}): Fluid {
  const low = opts.coarse || opts.quality === "low";
  const SIM = low ? 96 : 144; // lado corto de la grilla de velocidad
  const DYE = low ? 256 : 448; // lado corto del tinte
  const ITER = low ? 8 : 14;

  const mk = () =>
    new THREE.RenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
  const velA = mk();
  const velB = mk();
  const curlT = mk();
  const divT = mk();
  const pA = mk();
  const pB = mk();
  const dyeA = mk();
  const dyeB = mk();
  const all = [velA, velB, curlT, divT, pA, pB, dyeA, dyeB];

  const uDt = uniform(1 / 60);
  const uTexel = uniform(new THREE.Vector2(1 / 160, 1 / 90)); // grilla de velocidad
  const uAspect = uniform(16 / 9);
  const uPtr = uniform(new THREE.Vector2(-5, -5));
  const uPrev = uniform(new THREE.Vector2(-5, -5));
  const uForce = uniform(new THREE.Vector2(0, 0)); // empuje (texeles/s) a lo largo del trazo
  const uAmt = uniform(0); // cuánto calor deposita
  const uRadius = uniform(low ? 0.0012 : 0.0008);

  const uv: N = screenUV;
  const T = (tex: THREE.Texture, o: N = vec2(0, 0)) => texture(tex, uv.add(o));
  const L: N = vec2(uTexel.x.negate(), 0);
  const R: N = vec2(uTexel.x, 0);
  const B: N = vec2(0, uTexel.y.negate());
  const Tp: N = vec2(0, uTexel.y);

  // Distancia al trazo (cápsula prev→ptr): un movimiento rápido deja una estela continua, no puntos.
  const pa: N = uv.sub(uPrev);
  const ba: N = uPtr.sub(uPrev);
  const h: N = clamp(dot(pa, ba).div(max(dot(ba, ba), 1e-8)), 0, 1);
  const dd: N = pa.sub(ba.mul(h)).mul(vec2(uAspect, 1));
  const g: N = exp(dot(dd, dd).div(uRadius).negate());

  const pass = (frag: N) => {
    const m = new THREE.NodeMaterial();
    m.fragmentNode = frag;
    m.depthTest = false;
    m.depthWrite = false;
    return new THREE.QuadMesh(m);
  };

  // 1) rotor
  const curlQ = pass(
    (() => {
      const l: N = T(velA.texture, L).y;
      const r: N = T(velA.texture, R).y;
      const b: N = T(velA.texture, B).x;
      const t: N = T(velA.texture, Tp).x;
      return vec4(r.sub(l).sub(t).add(b).mul(0.5), 0, 0, 1);
    })(),
  );

  // 2) advección de la velocidad + puntero + flotación + vorticidad
  const advVelQ = pass(
    (() => {
      const v: N = T(velA.texture).xy;
      const back: N = uv.sub(v.mul(uDt).mul(uTexel));
      let nv: N = texture(velA.texture, back).xy.div(float(1).add(uDt.mul(1.5))); // se calma pronto: sin corrientes que sigan solas
      // vorticidad: empuja hacia donde el giro es más fuerte (lenguas de fuego)
      const cl: N = abs(T(curlT.texture, L).x);
      const cr: N = abs(T(curlT.texture, R).x);
      const cb: N = abs(T(curlT.texture, B).x);
      const ct: N = abs(T(curlT.texture, Tp).x);
      const c: N = T(curlT.texture).x;
      const grad: N = vec2(ct.sub(cb), cr.sub(cl));
      const nrm: N = normalize(grad.add(vec2(1e-5, 1e-5)));
      const vort: N = nrm.mul(c).mul(vec2(1, -1)).mul(low ? 10 : 14); // remolinos suaves, sin nervio
      nv = nv.add(vort.mul(uDt));
      // el calor sube (y hacia abajo en pantalla = arriba es negativo)
      const heat: N = T(dyeA.texture).x;
      nv = nv.add(vec2(0, heat.mul(-38)).mul(uDt)); // el calor sube apenas: una deriva, no columnas de aire
      // el puntero empuja el aire a lo largo de su trazo
      nv = nv.add(uForce.mul(g));
      const cv: N = clamp(nv, -2400, 2400);
      return vec4(cv.x, cv.y, 0, 1);
    })(),
  );

  // 3) divergencia
  const divQ = pass(
    (() => {
      const l: N = T(velB.texture, L).x;
      const r: N = T(velB.texture, R).x;
      const b: N = T(velB.texture, B).y;
      const t: N = T(velB.texture, Tp).y;
      return vec4(r.sub(l).add(t).sub(b).mul(0.5), 0, 0, 1);
    })(),
  );

  // 4) presión: arranca de la del cuadro anterior, atenuada; Jacobi ida y vuelta
  const decayQ = pass(vec4(T(pA.texture).x.mul(0.8), 0, 0, 1));
  const jac = (src: THREE.RenderTarget) =>
    pass(
      vec4(
        T(src.texture, L)
          .x.add(T(src.texture, R).x)
          .add(T(src.texture, B).x)
          .add(T(src.texture, Tp).x)
          .sub(T(divT.texture).x)
          .mul(0.25),
        0,
        0,
        1,
      ),
    );
  const jacAB = jac(pA); // lee A, escribe B
  const jacBA = jac(pB); // lee B, escribe A

  // 5) restar el gradiente → incompresible (queda en velA)
  const gradQ = pass(
    (() => {
      const l: N = T(pA.texture, L).x;
      const r: N = T(pA.texture, R).x;
      const b: N = T(pA.texture, B).x;
      const t: N = T(pA.texture, Tp).x;
      return vec4(T(velB.texture).xy.sub(vec2(r.sub(l), t.sub(b))), 0, 1);
    })(),
  );

  // 6) tinte: se lo lleva el aire; el calor se apaga antes que la quemadura (la cola larga y suave)
  const advDyeQ = pass(
    (() => {
      const v: N = T(velA.texture).xy;
      const back: N = uv.sub(v.mul(uDt).mul(uTexel));
      const d: N = texture(dyeA.texture, back);
      const heat: N = d.x.div(float(1).add(uDt.mul(0.5))); // la llama: ~2 s
      const scorch: N = d.y.div(float(1).add(uDt.mul(0.16))); // el chamuscado: ~6 s, se aclara muy despacio
      const add: N = g.mul(uAmt);
      // el calor alimenta la quemadura: donde más ardió, más tarda en enfriarse
      const nh: N = clamp(heat.add(add), 0, 1.6);
      const ns: N = clamp(mix(scorch, max(scorch, nh.mul(0.85)), uDt.mul(3)).add(add.mul(0.35)), 0, 1);
      return vec4(nh, ns, 0, 1);
    })(),
  );
  const copyDyeQ = pass(T(dyeB.texture));

  let simW = 2;
  let simH = 2;
  const resize = (w: number, h: number) => {
    const asp = Math.max(0.2, w / Math.max(1, h));
    const fit = (short: number) => (asp >= 1 ? [Math.round(short * asp), short] : [short, Math.round(short / asp)]);
    [simW, simH] = fit(SIM);
    const [dw, dh] = fit(DYE);
    for (const rt of [velA, velB, curlT, divT, pA, pB]) rt.setSize(simW, simH);
    dyeA.setSize(dw, dh);
    dyeB.setSize(dw, dh);
    uTexel.value.set(1 / simW, 1 / simH);
    uAspect.value = asp;
  };

  const draw = (q: THREE.QuadMesh, rt: THREE.RenderTarget) => {
    renderer.setRenderTarget(rt);
    q.render(renderer);
  };

  const energy = { heat: 0, flow: 0, swirl: 0, pan: 0 };
  let dirX = 0;
  let dirY = 0;
  let awake = 0; // segundos que faltan para dormir
  const step: Fluid["step"] = (dt, ptr, prev, strength) => {
    dt = Math.min(1 / 30, Math.max(1 / 240, dt));
    const dx = ptr.x - prev.x;
    const dy = ptr.y - prev.y;
    const moving = strength > 0 && (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5);
    if (moving) awake = 14; // la cola completa
    if (awake <= 0) {
      energy.heat = energy.flow = energy.swirl = 0;
      return false;
    }
    awake -= dt;
    uDt.value = dt;
    uPtr.value.set(ptr.x, ptr.y);
    uPrev.value.set(prev.x, prev.y);
    // fuerza en texeles/s: lo que se movió el puntero, en la grilla, por cuadro
    const k = strength * (moving ? 1 : 0);
    uForce.value.set(dx * simW * 9 * k, dy * simH * 9 * k);
    const speed = Math.hypot(dx * uAspect.value, dy);
    uAmt.value = k * Math.min(0.55, 0.08 + speed * 6); // una antorcha, no un incendio

    // espejo en CPU (mismas constantes que el tinte: se deposita uAmt, el calor decae a razón de 0,5/s)
    energy.heat = Math.min(1, energy.heat / (1 + dt * 0.5) / (1 + dt * 1.1) + uAmt.value * 0.55);
    const sp = Math.min(1, speed * 26);
    energy.flow += (sp * k - energy.flow) * 0.25;
    // enroscarse: cuánto cambia la dirección del trazo, pesado por la velocidad
    const len = Math.hypot(dx, dy);
    let turn = 0;
    if (len > 1e-5) {
      const nx = dx / len;
      const ny = dy / len;
      turn = Math.abs(nx * dirY - ny * dirX);
      dirX += (nx - dirX) * 0.35;
      dirY += (ny - dirY) * 0.35;
    }
    energy.swirl += (Math.min(1, turn * (0.4 + sp) * 1.6) - energy.swirl) * 0.2;
    energy.pan = Math.max(-1, Math.min(1, ptr.x * 2 - 1));
    const prevRT = renderer.getRenderTarget();
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    draw(curlQ, curlT);
    draw(advVelQ, velB);
    draw(divQ, divT);
    draw(decayQ, pB);
    // decay escribió en B: arrancar Jacobi desde B
    for (let i = 0; i < ITER; i++) draw(i % 2 === 0 ? jacBA : jacAB, i % 2 === 0 ? pA : pB);
    if (ITER % 2 === 0) draw(jacBA, pA); // la última escribió en B: una más para terminar en A
    draw(gradQ, velA);
    draw(advDyeQ, dyeB);
    draw(copyDyeQ, dyeA);
    renderer.autoClear = ac;
    renderer.setRenderTarget(prevRT);
    return true;
  };

  return {
    vel: texture(velA.texture, screenUV),
    dye: texture(dyeA.texture, screenUV),
    step,
    resize,
    energy,
    dispose() {
      for (const rt of all) rt.dispose();
    },
  };
}
