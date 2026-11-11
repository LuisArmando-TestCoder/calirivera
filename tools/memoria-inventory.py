#!/usr/bin/env python3
"""
Inventario de «Memoria»: todas las imágenes del sitio actual (assets/), del sitio viejo
(Wayback: legacy/assets + legacy/memoria/raw) y de los catálogos (content/artworks).

  python3 tools/memoria-inventory.py            → content/_memoria_inventory.json
                                                  + legacy/memoria/_sources.json (lista para optimizar)

No inventa datos: año sale de la ruta/nombre, del título de la página donde aparecía,
de la serie (según el menú del sitio viejo) o, si nada de eso, del año en que Wayback vio
la imagen (yearApprox=true, seenAt). lostInFire solo si el texto de origen lo dice.
"""
import json, re, os, glob, hashlib, collections, unicodedata
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
Image.MAX_IMAGE_PIXELS = 80_000_000

def norm(u):
    u = (u or "").strip().lower()
    u = re.sub(r"^https?://", "", u)
    u = re.sub(r"^www\.", "", u)
    u = u.replace("/~calirive/", "/").replace("/%7ecalirive/", "/")
    u = re.sub(r"/{2,}", "/", u)
    return u.split("#")[0]

def fold(s):
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()

# Serie → (año, colección) según el menú del sitio viejo (legacy/content/manifiesto.json lo lista)
SERIES = [
    (r"atmosfera", 1993, "atmosfera"), (r"musa", 1995, "musas-del-cantaro"), (r"suenos|sazul|sueno", 1996, "suenos-en-azul"),
    (r"detras|ventana", 2000, "detras-de-la-ventana"), (r"ave_?fenix|avefenix", 2000, None), (r"poetry", 2001, None),
    (r"transmutac", 2003, None), (r"prayer|bandera\d|banderas?_oracion", 2003, None), (r"globaliz", 2004, None),
    (r"identidad", 2005, None), (r"el_?agua|agua_elemento", 2006, None), (r"alquimia_?2008|captura-alquimia", 2008, None),
    (r"guate|atitlan|cruz_?san|san_?pedro", 2009, None), (r"corpus", 2010, None), (r"zentica|japon", 2010, None),
    (r"exvoto", 2012, "exvotos"), (r"plegaria", 2011, "plegaria"), (r"sincretismo", 2014, None), (r"revelac", 2015, None),
    (r"cofradia", 2017, "la-cofradia"), (r"incendio", 2017, None), (r"nobienal|no_?bienal", 2020, None),
]
KIND_RULES = [
    ("prensa", r"prensa|puntos_de_vista|nacion|republica|tico_?times|articulo|periodico|revista"),
    ("evento", r"actividad|agenda|invitaci|afiche|concierto|evento|inaugura|expo(sicion)?es?[-_/]|anuncio|taller_?de|festival|bienal"),
    ("taller", r"taller|cafe|menu|vistas|cocina|galeria_del_taller|casa_?museo"),
    ("lugar", r"guate|atitlan|paisaje|lago|volcan|iraz"),
    ("documento", r"boletin|catalogo|portada|carta|diploma|certific"),
    ("obra", r"obra|galeria|plegaria|bandera|exvoto|musa|suenos|detras|identidad|transmut|alquimia|sincret|revelac|cofradia|atmosfera|poetry|fenix"),
]
SECTION_KIND = {"obras": "obra", "actividades_taller": "evento", "prensa": "prensa", "cafe_arte": "taller", "taller": "taller",
                "exposiciones": "evento", "historico": "documento", "galeria": "obra", "biografia": "persona", "videos": "evento",
                "recomendaciones": "prensa", "manifiesto": "documento"}
GENERIC_ALT = {"", "cali rivera", "image", "imagen", "foto", "logo", "untitled"}
DECOR = re.compile(r"hqdefault|maxresdefault|logo|icon|boton|button|btn|banner|bann|spacer|blank|arrow|flecha|bullet|header|fondo|bg_|background|pinit|siguenos|facebook|twitter|youtube|instagram|whatsapp|share|loading|menu_digital|_bann|slide-\d", re.I)
YEAR = re.compile(r"(?<!\d)(199[0-9]|20[0-2][0-9])(?!\d)")

# ---------- contexto de páginas del sitio viejo ----------
ctx = collections.defaultdict(list)
for f in glob.glob("legacy/content/*.json"):
    if f.endswith("_hack_flags.json"):
        continue
    sec = os.path.basename(f)[:-5]
    for p in json.load(open(f)):
        for im in p.get("images") or []:
            ctx[norm(im.get("src"))].append({
                "section": sec, "page": p.get("url"), "pageTitle": (p.get("title") or "").strip(),
                "snapshot": p.get("snapshot"), "alt": (im.get("alt") or "").strip(), "title": (im.get("title") or "").strip(),
                "archive": p.get("archive"),
            })

