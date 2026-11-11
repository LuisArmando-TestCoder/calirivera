#!/usr/bin/env node
// content/_memoria_inventory.json + web/public/media/_manifest.json → content/memories/<slug>.json
// Más los catálogos ya optimizados (Alquimia de Almas, Biomaster) como recuerdos de obra.
// No pisa recuerdos que Cali ya editó: si el JSON existe y su updatedAt es posterior a createdAt, lo deja.
// Uso: node tools/memoria-content.mjs
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const inv = JSON.parse(await readFile(path.join(ROOT, "content/_memoria_inventory.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(ROOT, "web/public/media/_manifest.json"), "utf8"));
const OUT = path.join(ROOT, "content/memories");
await mkdir(OUT, { recursive: true });
const NOW = new Date().toISOString().replace(/\.\d+Z$/, "Z");

const img = (m, alt) => {
  const o = { src: m.src, alt, width: m.width, height: m.height, widths: m.widths, placeholder: m.placeholder, color: m.color };
  if (m.lowRes) o.lowRes = true;
  if (m.aiAltered) o.aiAltered = true;
  return o;
};

async function write(doc) {
  const f = path.join(OUT, `${doc.slug}.json`);
  if (existsSync(f)) {
    const cur = JSON.parse(await readFile(f, "utf8"));
    if (cur.updatedAt && cur.createdAt && cur.updatedAt > cur.createdAt) return "kept";
    doc.createdAt = cur.createdAt ?? doc.createdAt;
  }
  await writeFile(f, JSON.stringify(doc, null, 1) + "\n");
  return "written";
}

const counts = { written: 0, kept: 0, sinImagen: 0, catalogo: 0 };
let order = 0;
for (const it of inv.items) {
  const m = manifest[it.file];
  if (!m) {
    counts.sinImagen++;
    continue;
  }
  const alt = it.title || it.caption || (it.year ? `Foto de ${it.year} del archivo de Cali Rivera` : "Foto del archivo de Cali Rivera");
  const doc = {
    id: it.slug,
    slug: it.slug,
    status: it.status,
    createdAt: NOW,
    updatedAt: NOW,
    order: order++,
    image: img(m, alt),
    kind: it.kind,
    source: it.source,
    aiAltered: Boolean(it.aiAltered),
  };
  if (it.title) doc.title = it.title;
  if (it.caption) doc.caption = it.caption;
  if (it.year) doc.year = it.year;
  if (it.yearApprox) doc.yearApprox = true;
  if (it.seenAt) doc.seenAt = it.seenAt;
  if (it.collectionId) doc.collectionId = it.collectionId;
  if (it.sourceUrl) doc.sourceUrl = it.sourceUrl;
  if (it.pageTitle) doc.sourcePage = it.pageTitle;
  if (it.lostInFire) doc.lostInFire = true;
  counts[await write(doc)]++;
}

// Catálogos: las fichas de content/artworks de Alquimia de Almas y Biomaster
const arts = (await readdir(path.join(ROOT, "content/artworks"))).filter((f) => /^(alquimia-de-almas|biomaster)-.*\.json$/.test(f));
for (const f of arts) {
  const a = JSON.parse(await readFile(path.join(ROOT, "content/artworks", f), "utf8"));
  const im = a.images?.[0];
  if (!im) continue;
  const slug = `${a.year ?? "sf"}-${a.slug}`;
  const doc = {
    id: slug,
    slug,
    status: "published",
    createdAt: NOW,
    updatedAt: NOW,
    order: order++,
    image: { ...im, alt: im.alt || a.title },
    title: a.title,
    caption: [a.technique, a.dimensions].filter(Boolean).join(" · ") || undefined,
    year: Number(a.year) || a.year,
    kind: "obra",
    source: "catalogo",
    collectionId: a.collectionId,
    aiAltered: false,
  };
  if (a.collectionId === "biomaster") doc.place = "Taller del Artista, Tres Ríos";
  counts[await write(JSON.parse(JSON.stringify(doc)))]++;
  counts.catalogo++;
}
console.log(counts);
