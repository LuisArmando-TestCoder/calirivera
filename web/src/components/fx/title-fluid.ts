/**
 * Los títulos, pasados a la GPU para jugar con ellos: el puntero es la misma antorcha de Navier–Stokes del resto
 * del sitio. El aire que mueve empuja y deshilacha las letras, el calor las enciende con su propio color, y
 * cuando el aire se calma vuelven a su lugar, intactas.
 *
 * Hay UN solo lienzo para todos, del tamaño de la pantalla: el aire no tiene bordes, así que las letras pueden
 * volar fuera de su título y el humo de uno llega al de al lado. Cada título entra al lienzo cuando el puntero
 * lo toca. Solo existe mientras se juega: se desarma a los pocos segundos de quietud. Los títulos reales
 * siguen en la página (lectores de pantalla, buscadores, selección); se vuelven transparentes mientras la GPU
 * dibuja su copia exacta, palabra por palabra, con su misma tipografía y color.
 */
import * as THREE from "three/webgpu";
import { clamp, float, max, mix, mx_noise_float, screenUV, sin, texture, time, uniform, vec2, vec3, vec4 } from "three/tsl";
import { clearFire, reportFire } from "./fire-bus";
import { createFluid } from "./fluid";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Copia un título al lienzo 2D compartido: cada palabra donde el navegador la puso. */
function rasterize(g: CanvasRenderingContext2D, el: HTMLElement, box: DOMRect) {
  g.textBaseline = "alphabetic";
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const text = node.textContent ?? "";
    if (!parent || !text.trim()) continue;
    const cs = getComputedStyle(parent);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    g.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    (g as unknown as { letterSpacing: string }).letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
    (g as unknown as { fontStretch: string }).fontStretch = "normal";
    const stroke = parseFloat(cs.webkitTextStrokeWidth || "0") > 0;
    g.fillStyle = cs.color === "rgba(0, 0, 0, 0)" ? cs.webkitTextStrokeColor || "#fff" : cs.color;
    g.strokeStyle = cs.webkitTextStrokeColor || cs.color;
    g.lineWidth = parseFloat(cs.webkitTextStrokeWidth || "1");
    const upper = cs.textTransform === "uppercase";
    const ascent = g.measureText("Hg").fontBoundingBoxAscent;
    const descent = g.measureText("Hg").fontBoundingBoxDescent;
    // palabra por palabra: así cada una cae en su renglón real
    const re = /\S+/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const r = range.getClientRects()[0];
      if (!r || r.width < 0.5) continue;
      // el rectángulo de un texto mide el área de la tipografía (ascendente + descendente), centrada en él
      const base = r.top + (r.height - (ascent + descent)) / 2 + ascent - box.top;
      const word = upper ? m[0].toUpperCase() : m[0];
      if (stroke && cs.color === "rgba(0, 0, 0, 0)") g.strokeText(word, r.left - box.left, base);
      else g.fillText(word, r.left - box.left, base);
    }
  }
}

/** El modo de mezcla con que el título se pinta sobre la página (el lema del inicio usa «difference»). */
function blendOf(el: HTMLElement): string {
  for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
    const b = getComputedStyle(n).mixBlendMode;
    if (b && b !== "normal") return b;
  }
  return "normal";
}

export type TitleFx = {
  stop: () => void;
  poke: (e: PointerEvent) => void;
  /** suma un título al lienzo (si ya está, no hace nada) */
  add: (el: HTMLElement) => void;
  /** ¿este título cabe en el lienzo actual y se mezcla igual? Si no, hay que armar uno nuevo. */
  fits: (el: HTMLElement) => boolean;
};