def page_title_of(c):
    # el título <title> del Joomla viejo suele ser «Cali Rivera»: usamos el último segmento de la URL
    t = c.get("pageTitle") or ""
    if fold(t) in ("cali rivera", "") or fold(t).startswith("cali rivera-") or fold(t).startswith("cali rivera -"):
        seg = (c.get("page") or "").rstrip("/").split("/")[-1]
        seg = re.sub(r"\.html?$", "", seg)
        seg = re.sub(r"^\d+-", "", seg)
        if seg and not seg.startswith("index.php") and not re.fullmatch(r"[\w]*\d{2,}", seg):
            t = seg.replace("-", " ").replace("_", " ").strip().capitalize()
        else:
            t = ""
    return t

# ---------- fuentes ----------
items = []
# 1) Wayback ya descargadas en la rama 2
idx = json.load(open("legacy/assets/_index.json"))
for url, fn in idx.items():
    items.append({"file": f"legacy/assets/{fn}", "url": url, "source": "wayback"})
# 2) Wayback descargadas por esta rama
if os.path.exists("legacy/memoria/fetch_list.json"):
    for r in json.load(open("legacy/memoria/fetch_list.json")):
        if not r.get("have") and os.path.exists(r["local"]) and os.path.getsize(r["local"]) > 0:
            items.append({"file": r["local"], "url": r["url"], "source": "wayback", "ts": r.get("ts")})
# 3) Sitio actual (Hostinger/Zyro) con firmas C2PA
ai = {i["path"]: bool(i.get("aiSignatures")) for i in json.load(open("content/_images.json"))}
for path in sorted(ai):
    if path.startswith(("assets/_site/", "assets/files/")):
        continue
    if os.path.exists(path):
        items.append({"file": path, "url": "calirivera.com/" + path.split("/", 1)[1], "source": "sitio-actual", "aiAltered": ai[path],
                      "sitePage": path.split("/")[1]})

urls_meta = {}
if os.path.exists("legacy/urls.json"):
    for u in json.load(open("legacy/urls.json")):
        urls_meta[norm(u["url"])] = u

def dhash(im, size=8):
    g = ImageOps.exif_transpose(im).convert("L").resize((size + 1, size), Image.LANCZOS)
    px = list(g.tobytes())
    bits = 0
    for y in range(size):
        for x in range(size):
            bits = (bits << 1) | (px[y * (size + 1) + x] > px[y * (size + 1) + x + 1])
    return bits

stats = collections.Counter()
recs = []
for it in items:
    stats["encontradas"] += 1
    try:
        with Image.open(it["file"]) as im:
            im.seek(0)
            w, h = im.size
            if w < 120 or h < 120:
                stats["descartadas: muy chicas"] += 1; continue
            if max(w / h, h / w) > 4.2:
                stats["descartadas: tira/banner"] += 1; continue
            hsh = dhash(im.convert("RGB"))
            # imágenes casi planas (fondos, separadores)
            ext = im.convert("L").resize((32, 32)).getextrema()
            if ext[1] - ext[0] < 18:
                stats["descartadas: planas"] += 1; continue
    except Exception:
        stats["descartadas: no se pudo abrir"] += 1; continue
    nu = norm(it["url"])
    name = nu.split("?")[0].split("/")[-1]
    if DECOR.search(nu.split("?")[0]) and not re.search(r"obras|galeria|stories/(exposiciones|actividades|taller|fotos)", nu):
        stats["descartadas: decorativas"] += 1; continue
    it.update({"w": w, "h": h, "px": w * h, "hash": hsh, "norm": nu, "name": name})
    recs.append(it)

# ---------- deduplicado perceptual ----------
def ham(a, b): return bin(a ^ b).count("1")
groups = []
for r in sorted(recs, key=lambda r: -r["px"]):
    for g in groups:
        if ham(g[0]["hash"], r["hash"]) <= 6:
            g.append(r); break
    else:
        groups.append([r])
stats["grupos tras deduplicar"] = len(groups)

def pick(g):
    best = g[0]  # mayor resolución
    if best.get("aiAltered"):
        auth = [x for x in g if not x.get("aiAltered")]
        if auth and auth[0]["px"] >= best["px"] * 0.25:
            return auth[0]
    return best

def series_of(text):
    t = fold(text)
    for rx, yr, col in SERIES:
        if re.search(rx, t):
            return yr, col
    return None, None

def kind_of(text, section):
    t = fold(text)
    for k, rx in KIND_RULES:
        if re.search(rx, t):
            return k
    return SECTION_KIND.get(section or "", "obra")

