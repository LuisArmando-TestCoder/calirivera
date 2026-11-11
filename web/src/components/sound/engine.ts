/**
 * Diseño de sonido del sitio: detalles mínimos, casi inaudibles, hechos de los mismos materiales que la obra
 * (tela, papel, madera, brasa). No hay archivos: cada sonido es una onda dibujada en código y guardada una vez
 * en memoria (AudioBuffer). Así no se descarga nada, no hay que decodificar MP3 y la reproducción es inmediata.
 *
 *  - Nada suena hasta el primer toque o tecla (los navegadores lo exigen y además es lo correcto).
 *  - Cada disparo varía apenas el tono y el volumen: nunca suena dos veces igual (no cansa).
 *  - Un solo AudioContext, un solo volumen general bajo; se suspende con la pestaña oculta.
 *  - El sitio funciona idéntico en silencio: el sonido nunca es la única señal de nada.
 */
export type Sfx = "hover" | "tap" | "open" | "close" | "bloom" | "fold" | "tick" | "page";

const KEY = "sonido";
export const SOUND_EVENT = "sfx:estado";
const MASTER = 0.16;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let buffers: Partial<Record<Sfx, AudioBuffer>> = {};
let last: Partial<Record<Sfx, number>> = {};

export function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSound(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {}
  if (master && ctx) master.gain.setTargetAtTime(on ? MASTER : 0, ctx.currentTime, 0.05);
  window.dispatchEvent(new Event(SOUND_EVENT));
}

// ---------- ondas ----------
type Draw = (t: number, i: number, n: number) => number;
function render(c: AudioContext, seconds: number, draw: Draw, post?: (d: Float32Array, sr: number) => void) {
  const n = Math.ceil(seconds * c.sampleRate);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = draw(i / c.sampleRate, i, n);
  post?.(d, c.sampleRate);
  // sin clics: 2 ms de entrada y 6 ms de salida
  const a = Math.floor(0.002 * c.sampleRate);
  const z = Math.floor(0.006 * c.sampleRate);
  for (let i = 0; i < a; i++) d[i] *= i / a;
  for (let i = 0; i < z; i++) d[n - 1 - i] *= i / z;
  return buf;
}
/** pasabajos / pasaaltos de un polo, con corte fijo o que se mueve en el tiempo */
function lowpass(d: Float32Array, sr: number, hz: (t: number) => number) {
  let y = 0;
  for (let i = 0; i < d.length; i++) {
    const k = 1 - Math.exp((-2 * Math.PI * hz(i / sr)) / sr);
    y += k * (d[i] - y);
    d[i] = y;
  }
}
function highpass(d: Float32Array, sr: number, hz: number) {
  const k = Math.exp((-2 * Math.PI * hz) / sr);
  let y = 0;
  let x1 = 0;
  for (let i = 0; i < d.length; i++) {
    y = k * (y + d[i] - x1);
    x1 = d[i];
    d[i] = y;
  }
}
const noise = () => Math.random() * 2 - 1;
const TAU = Math.PI * 2;

function build(c: AudioContext) {
  // roce de tela al pasar por algo
  buffers.hover = render(c, 0.05, (t) => noise() * Math.exp(-t / 0.011), (d, sr) => {
    highpass(d, sr, 1800);
    lowpass(d, sr, () => 5200);
  });
  // toque en madera con fieltro
  buffers.tap = render(c, 0.11, (t) => {
    const f = 150 + 90 * Math.exp(-t / 0.012);
    return Math.sin(TAU * f * t) * Math.exp(-t / 0.028) * 0.9 + noise() * Math.exp(-t / 0.0025) * 0.25;
  });
  // el estandarte que se despliega (menú): ruido con el filtro abriéndose
  const cloth = (up: boolean) =>
    render(c, 0.34, (t, i, n) => noise() * Math.sin((Math.PI * i) / n) ** 2, (d, sr) => {
      highpass(d, sr, 300);
      lowpass(d, sr, (t) => (up ? 500 + 5200 * (t / 0.34) ** 2 : 5700 - 5200 * Math.sqrt(t / 0.34)));
    });
  buffers.open = cloth(true);
  buffers.close = cloth(false);
  // el visor: una quinta grave y tibia que florece y se va
  buffers.bloom = render(c, 0.9, (t) => {
    const env = Math.min(1, t / 0.05) * Math.exp(-t / 0.3);
    return (Math.sin(TAU * 196 * t) * 0.6 + Math.sin(TAU * 293.7 * t + 0.4) * 0.35 + Math.sin(TAU * 392.4 * t) * 0.12) * env;
  });
  // cerrar el visor: la misma nota, más corta y hacia abajo
  buffers.fold = render(c, 0.4, (t) => Math.sin(TAU * (196 - 40 * t) * t) * Math.exp(-t / 0.11) * 0.7);
  // el año que cambia: un diente del cuentakilómetros
  buffers.tick = render(c, 0.03, (t) => (Math.sin(TAU * 2100 * t) * 0.6 + Math.sin(TAU * 1250 * t) * 0.4) * Math.exp(-t / 0.004));
  // pasar de página: papel
  buffers.page = render(c, 0.22, (t) => noise() * Math.min(1, t / 0.012) * Math.exp(-t / 0.06), (d, sr) => {
    highpass(d, sr, 900);
    lowpass(d, sr, (t) => 7000 - 4500 * (t / 0.22));
  });
}