export async function startTitleFluid(first: HTMLElement, onIdle: () => void): Promise<TitleFx> {
  // el lienzo cubre la pantalla tal como está ahora, y viaja con la página al desplazarse
  const box = new DOMRect(0, 0, document.documentElement.clientWidth, innerHeight);
  const origin = { x: scrollX, y: scrollY };
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const blend = blendOf(first);

  const renderer = new THREE.WebGPURenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
  await renderer.init();
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(dpr);
  renderer.setSize(box.width, box.height, false);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    left: `${origin.x}px`,
    top: `${origin.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    pointerEvents: "none",
    zIndex: "5",
    mixBlendMode: blend,
  });

  // todas las letras de todos los títulos tocados, en una sola textura
  const sheet = document.createElement("canvas");
  sheet.width = Math.ceil(box.width * dpr);
  sheet.height = Math.ceil(box.height * dpr);
  const g = sheet.getContext("2d")!;
  g.scale(dpr, dpr);
  const tex = new THREE.CanvasTexture(sheet);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = false;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;

  // título → su opacidad original; `pending` son los que todavía no se escondieron (falta dibujar su copia)
  const held = new Map<HTMLElement, [string, string]>();
  let pending: HTMLElement[] = [];
  /** dónde está el lienzo en la pantalla ahora (se movió con el scroll) */
  const here = () => new DOMRect(origin.x - scrollX, origin.y - scrollY, box.width, box.height);
  const fits = (el: HTMLElement) => {
    if (held.has(el)) return true;
    const r = el.getBoundingClientRect();
    const b = here();
    return blendOf(el) === blend && r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
  };
  const add = (el: HTMLElement) => {
    if (held.has(el)) return;
    held.set(el, [el.style.getPropertyValue("opacity"), el.style.getPropertyPriority("opacity")]);
    rasterize(g, el, here());
    tex.needsUpdate = true;
    pending.push(el);
  };
  add(first);

  const fluid = createFluid(renderer); // grilla fina: ahora cubre toda la pantalla
  fluid.resize(box.width, box.height);
  const uRes = uniform(new THREE.Vector2(box.width, box.height));

  const uv: N = screenUV;
  const fv: N = fluid.vel.xy;
  const heat: N = fluid.dye.x;
  const scorch: N = fluid.dye.y;
  const px: N = uv.mul(uRes);
  // el aire se lleva las letras (contra la corriente) y el calor las hace ondular despacio
  const wob: N = vec2(sin(px.y.mul(0.03).add(time.mul(1.6))), sin(px.x.mul(0.025).add(time.mul(1.3)))).mul(heat.mul(2.6)).div(uRes);
  // en píxeles (no en proporción al lienzo): las letras vuelan lo mismo en cualquier tamaño de pantalla
  const off: N = fv.mul(-0.3).div(uRes).add(wob);
  const at = (k: number): N => texture(tex, clamp(uv.add(off.mul(k)), 0.001, 0.999));
  // tres muestras a lo largo de la corriente: la letra se estira en hilos, y los colores se separan apenas
  const a: N = at(1);
  const b: N = at(0.55);
  const c: N = at(0.2);
  const alpha: N = max(a.a.mul(0.5), max(b.a.mul(0.75), c.a));
  const ink: N = vec3(a.r, b.g, c.b).div(max(alpha, 0.001)).mul(alpha.greaterThan(0.001).select(float(1), float(0)));
  const base: N = mix(c.rgb.div(max(c.a, 0.001)), ink, clamp(heat.mul(2).add(scorch), 0, 1));
  // se encienden con su propio color; el núcleo, casi blanco
  const tp: N = px.mul(0.02).add(fv.mul(0.0008));
  const tongues: N = mx_noise_float(vec3(tp.x, tp.y, time.mul(0.6))).mul(0.5).add(0.5);
  const flame: N = clamp(heat.mul(tongues.mul(0.5).add(0.65)), 0, 1.3);
  const lit: N = base.add(base.mul(flame.mul(1.1))).add(vec3(1.0, 0.82, 0.5).mul(flame.mul(flame).mul(0.5)));
  // un resplandor tenue alrededor: el título «echa» su color al aire
  const glow: N = flame.mul(0.22).mul(float(1).sub(alpha));
  const mat = new THREE.NodeMaterial();
  mat.transparent = true;
  mat.fragmentNode = vec4(lit.mul(alpha).add(base.mul(glow)), clamp(alpha.add(glow), 0, 1));
  const quad = new THREE.QuadMesh(mat);

  document.body.appendChild(canvas);

  const ptr = { x: -5, y: -5, t: 0 };
  const sm = { x: -5, y: -5 };
  // la antorcha solo enciende cerca de un título del lienzo: el resto de la pantalla no arde ni suena
  const REACH = 90;
  let near = false;
  const poke = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ptr.x = (e.clientX - r.left) / r.width;
    ptr.y = (e.clientY - r.top) / r.height;
    near = false;
    for (const el of held.keys()) {
      const b = el.getBoundingClientRect();
      if (e.clientX > b.left - REACH && e.clientX < b.right + REACH && e.clientY > b.top - REACH && e.clientY < b.bottom + REACH) {
        near = true;
        break;
      }
    }
    if (near) ptr.t = performance.now();
  };

  let last = performance.now();
  let calm = 0;
  let stopped = false;
  const tick = () => {
    const now = performance.now();
    if (sm.x < -1) Object.assign(sm, ptr);
    const prev = { ...sm };
    sm.x += (ptr.x - sm.x) * 0.3;
    sm.y += (ptr.y - sm.y) * 0.3;
    const inside = ptr.x > -0.05 && ptr.x < 1.05 && ptr.y > -0.05 && ptr.y < 1.05;
    const awake = fluid.step((now - last) / 1000, sm, prev, inside && near && now - ptr.t < 900 ? 1 : 0);
    last = now;
    const e = fluid.energy;
    reportFire("titulo", { heat: e.heat * 0.6, flow: e.flow * 0.6, swirl: e.swirl, pan: (canvas.getBoundingClientRect().left + sm.x * box.width) / innerWidth * 2 - 1 });
    quad.render(renderer);
    if (pending.length) {
      // recién ahora, con la copia ya dibujada, se esconde el original: sin parpadeo
      for (const el of pending) el.style.setProperty("opacity", "0", "important");
      pending = [];
    }
    // cuando el aire se calmó del todo, el título vuelve a ser el de siempre
    calm = awake ? 0 : calm + 1;
    if (calm > 20) onIdle();
  };
  renderer.setAnimationLoop(tick);

  return {
    poke,
    add,
    fits,
    stop() {
      if (stopped) return;
      stopped = true;
      renderer.setAnimationLoop(null);
      clearFire("titulo");
      for (const [el, [v, prio]] of held) {
        if (v) el.style.setProperty("opacity", v, prio);
        else el.style.removeProperty("opacity");
      }
      held.clear();
      fluid.dispose();
      tex.dispose();
      mat.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
