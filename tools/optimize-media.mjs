#!/usr/bin/env node
// Optimiza imágenes fuente → web/public/media/<grupo>/<nombre>-<w>.{avif,webp,jpg}
// Escribe web/public/media/_manifest.json: { "<ruta fuente>": { src, widths, width, height, placeholder, color, lowRes, aiAltered } }
// Uso: node tools/optimize-media.mjs <lista.json>   (lista = [{ path, group }])
import sharp from "sharp";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "web/public/media");
const WIDTHS = [640, 1280, 1920];
const list = JSON.parse(await readFile(process.argv[2], "utf8"));
const manifestPath = path.join(OUT, "_manifest.json");
let manifest = {};
try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch {}
const ai = new Map(JSON.parse(await readFile(path.join(ROOT, "content/_images.json"), "utf8")).map((i) => [i.path, (i.aiSignatures ?? []).length > 0]));

const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/-[A-Za-z0-9]{16}$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "img";

let done = 0;
for (const { path: rel, group } of list) {
  if (manifest[rel] && !process.argv.includes("--force")) { done++; continue; }
  const file = path.join(ROOT, rel);
  try { await stat(file); } catch { console.warn("falta", rel); continue; }
  const img = sharp(file, { failOn: "none", animated: false }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) { console.warn("sin dimensiones", rel); continue; }
  const name = slugify(path.basename(rel).replace(/^[0-9a-f]{8}_/, ""));
  const dir = path.join(OUT, group);
  await mkdir(dir, { recursive: true });
  const widths = WIDTHS.filter((w) => w < meta.width);
  widths.push(Math.min(meta.width, 2400));
  const uniq = [...new Set(widths)].sort((a, b) => a - b);
  for (const w of uniq) {
    const base = sharp(file, { failOn: "none" }).rotate().resize({ width: w, withoutEnlargement: true }).flatten({ background: "#ffffff" });
    await base.clone().avif({ quality: 52, effort: 4 }).toFile(path.join(dir, `${name}-${w}.avif`));
    await base.clone().webp({ quality: 74 }).toFile(path.join(dir, `${name}-${w}.webp`));
    await base.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(path.join(dir, `${name}-${w}.jpg`));
  }
  const tiny = await sharp(file, { failOn: "none" }).rotate().resize(16).flatten({ background: "#ffffff" }).webp({ quality: 40 }).toBuffer();
  const { dominant } = await sharp(file, { failOn: "none" }).stats();
  const max = uniq[uniq.length - 1];
  const height = Math.round((meta.height / meta.width) * max);
  manifest[rel] = {
    src: `/media/${group}/${name}-${max}.jpg`,
    widths: uniq,
    width: max,
    height,
    placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
    color: `rgb(${dominant.r} ${dominant.g} ${dominant.b})`,
    lowRes: Math.max(meta.width, meta.height) < 1000,
    aiAltered: ai.get(rel) ?? false,
  };
  if (++done % 10 === 0) { console.log(done, "/", list.length); await writeFile(manifestPath, JSON.stringify(manifest, null, 1)); }
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 1));
console.log("listo", Object.keys(manifest).length);
