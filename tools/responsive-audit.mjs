// Auditoría de pantallas: recorre rutas en muchos tamaños y avisa si algo se sale del ancho, queda cortado,
// tiene letra menor a 11,4 px o (en táctil) una zona de toque menor a 40 px.
// Uso:  npm i playwright-core  (con Chrome instalado en /usr/bin/google-chrome)
//       BASE=http://localhost:3000 ROUTES=/,/colecciones,/bitacora node tools/responsive-audit.mjs
// Opcionales: SIZES=280x653,390x844,2560x1300  SHOTS=390,1440 (capturas en /tmp/pw/resp)  NOSHOT=1  OUT=archivo.json
import { chromium } from "playwright-core";
import fs from "fs";
const BASE = process.env.BASE || "http://localhost:3300";
const ROUTES = (process.env.ROUTES || "").split(",").filter(Boolean);
const SIZES = (process.env.SIZES || "320x568,360x740,390x844,430x932,844x390,600x960,768x1024,1024x768,1280x800,1440x900,1920x1080,2560x1300").split(",").map((s) => s.split("x").map(Number));
const SHOTS = new Set((process.env.SHOTS || "320,390,768,1440").split(",").map(Number));
const b = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const out = [];
for (const [w, h] of SIZES) {
  const touch = w <= 1024 && !(w === 1024 && h === 768);
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: w < 600, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  for (const r of ROUTES) {
    try {
      await p.goto(BASE + r, { waitUntil: "load", timeout: 90000 });
      await p.waitForTimeout(500);
      // recorrer la página para que cargue lo perezoso
      await p.evaluate(async () => { const H = document.documentElement.scrollHeight; for (let y = 0; y < H; y += innerHeight) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
      await p.waitForTimeout(250);
      const res = await p.evaluate((touch) => {
        const vw = document.documentElement.clientWidth;
        const sel = (e) => { let s = e.tagName.toLowerCase(); const c = (e.getAttribute("class") || "").split(/\s+/).filter(Boolean)[0]; if (c) s += "." + c.replace(/__[\w-]+$/, ""); return s; };
        const path = (e) => { const a = []; for (let x = e; x && x !== document.body && a.length < 3; x = x.parentElement) a.unshift(sel(x)); return a.join(" > "); };
        const clipped = (e) => { for (let x = e.parentElement; x && x !== document.documentElement; x = x.parentElement) { const s = getComputedStyle(x); if (/(hidden|auto|scroll|clip)/.test(s.overflowX)) { const r = x.getBoundingClientRect(); if (r.right <= vw + 1 && r.left >= -1) return true; } } return false; };
        const vis = (e) => { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const over = [], small = [], taps = [], cut = [], broken = [];
        const docOver = document.documentElement.scrollWidth - vw;
        for (const e of document.querySelectorAll("body *")) {
          if (e.closest("nextjs-portal,[data-nextjs-toast],[data-next-badge-root]")) continue;
          if (!vis(e)) continue;
          const r = e.getBoundingClientRect(), s = getComputedStyle(e);
          if ((r.right > vw + 1.5 || r.left < -1.5) && r.width < vw * 3 && !clipped(e) && s.position !== "fixed") over.push([path(e), Math.round(r.left), Math.round(r.right)]);
          const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
          if (own) {
            const fs = parseFloat(s.fontSize);
            if (fs < 11.4) small.push([path(e), +fs.toFixed(1), e.textContent.trim().slice(0, 24)]);
            if (e.scrollWidth > e.clientWidth + 2 && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== "ellipsis" && !e.matches("[class*=marquee] *,[aria-hidden=true] *")) cut.push([path(e), e.clientWidth, e.scrollWidth, e.textContent.trim().slice(0, 24)]);
          }
          if (touch && e.matches("a,button,[role=button],input,select,summary") && !e.closest("p,li p,blockquote,figcaption,[class*=prose]")) {
            if ((r.width < 40 || r.height < 40) && s.position !== "fixed" || (r.width < 36 || r.height < 36)) {
              // el área real puede ampliarse con ::before/::after
              const pb = getComputedStyle(e, "::before"), pa = getComputedStyle(e, "::after");
              const grown = [pb, pa].some((q) => q.content !== "none" && q.position === "absolute" && (parseFloat(q.inset) < 0 || parseFloat(q.top) < 0 || parseFloat(q.left) < 0));
              if (!grown) taps.push([path(e), Math.round(r.width), Math.round(r.height), (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 20)]);
            }
          }
          if (e.tagName === "IMG" && e.complete && e.naturalWidth === 0 && e.currentSrc) broken.push(e.currentSrc.slice(-50));
        }
        const uniq = (a, k = 0) => { const m = new Map(); for (const x of a) { const y = m.get(x[k]); if (!y) m.set(x[k], [...x, 1]); else y[y.length - 1]++; } return [...m.values()]; };
        return { vw, docOver, over: uniq(over).slice(0, 8), small: uniq(small).slice(0, 8), taps: uniq(taps).slice(0, 10), cut: uniq(cut).slice(0, 6), broken: [...new Set(broken)].slice(0, 4), h: document.documentElement.scrollHeight };
      }, touch);
      out.push({ r, w, h, ...res });
      if (SHOTS.has(w) && process.env.NOSHOT !== "1") {
        const name = (r === "/" ? "home" : r.replace(/\W+/g, "_").replace(/^_/, "")) + `-${w}.png`;
        await p.screenshot({ path: `/tmp/pw/resp/${name}`, fullPage: true }).catch(() => {});
      }
    } catch (e) { out.push({ r, w, h, err: String(e).slice(0, 120) }); }
  }
  await ctx.close();
}
await b.close();
fs.writeFileSync(process.env.OUT || "/tmp/responsive-audit.json", JSON.stringify(out));
// resumen
const byR = {};
for (const o of out) (byR[o.r] ??= []).push(o);
for (const [r, rows] of Object.entries(byR)) {
  const lines = [];
  for (const o of rows) {
    if (o.err) { lines.push(`  ${o.w}: ERR ${o.err}`); continue; }
    const bits = [];
    if (o.docOver > 1) bits.push(`DESBORDA +${o.docOver}px`);
    if (o.over.length) bits.push("fuera: " + o.over.slice(0, 3).map((x) => `${x[0]} [${x[1]}..${x[2]}]×${x[3]}`).join(" ; "));
    if (o.cut.length) bits.push("cortado: " + o.cut.slice(0, 3).map((x) => `${x[0]} ${x[1]}<${x[2]} «${x[3]}»`).join(" ; "));
    if (o.small.length) bits.push("chico: " + o.small.slice(0, 3).map((x) => `${x[0]} ${x[1]}px «${x[2]}»×${x[3]}`).join(" ; "));
    if (o.taps.length) bits.push("toque: " + o.taps.slice(0, 4).map((x) => `${x[0]} ${x[1]}×${x[2]} «${x[3]}»×${x[4]}`).join(" ; "));
    if (o.broken.length) bits.push("img rota: " + o.broken.join(", "));
    if (bits.length) lines.push(`  ${o.w}×${o.h}: ` + bits.join(" | "));
  }
  console.log(lines.length ? `${r}\n${lines.join("\n")}` : `${r}  ✓`);
}