/** Se llama en el primer gesto del visitante. */
export function unlock() {
  if (ctx) {
    if (ctx.state === "suspended" && !document.hidden) void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC({ latencyHint: "interactive" });
  master = ctx.createGain();
  master.gain.value = soundOn() ? MASTER : 0;
  master.connect(ctx.destination);
  build(ctx);
  if (ctx.state === "suspended" && !document.hidden) void ctx.resume();
}

const LEVEL: Record<Sfx, number> = { hover: 0.22, tap: 0.5, open: 0.5, close: 0.42, bloom: 0.55, fold: 0.4, tick: 0.3, page: 0.4 };
/** separación mínima entre dos disparos del mismo sonido (ms) */
const GAP: Partial<Record<Sfx, number>> = { hover: 70, tick: 60, tap: 40 };

export function play(name: Sfx, opts: { volume?: number; rate?: number } = {}) {
  if (!ctx || !master || !soundOn() || document.hidden) return;
  // recién creado en el mismo gesto, el contexto puede seguir «suspendido» un instante: se despierta y el
  // sonido sale igual (queda en cola unos milisegundos)
  if (ctx.state === "suspended") void ctx.resume();
  const buf = buffers[name];
  if (!buf) return;
  const now = performance.now();
  if (now - (last[name] ?? 0) < (GAP[name] ?? 0)) return;
  last[name] = now;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = (opts.rate ?? 1) * (0.96 + Math.random() * 0.08);
  const g = ctx.createGain();
  g.gain.value = LEVEL[name] * (opts.volume ?? 1) * (0.85 + Math.random() * 0.3);
  src.connect(g).connect(master);
  src.start();
}

// ---------- fuego procedural ----------
// No es una grabación en bucle: es un instrumento que toca lo que hace el fluido.
//   calor  → el cuerpo del fuego (ruido filtrado: más calor, más grave y más lleno)
//   aire   → el soplido (agudo) y un «fuu» grave cuando la antorcha pasa rápido
//   giro   → abre el filtro y dispara más chasquidos (la leña cruje cuando el fuego se enrosca)
//   lugar  → de qué lado suena
type FireVoice = {
  noise: AudioBufferSourceNode;
  body: BiquadFilterNode;
  bodyGain: GainNode;
  hiss: BiquadFilterNode;
  hissGain: GainNode;
  whoomp: OscillatorNode;
  whoompGain: GainNode;
  pan: StereoPannerNode;
  out: GainNode;
};
/** volumen máximo del fuego respecto del resto de los sonidos (que ya son bajos) */
const FIRE_CEILING = 0.3;
let fire: FireVoice | null = null;
let crackleAt = 0;
let fireIdle = 0;

function fireVoice(c: AudioContext, dest: AudioNode): FireVoice {
  const n = c.sampleRate * 2;
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  for (let i = 0; i < n; i++) {
    // ruido rosado aproximado (más cálido que el blanco)
    const w = noise();
    b0 = 0.985 * b0 + w * 0.12;
    d[i] = b0 * 2.4 + w * 0.12;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const out = c.createGain();
  out.gain.value = 0;
  const pan = c.createStereoPanner();
  const body = c.createBiquadFilter();
  body.type = "bandpass";
  body.Q.value = 0.7;
  const bodyGain = c.createGain();
  bodyGain.gain.value = 0;
  const hiss = c.createBiquadFilter();
  hiss.type = "highpass";
  hiss.frequency.value = 3200;
  const hissGain = c.createGain();
  hissGain.gain.value = 0;
  const whoomp = c.createOscillator();
  whoomp.type = "sine";
  whoomp.frequency.value = 62;
  const whoompGain = c.createGain();
  whoompGain.gain.value = 0;
  src.connect(body).connect(bodyGain).connect(pan);
  src.connect(hiss).connect(hissGain).connect(pan);
  whoomp.connect(whoompGain).connect(pan);
  // techo duro: pase lo que pase en la simulación, el fuego nunca supera un susurro
  const limit = c.createDynamicsCompressor();
  limit.threshold.value = -30;
  limit.knee.value = 6;
  limit.ratio.value = 20;
  limit.attack.value = 0.004;
  limit.release.value = 0.25;
  const lid = c.createBiquadFilter(); // sin agudos: nada de silbido de turbina
  lid.type = "lowpass";
  lid.frequency.value = 2600;
  pan.connect(lid).connect(limit).connect(out).connect(dest);
  src.start();
  whoomp.start();
  return { noise: src, body, bodyGain, hiss, hissGain, whoomp, whoompGain, pan, out };
}

function crackle(c: AudioContext, v: FireVoice, at: number, strength: number) {
  const len = 0.006 + Math.random() * 0.02;
  const buf = c.createBuffer(1, Math.ceil(len * c.sampleRate), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = noise() * Math.exp(-i / (d.length * 0.22));
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1400 + Math.random() * 4200;
  bp.Q.value = 2.5;
  const g = c.createGain();
  g.gain.value = (0.25 + Math.random() * 0.6) * strength;
  src.connect(bp).connect(g).connect(v.pan);
  src.start(at);
}

/**
 * El estado del fuego, unas quince veces por segundo (lo que informan las superficies que arden).
 * Con todo en cero un rato, la voz se desarma: en una página sin fuego no queda nada corriendo.
 */
export function fireSet(f: { heat: number; flow: number; swirl: number; pan: number }) {
  if (!ctx || !master || ctx.state !== "running") return;
  const quiet = f.heat < 0.006 && f.flow < 0.01;
  if (!fire) {
    if (quiet || !soundOn()) return;
    fire = fireVoice(ctx, master);
  }
  const t = ctx.currentTime;
  const v = fire;
  const heat = Math.min(1, f.heat);
  v.out.gain.setTargetAtTime(soundOn() ? FIRE_CEILING : 0, t, 0.08);
  // cuerpo: de un rumor grave (brasas) a un rugido más abierto cuando arde y se enrosca
  v.body.frequency.setTargetAtTime(150 + 240 * heat + 260 * f.swirl * heat, t, 0.25);
  v.body.Q.setTargetAtTime(0.6 + 0.5 * f.swirl, t, 0.3);
  v.bodyGain.gain.setTargetAtTime(Math.min(0.5, heat * 0.55), t, heat > 0.02 ? 0.2 : 0.5);
  // soplido: el aire que mueve la antorcha
  v.hiss.frequency.setTargetAtTime(2600 + 3000 * f.flow, t, 0.1);
  v.hissGain.gain.setTargetAtTime(Math.min(0.06, f.flow * heat * 0.08), t, 0.2); // apenas un aliento
  // el «fuu» de una pasada rápida
  v.whoomp.frequency.setTargetAtTime(52 + 44 * f.flow + 30 * f.swirl, t, 0.08);
  v.whoompGain.gain.setTargetAtTime(Math.min(0.12, Math.pow(f.flow, 2) * heat * 0.16), t, 0.15);
  v.pan.pan.setTargetAtTime(Math.max(-0.8, Math.min(0.8, f.pan * 0.8)), t, 0.15);
  // chasquidos: llegan al azar; más calor y más remolino, más seguidos (de ~1 a ~14 por segundo)
  if (heat > 0.03 && soundOn()) {
    const rate = 0.6 + 4 * heat + 2.5 * f.swirl; // de a uno, no una fritura
    while (crackleAt < t + 0.12) {
      crackleAt = Math.max(crackleAt, t) + -Math.log(1 - Math.random()) / rate;
      crackle(ctx, v, crackleAt, 0.3 + heat * 0.3);
    }
  } else crackleAt = t;
  // sin fuego durante 4 s: desarmar todo
  fireIdle = quiet ? fireIdle + 1 : 0;
  if (fireIdle > 60) {
    v.noise.stop();
    v.whoomp.stop();
    v.out.disconnect();
    fire = null;
    fireIdle = 0;
  }
}

export function suspend(hidden: boolean) {
  if (!ctx) return;
  if (hidden) void ctx.suspend();
  else void ctx.resume();
}

/** Para pruebas y desarrollo. */
export const _state = () => ({ ctx: ctx?.state ?? "none", buffers: Object.keys(buffers), fire: !!fire });
export function _reset() {
  void ctx?.close();
  ctx = null;
  master = null;
  buffers = {};
  fire = null;
  last = {};
}