def humanize(name):
    b = re.sub(r"\.(jpe?g|png|gif|webp)$", "", name, flags=re.I)
    b = re.sub(r"-[A-Za-z0-9]{16}$", "", b)  # sufijo de Zyro/Hostinger
    b = re.sub(r"^(jw_sig_cache_[0-9a-f]+_|b_\d+_\d+_\d+_\d+_|\d+x\d+-)", "", b)
    b = re.sub(r"-\d+x\d+$", "", b)
    b = re.sub(r"^(images|stories)[-_]", "", b)
    b = b.split("-")[-1] if b.count("-") >= 2 else b
    if re.fullmatch(r"[0-9a-f]{16,}", b) or re.search(r"\d{3,}|^img|^dsc|^p\d|^foto|^image|^showthumb", b, re.I):
        return ""
    b = re.sub(r"\d+$", "", b).replace("_", " ").replace("-", " ").strip()
    if len(b) < 3 or not re.search(r"[a-z]{3}", b, re.I):
        return ""
    return b[:1].upper() + b[1:]

def slugify(s):
    s = fold(s)
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:48] or "recuerdo"

out = []
seen_slugs = set()
for g in groups:
    r = pick(g)
    cs = []
    for x in g:
        cs += ctx.get(x["norm"], [])
    c0 = cs[0] if cs else {}
    alts = [c["alt"] for c in cs if fold(c["alt"]) not in GENERIC_ALT and not re.search(r"\.(jpe?g|png|gif)$", c["alt"], re.I)]
    titles = [c["title"] for c in cs if c.get("title") and fold(c["title"]) not in GENERIC_ALT]
    ptitle = next((page_title_of(c) for c in cs if page_title_of(c)), "")
    text = " ".join([r["norm"], ptitle, " ".join(alts[:2]), c0.get("page") or "", r.get("sitePage", "")])
    # año
    year = None; approx = False; why = None
    m = YEAR.search(r["norm"].split("?")[0])
    if m: year, why = int(m.group(1)), "ruta"
    if not year:
        m = YEAR.search(" ".join([ptitle] + alts[:1]))
        if m: year, why = int(m.group(1)), "página"
    sy, col = series_of(text)
    if not year and sy: year, approx, why = sy, True, "serie"
    seen = r.get("ts") or c0.get("snapshot") or (urls_meta.get(r["norm"], {}).get("first"))
    seen_iso = f"{seen[:4]}-{seen[4:6]}-{seen[6:8]}" if seen and len(seen) >= 8 else None
    if not year and seen_iso and r["source"] == "wayback":
        year, approx, why = int(seen[:4]), True, "visto-en"
    if col is None:
        _, col = series_of(r.get("sitePage", "") + " " + r["norm"])
    kind = kind_of(text, c0.get("section"))
    title = (alts[0] if alts else (titles[0] if titles else "")) or (humanize(r["name"]) if kind == "obra" else "")
    caption = ""
    if ptitle and fold(ptitle) not in fold(title):
        caption = f"En «{ptitle}»"
    lost = any(re.search(r"incendi|quemad|ceniza", fold(c["alt"] + " " + c.get("title", ""))) for c in cs)
    ai = bool(r.get("aiAltered"))
    base = f"{year or 'sf'}-{slugify(title or humanize(r['name']) or kind)}"
    slug = base
    if slug in seen_slugs:
        slug = f"{base}-{hashlib.md5(r['file'].encode()).hexdigest()[:4]}"
    seen_slugs.add(slug)
    out.append({
        "slug": slug, "file": r["file"], "w": r["w"], "h": r["h"], "source": r["source"],
        "sourceUrl": ("https://" + r["url"]) if r["source"] == "sitio-actual" else (f"https://web.archive.org/web/{seen}id_/http://{r['url']}" if seen else None),
        "sourcePage": c0.get("archive") or (("https://calirivera.com/" + r["sitePage"]) if r.get("sitePage") else None),
        "pageTitle": ptitle or None,
        "title": title or None, "caption": caption or None,
        "year": year, "yearApprox": approx, "yearFrom": why, "seenAt": seen_iso,
        "kind": kind, "collectionId": col, "aiAltered": ai, "lostInFire": lost or None,
        "duplicates": [x["file"] for x in g if x is not r],
        "status": "draft" if ai else "published",
    })

stats["recuerdos"] = len(out)
stats["borrador (IA, revisar)"] = sum(1 for o in out if o["status"] == "draft")
stats["publicados"] = sum(1 for o in out if o["status"] == "published")
stats["con año"] = sum(1 for o in out if o["year"])
stats["deduplicadas (copias descartadas)"] = sum(len(o["duplicates"]) for o in out)
json.dump({"stats": dict(stats), "items": out}, open("content/_memoria_inventory.json", "w"), ensure_ascii=False, indent=1)
os.makedirs("legacy/memoria", exist_ok=True)
json.dump([{"path": o["file"], "group": "memoria", "as": o["slug"]} for o in out], open("legacy/memoria/_sources.json", "w"), indent=0)
for k, v in stats.items():
    print(f"{k}: {v}")
