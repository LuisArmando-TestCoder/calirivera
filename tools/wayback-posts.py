#!/usr/bin/env python3
"""
Lo que el sitio de 2025 (Internet Archive) decía y acá no estaba en ninguna parte, página por página del
menú: exposiciones, Café Arte, recomendaciones, histórico, «Mi visión» y sueltos. Cada página pasa a ser
una entrada de la Bitácora con el texto original de Cali y el enlace a su copia archivada (la única que existe).
Entrada: el informe de faltantes (tools: comparación línea por línea contra content/).
Uso: python3 tools/wayback-posts.py faltante.json
"""
import json, os, re, sys, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = f"{ROOT}/content"
NOW = "2026-11-20T03:40:00Z"
data = json.load(open(sys.argv[1]))
MES = {m: i for i, m in enumerate("enero febrero marzo abril mayo junio julio agosto setiembre octubre noviembre diciembre".split(), 1)}
MES["septiembre"] = 9
TAG = {"exposiciones": "exposición", "cafe_arte": "café arte", "recomendaciones": "recomendación", "historico": "histórico", "actividades_taller": "agenda", "manifiesto": "manifiesto", "taller": "taller", "otros": "archivo"}
SKIP = {"biografia", "galeria", "videos", "grammar-report", "prensa", "press"}
slugify = lambda s: re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower())).strip("-")[:70]
COLS = {"Exvotos 2012": "exvotos", "Musas del Cántaro": "musas-del-cantaro", "Sueños en Azul": "suenos-en-azul", "Bandera 1": "prayer-flags", "Bandera 2": "prayer-flags", "Bandera 3": "prayer-flags"}
FECHA = {"Trienal": "2015-04", "Ceremonia de celebración": "2009-10"}  # fechas que el título no dice pero el texto sí
to_cols = []
existing = {f[:-5] for f in os.listdir(f"{C}/posts")}
made = []
for sec, rows in data.items():
    if sec in SKIP:
        continue
    for r in rows:
        if r["chars"] < (400 if sec == "exposiciones" else 700):
            continue
        # listados y duplicados no son entradas; los textos de colecciones van a su colección (más abajo)
        if re.match(r"(Exposiciones|exposiciones)$", r["title"].strip()) or (sec == "taller" and "espacio-concepto" in r["title"]):
            continue
        col = next((c for k, c in COLS.items() if k in r["title"]), None)
        if col:
            to_cols.append((col, r))
            continue
        title = re.sub(r"\s+", " ", r["title"]).strip()
        seg = re.sub(r"\.html.*$", "", r["url"].split("?")[0].rstrip("/").split("/")[-1])
        m = re.search(r"id=\d+:([\w-]+)", r["url"])
        seg = m.group(1) if m else seg
        if not title or re.match(r"(Cali Rivera|Recomendaciones de eventos|exposiciones|calirivera)", title, re.I):
            t = re.sub(r"^\d+-", "", seg).replace("-", " ").strip()
            title = (t[0].upper() + t[1:]) if len(t) > 3 else {"historico": "Del histórico del sitio", "otros": "Del archivo del sitio"}.get(sec, "Del archivo")
        if title.lower() in ("historico", "index.php", "start"):
            title = "Del histórico del sitio"
        hay = (title + " " + seg).lower()
        y = re.search(r"(19|20)\d\d", hay)
        mo = next((n for name, n in MES.items() if name in hay or name[:3] + "-" in hay), None)
        tags = [TAG.get(sec, "archivo")]
        fixed = next((v for k, v in FECHA.items() if k in title), None)
        status = "published"
        if fixed:
            date = f"{fixed}-01T12:00:00Z"
        elif y:
            date = f"{y.group(0)}-{mo or 1:02d}-01T12:00:00Z"
            if not mo:
                tags.append("fecha-aproximada")
        else:
            # sin fecha en el título: queda en borrador (no se publica con una fecha inventada)
            date = f"{r['year'] or '2016'}-01-01T12:00:00Z"
            tags.append("fecha-aproximada")
            status = "draft"
        slug = slugify(title) or slugify(seg)
        if slug in existing:
            slug = f"{slug}-{sec.replace('_', '-')}"
        n = 2
        while slug in existing:
            slug, n = f"{slugify(title)}-{n}", n + 1
        existing.add(slug)
        body = [{"type": "paragraph", "id": f"{slug[:24]}-{i}", "text": l} for i, l in enumerate(r["miss"], 1)]
        src = r.get("archive") or f"https://web.archive.org/web/{r['year']}/{r['url']}"
        body.append({"type": "links", "id": f"{slug[:24]}-fuente", "title": "Fuente", "items": [{"label": "Página original, archivada en Internet Archive", "href": src, "kind": "external"}]})
        ex = r["miss"][0]
        post = {"id": slug, "slug": slug, "status": status, "createdAt": NOW, "updatedAt": NOW, "title": title, "excerpt": ex[:240] + ("…" if len(ex) > 240 else ""),
                "body": body, "publishedAt": date, "tags": tags, "sourceUrl": src}
        open(f"{C}/posts/{slug}.json", "w").write(json.dumps(post, ensure_ascii=False, indent=1) + "\n")
        made.append((status, sec, date[:7], title[:60], r["chars"]))
for col, r in to_cols:
    p = f"{C}/collections/{col}.json"
    d = json.load(open(p))
    key = slugify(r["title"])[:20]
    if any(b["id"].startswith(f"wb-{key}") for b in d.get("body", [])):
        continue
    if col == "prayer-flags":
        d["body"].append({"type": "quote", "id": f"wb-{key}", "text": " ".join(r["miss"]), "cite": re.sub(r"\s*-\s*reverso", "", r["title"]).strip() + " · texto del reverso"})
    else:
        d.setdefault("body", []).extend({"type": "paragraph", "id": f"wb-{key}-{i}", "text": l} for i, l in enumerate(r["miss"], 1))
    d["updatedAt"] = NOW
    open(p, "w").write(json.dumps(d, ensure_ascii=False, indent=1 if col != "x" else 2) + "\n")
    print("→ colección", col, r["title"][:30], r["chars"])
for m in sorted(made):
    print(m)
print(len(made), "entradas")
