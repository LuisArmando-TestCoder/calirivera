#!/usr/bin/env python3
"""
Rama 5 — convierte la extracción cruda (content/*.json, sitio Zyro) y el rescate del
sitio viejo (legacy/content/*.json, Joomla vía Wayback) al modelo de web/src/lib/content/types.ts.

Escribe:
  content/settings.json
  content/pages/<slug>.json
  content/collections/<slug>.json
  content/artworks/<slug>.json
  content/catalogs/<slug>.json
  content/programs/<kind>.json
  content/posts/<slug>.json
  tools/.media-list.json   (imágenes que necesita el modelo → tools/optimize-media.mjs)

Reglas: no se inventan datos; los campos desconocidos se omiten. Las imágenes usan
web/public/media/_manifest.json si existe (src optimizado, dimensiones, placeholder,
lowRes, aiAltered). Correr dos veces: model → optimize-media → model.
"""
import json, os, re, glob, hashlib, unicodedata, shutil
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
C = os.path.join(ROOT, "content")
L = os.path.join(ROOT, "legacy", "content")
MANIFEST_PATH = os.path.join(ROOT, "web", "public", "media", "_manifest.json")
MANIFEST = json.load(open(MANIFEST_PATH)) if os.path.exists(MANIFEST_PATH) else {}
AI = {i["path"]: bool(i.get("aiSignatures")) for i in json.load(open(os.path.join(C, "_images.json")))}
NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
MEDIA_LIST = {}

MONTHS = {"enero": 1, "ene": 1, "febrero": 2, "feb": 2, "marzo": 3, "mar": 3, "abril": 4, "abr": 4, "mayo": 5,
          "junio": 6, "jun": 6, "julio": 7, "jul": 7, "agosto": 8, "ago": 8, "setiembre": 9, "septiembre": 9,
          "set": 9, "sep": 9, "octubre": 10, "oct": 10, "noviembre": 11, "nov": 11, "diciembre": 12, "dic": 12}
MONTH_NAME = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre",
              "octubre", "noviembre", "diciembre"]


def slugify(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:70] or "x"


_ids = {}
def bid(prefix):
    _ids[prefix] = _ids.get(prefix, 0) + 1
    return f"{prefix}-{_ids[prefix]}"


def load(name):
    return json.load(open(os.path.join(C, name + ".json")))


def write(rel, obj):
    p = os.path.join(C, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(obj, open(p, "w"), ensure_ascii=False, indent=1)


def clean(t):
    t = (t or "").replace(" ", " ")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\s+([,.;:!?])(?=\s|$)", r"\1", t)
    return t.strip()


CANON = ["Cali Rivera", "Costa Rica", "Taller del Artista", "Musas del Cántaro", "Sueños en Azul", "Detrás de la ventana",
         "Exvotos", "Plegaria", "La Cofradía", "Atmósfera", "Poetry", "Ave Fénix", "La Nación", "Teletica", "Meer Arte",
         "Teatro Nacional", "La Teja", "Ticoclub", "Agulha Revista de Cultura", "El agua es oro", "Alquimia de almas",
         "Biomaster", "Prayer Flags", "Identidad", "Elementos", "Corpus Christi", "Revelaciones", "Sincretismo religioso",
         "Geometría del silencio", "Alquimia", "Cali", "Rivera"]


def sentence_case(t):
    """Headings come in ALL CAPS from the old builder; store them in sentence case."""
    t = clean(t)
    letters = [c for c in t if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.8:
        low = t.lower()
        t = low[:1].upper() + low[1:]
        for w in CANON:
            t = re.sub(r"\b" + re.escape(w) + r"\b", w, t, flags=re.I)
        t = t[:1].upper() + t[1:]
    return t


def image(rel, alt=""):
    """ImageAsset from a source path (assets/... or legacy/assets/...)."""
    if not rel:
        return None
    group = rel.split("/")[1] if rel.startswith("assets/") else "archivo"
    MEDIA_LIST[rel] = group
    m = MANIFEST.get(rel)
    if not m:
        return {"src": "/" + rel, "alt": alt}
    out = {"src": m["src"], "alt": alt, "width": m["width"], "height": m["height"], "widths": m["widths"],
           "placeholder": m["placeholder"], "color": m["color"]}
    if m.get("lowRes"):
        out["lowRes"] = True
    if m.get("aiAltered") or AI.get(rel):
        out["aiAltered"] = True
    return out


def file_url(local):
    """assets/files/x-HASH.pdf → /files/x.pdf (copied by this script into web/public/files)."""
    if not local:
        return None
    base = os.path.basename(local)
    name = re.sub(r"-[A-Za-z0-9]{16}(?=\.[a-z0-9]+$)", "", base)
    src = os.path.join(ROOT, local)
    dst_dir = os.path.join(ROOT, "web", "public", "files")
    if os.path.exists(src):
        os.makedirs(dst_dir, exist_ok=True)
        dst = os.path.join(dst_dir, name)
        if not os.path.exists(dst):
            try:
                os.link(src, dst)
            except OSError:
                shutil.copyfile(src, dst)
    return "/files/" + name


def file_note(local, kind):
    p = os.path.join(ROOT, local) if local else None
    size = ""
    if p and os.path.exists(p):
        mb = os.path.getsize(p) / 1e6
        size = f" · {mb:.0f} MB" if mb >= 1 else " · <1 MB"
    return {"pdf": "PDF", "doc": "Word", "audio": "Audio"}.get(kind, kind) + size


def clean_url(u):
    u = re.sub(r"[?&]utm_source=chatgpt\.com", "", u)
    return u.rstrip("?&")


def internal(href):
    return href if href and href.startswith("/") else None


# ---------------------------------------------------------------- raw page → sections
def raw_sections(page):
    """Ordered blocks per raw section, from positioned elements (top, left)."""
    out = []
    for s in page.get("sections", []):
        els = sorted(s.get("elements", []), key=lambda e: (e.get("desktop", {}).get("top", 0), e.get("desktop", {}).get("left", 0)))
        blocks, links = [], []
        for e in els:
            t = e["type"]
            if t == "GridTextBox":
                pending_heading = []
                for item in e.get("text", []):
                    tag, txt = item.get("tag", "p"), clean(item.get("text"))
                    if not txt:
                        continue
                    if tag in ("h1", "h2", "h3", "h4"):
                        pending_heading.append(txt)
                        continue
                    if pending_heading:
                        blocks.append({"type": "heading", "level": 2, "text": " ".join(pending_heading)})
                        pending_heading = []
                    blocks.append({"type": "paragraph", "text": txt, **({"lead": True} if tag in ("h5", "h6") else {})})
                if pending_heading:
                    blocks.append({"type": "heading", "level": 2, "text": " ".join(pending_heading)})
            elif t == "GridImage" and e.get("image"):
                blocks.append({"type": "image", "src": e["image"]})
            elif t == "GridGallery":
                blocks.append({"type": "gallery", "srcs": e.get("gallery", [])})
            elif t == "GridButton" and e.get("link"):
                links.append(e["link"])
            elif t == "GridVideo" and e.get("video", {}).get("href"):
                v = e["video"]
                blocks.append({"type": "video", "url": v["href"], "poster": v.get("thumb")})
            elif t == "GridMap":
                pass
        out.append({"heading": clean(s.get("heading")), "blocks": blocks, "links": links,
                    "background": (s.get("background") or {}).get("localPath")})
    return out


def to_blocks(raw, prefix, alt="", skip_first_heading=False, drop=()):
    """Raw intermediate blocks → model Block[]."""
    res = []
    seen_heading = False
    for b in raw:
        if b["type"] == "heading":
            if skip_first_heading and not seen_heading:
                seen_heading = True
                continue
            seen_heading = True
            if b["text"] in drop:
                continue
            ht = sentence_case(b["text"])
            if ht.endswith("?") and "¿" not in ht:
                ht = "¿" + ht[:1].upper() + ht[1:]
            res.append({"type": "heading", "id": bid(prefix), "level": 2, "text": ht})
        elif b["type"] == "paragraph":
            if b["text"] in drop:
                continue
            blk = {"type": "paragraph", "id": bid(prefix), "text": b["text"]}
            if b.get("lead"):
                blk["lead"] = True
            res.append(blk)
        elif b["type"] == "image":
            im = image(b["src"], alt)
            if im:
                res.append({"type": "image", "id": bid(prefix), "image": im})
        elif b["type"] == "gallery":
            ims = [image(p, alt) for p in dict.fromkeys(b["srcs"])]
            ims = [i for i in ims if i]
            if ims:
                res.append({"type": "gallery", "id": bid(prefix), "images": ims})
        elif b["type"] == "video":
            v = {"type": "video", "id": bid(prefix), "url": b["url"]}
            res.append(v)
    return res


def link_items(links):
    items = []
    for l in links:
        href, local = l.get("href") or "", l.get("localPath")
        label = sentence_case(l.get("text") or "")
        if local:
            ext = local.rsplit(".", 1)[-1].lower()
            kind = {"pdf": "pdf", "docx": "doc", "mp3": "audio"}.get(ext, "pdf")
            items.append({"label": label, "href": file_url(local), "note": file_note(local, kind), "kind": "doc" if kind == "doc" else "pdf"})
        elif href.startswith("https://wa.me"):
            items.append({"label": label, "href": href, "kind": "whatsapp"})
        elif href.startswith("/"):
            items.append({"label": label, "href": href, "kind": "internal"})
        elif href:
            items.append({"label": label, "href": clean_url(href), "kind": "external"})
    return [i for i in items if i["label"] and i["href"]]


def publishable(id_, extra):
    return {"id": id_, "slug": id_, "status": "published", "createdAt": NOW, "updatedAt": NOW, **extra}


# ---------------------------------------------------------------- settings
taller_raw = load("taller-del-artista")
settings = {
    "id": "site",
    "siteName": "Cali Rivera",
    "tagline": "El arte es para ser libres.",
    "email": "arte@calirivera.com",
    "location": "San José, Costa Rica",
    "social": [
        {"label": "Instagram", "href": "https://www.instagram.com/caliriveraartista"},
        {"label": "Facebook", "href": "https://www.facebook.com/elarteparaserlibres/"},
    ],
    "footerNote": "Obra viva y legado artístico desde Costa Rica.",
    "address": "300 m este del Saint Gregory School, La Unión, Tres Ríos, Costa Rica",
    "whatsapp": "+506 8348 3785",
    "hours": [
        {"days": "Martes a jueves", "time": "4 p. m. – 12 a. m."},
        {"days": "Viernes y sábado", "time": "4 p. m. – 2 a. m."},
        {"days": "Domingo", "time": "4 p. m. – 12 a. m."},
    ],
    "mapUrl": "https://maps.google.com/maps?q=Taller%20del%20Artista%2C%20Tres%20R%C3%ADos%2C%20Cartago",
    "contentVersion": "1",
    "updatedAt": NOW,
}
write("settings.json", settings)

# ---------------------------------------------------------------- biografía
bio = raw_sections(load("biografia"))
bio_sections = []
layouts = ["kinetic-statement", "split-sticky", "editorial-columns", "split-sticky", "fullbleed-image",
           "split-sticky", "horizontal-track", "fullbleed-image"]
for i, s in enumerate(bio[:8]):
    if i == 0:
        continue  # el hero (CALI RIVERA) va en page.hero
    blocks = to_blocks(s["blocks"], f"bio{i}", alt="Cali Rivera")
    key = slugify(s["heading"])
    sec = {"id": key, "layout": "auto", "blocks": blocks}
    if s["heading"].startswith("2017"):
        sec["id"] = "de-las-cenizas"
        sec["layout"] = "auto"
        sec["tone"] = "ink"
    bio_sections.append(sec)

# Exposiciones destacadas → timeline (va en Trayectoria, no en Biografía)
expo_raw = bio[8]
paras = [clean(p) for p in load("biografia")["sections"][8]["paragraphs"] if clean(p)]
timeline, year = [], None
KW = r"\s(Exposici[oó]n|Inauguraci[oó]n|Instalaci[oó]n|Intervenci[oó]n|Participaci[oó]n|Performance|Muestra|Residencia|Concierto|Trienal|Bienal|Proyecto|Obra)\b"
expo_intro = None
for p in paras:
    if re.fullmatch(r"(19|20)\d\d(\s*[–-]\s*(19|20)?\d\d)?", p):
        year = p
        continue
    if year is None:
        expo_intro = p
        continue
    m = re.search(KW, p)
    if m and m.start() > 3:
        timeline.append({"year": year, "title": p[: m.start()].strip(), "detail": p[m.start():].strip()})
    else:
        timeline.append({"year": year, "title": p})

bio_page = publishable("biografia", {
    "title": "Biografía",
    "description": "Artista multidisciplinario costarricense, San José, 1969. Pintura, textiles, instalación y el Taller del Artista.",
    "hero": {"title": "Cali Rivera", "subtitle": "Artista multidisciplinario costarricense · San José, 1969"},
    "sections": bio_sections,
})
write("pages/biografia.json", bio_page)

# ---------------------------------------------------------------- home
home_raw = raw_sections(load("home"))
home = publishable("inicio", {
    "title": "Inicio",
    "description": "Cali Rivera, artista multidisciplinario costarricense. Colecciones, catálogos y el Taller del Artista.",
    "hero": {"title": "Cali Rivera", "subtitle": "El arte es para ser libres.", "cta": {"label": "Conocer a Cali", "href": "/biografia"}},
    "sections": [
        {"id": "quien-es", "layout": "kinetic-statement", "blocks": [
            {"type": "heading", "id": bid("home"), "level": 2, "text": "¿Quién es Cali?"},
            {"type": "paragraph", "id": bid("home"), "text": "Una vida dedicada a transformar ideas, símbolos y emociones en arte.", "lead": True},
        ]},
        {"id": "colecciones", "layout": "horizontal-track", "blocks": [
            {"type": "heading", "id": bid("home"), "level": 2, "text": "Colecciones"},
            {"type": "paragraph", "id": bid("home"), "text": "Una trayectoria contada a través de obras, símbolos y distintas etapas de creación."},
        ]},
    ],
})
hero_img = next((b for s in home_raw for b in s["blocks"] if b["type"] == "image"), None)
write("pages/inicio.json", home)

# ---------------------------------------------------------------- colecciones
idx = load("_index")
colls_idx = {c["slug"]: c for c in idx["collections"]}
coll_intro = raw_sections(load("colecciones"))[0]
coll_page = publishable("colecciones", {
    "title": "Colecciones",
    "description": "Siete capítulos de la obra de Cali Rivera, de Atmósfera (1993) a La Cofradía (2017).",
    "sections": [{"id": "intro", "layout": "editorial-columns",
                  "blocks": to_blocks([b for b in coll_intro["blocks"] if b["type"] == "paragraph"], "coll")}],
})
write("pages/colecciones.json", coll_page)

ORDER = ["atmosfera", "musas-del-cantaro", "suenos-en-azul", "detras-de-la-ventana", "plegaria", "exvotos", "la-cofradia"]
PERIOD = {"atmosfera": "1993", "plegaria": "2001 · 2011"}  # del menú de obras del sitio viejo
NAMED = {
    "america-oficial-Shy93QR6kRaf7u0j.jpeg": "América Descubierta",
    "frida-TVyRcbUkKaSvmHI1.png": "Frida Kahlo",
}
all_artworks = []
for order, slug in enumerate(ORDER):
    ci = colls_idx[slug]
    raw = raw_sections(load(slug))
    title = ci["name"] if slug != "detras-de-la-ventana" else "Detrás de la ventana"
    period = ci.get("years") or PERIOD.get(slug)
    # statement = primer párrafo con texto propio; body = el resto (sin la galería)
    body_raw, gallery = [], []
    for s in raw:
        for b in s["blocks"]:
            if b["type"] == "gallery":
                gallery += b["srcs"]
            elif b["type"] == "image" and s["heading"].lower().startswith("galer"):
                gallery.append(b["src"])
            else:
                body_raw.append(b)
        if s["links"]:
            body_raw.append({"type": "_links", "links": s["links"]})
    # galería: imágenes de galería + imágenes de las páginas (sin repetir)
    for b in body_raw:
        if b["type"] == "image":
            gallery.append(b["src"])
    gallery = list(dict.fromkeys(gallery))
    drop = {title, title.upper(), ci["name"].upper(), "Galería", period or "", ci.get("subtitle") or ""}
    blocks = []
    for b in body_raw:
        if b["type"] == "_links":
            items = link_items(b["links"])
            if items:
                blocks.append({"type": "links", "id": bid(slug), "items": items})
            continue
        if b["type"] == "image":
            continue
        if b["type"] in ("heading", "paragraph"):
            txt = b["text"]
            norm = re.sub(r"[.\s]+$", "", txt).upper()
            if (txt in drop or re.fullmatch(r"(19|20)\d\d([–-](19|20)?\d\d)?", txt) or norm == title.upper()
                    or re.match(r"^(19|20)\d\d\s*·", txt) or re.fullmatch(re.escape(title.upper()) + r"\s*\((19|20)\d\d\)", norm)):
                continue
            if slug == "detras-de-la-ventana" and txt.lower().startswith("la tierra como elemento"):
                continue
        blocks += to_blocks([b], slug)
    # multimedia del índice (audio / video)
    for m in ci.get("media") or []:
        if m.endswith(".mp3"):
            blocks.append({"type": "audio", "id": bid(slug), "src": file_url(m), "title": f"{title} (audio)"})
    # párrafos cortos sin punto final que preceden a texto → subtítulos
    for k, b in enumerate(blocks[:-1]):
        if b["type"] == "paragraph" and len(b["text"]) < 60 and not re.search(r"[.!?»\"”]$", b["text"]) and blocks[k + 1]["type"] == "paragraph":
            blocks[k] = {"type": "heading", "id": b["id"], "level": 3, "text": b["text"]}
    sub = ci.get("subtitle")
    cleaned = []
    for k, b in enumerate(blocks):
        if b["type"] == "heading":
            up = b["text"].upper().rstrip(".")
            if up and up in title.upper():
                continue  # trozos del título ("MUSAS" / "DEL CÁNTARO")
            if b["text"].startswith("Cali Rivera-Comercial"):
                continue  # crédito de la cita
            if not sub and k + 1 < len(blocks) and blocks[k + 1]["type"] == "heading":
                sub = b["text"]  # "El origen de un universo pictórico"
                continue
        cleaned.append(b)
    blocks = cleaned
    if sub and not ci.get("subtitle"):
        ci = {**ci, "subtitle": sub}
    statement = next((b["text"] for b in blocks if b["type"] == "paragraph"), None)
    if statement:
        blocks = [b for b in blocks if not (b["type"] == "paragraph" and b["text"] == statement)]
    artwork_ids = []
    for n, src in enumerate(gallery, 1):
        base = os.path.basename(src)
        named = NAMED.get(base)
        aid = slugify(named) if named else f"{slug}-{n:02d}"
        im = image(src, f"{named or 'Obra'} — {title}{', ' + period if period else ''}")
        art = publishable(aid, {
            "title": named or "Sin título",
            "collectionId": slug,
            "images": [im],
            "aiAltered": bool(im.get("aiAltered")),
            "order": n,
        })
        if period and "·" not in period:
            art["year"] = period
        if ci.get("technique"):
            art["technique"] = ci["technique"]
        if not named:
            art["notes"] = "Ficha técnica pendiente (título, medidas)."
        write(f"artworks/{aid}.json", art)
        artwork_ids.append(aid)
        all_artworks.append(art)
    coll = publishable(slug, {
        "title": title,
        "artworkIds": artwork_ids,
        "order": order,
    })
    if period: coll["period"] = period
    if ci.get("subtitle"): coll["subtitle"] = ci["subtitle"]
    if ci.get("technique"): coll["technique"] = ci["technique"]
    if statement: coll["statement"] = statement
    if blocks: coll["body"] = blocks
    if gallery:
        coll["cover"] = image(gallery[0], f"{title}")
    if ci.get("catalog"):
        coll["catalogUrl"] = file_url(ci["catalog"])
    if not gallery and not statement:
        coll["status"] = "draft"  # Atmósfera, Plegaria, La Cofradía: falta contenido real
    write(f"collections/{slug}.json", coll)

# ---------------------------------------------------------------- catálogos y proyectos
cat_raw = raw_sections(load("catalogos-and-proyectos"))
cat_years = {"ALQUIMIA 2008": "2008", "EL AGUA ES ORO": "2020", "LA COFRADÍA": "2017", "EXVOTOS": "2012",
             "SINCRETISMO RELIGIOSO": "2014", "REVELACIONES": "2015", "IDENTIDAD": "2000–2005", "PRAYER FLAGS": "2003",
             "CORPUS CHRISTI": "2010", "BIOMASTER": "2024"}
for n, c in enumerate(idx["catalogs"]):
    title = sentence_case(c["title"])
    title = re.sub(r"\s+20\d\d$", "", title)
    cid = slugify(title)
    doc = publishable(cid, {"kind": "catalog", "title": title, "body": [], "order": n})
    if c.get("localPath"):
        doc["fileUrl"] = file_url(c["localPath"])
        doc["summary"] = file_note(c["localPath"], "pdf")
    y = cat_years.get(c["title"].upper())
    if y: doc["year"] = y
    write(f"catalogs/{cid}.json", doc)

# Proyecto POETRY (texto propio de Cali)
poetry = next(s for s in cat_raw if s["heading"].upper().startswith("POETRY"))
pb = to_blocks(poetry["blocks"], "poetry", alt="Poetry, 2001", skip_first_heading=True)
pb = [b for b in pb if not (b["type"] == "paragraph" and b["text"].lower().startswith("una poesía contada"))]
write("catalogs/poetry.json", publishable("poetry", {
    "kind": "project", "title": "Poetry", "year": "2001",
    "summary": "Una poesía contada con imágenes y sonidos.", "body": pb, "order": 100,
}))

# Reseña de Alfonso Chase (La Prensa Libre, 2009) → quote en la página de catálogos
chase = next((b["text"] for s in cat_raw for b in s["blocks"] if b["type"] == "paragraph" and "pintores ecológicos" in b["text"]), None)
cat_page_sections = [
    {"id": "intro", "layout": "editorial-columns", "blocks": to_blocks(
        [b for b in cat_raw[0]["blocks"] if b["type"] == "paragraph"], "catp")},
]
if chase:
    cite = next((b["text"] for s in cat_raw for b in s["blocks"] if b["type"] == "paragraph" and "Chase" in b["text"] and b["text"] != chase), None)
    cat_page_sections.append({"id": "resena", "layout": "poem-center", "blocks": [
        {"type": "quote", "id": bid("catp"), "text": chase.replace("★★★★★", "").strip(), "cite": cite or "Alfonso Chase, La Prensa Libre, 5 de marzo de 2009"}]})
write("pages/catalogos-and-proyectos.json", publishable("catalogos-and-proyectos", {
    "title": "Catálogos & Proyectos",
    "description": "Catálogos digitales, fichas técnicas y el archivo de proyectos de Cali Rivera.",
    "sections": cat_page_sections,
}))

# ---------------------------------------------------------------- taller del artista
tr = raw_sections(taller_raw)
t_sections = []
origin = next(s for s in tr if s["heading"].startswith("Un lugar"))
t_sections.append({"id": "origen", "layout": "split-sticky", "blocks": to_blocks(origin["blocks"], "taller", alt="Taller del Artista")})
vids = [b for s in tr for b in s["blocks"] if b["type"] == "video"]
video_intro = next((b for s in tr if s["heading"] == "Videoteca" for b in s["blocks"] if b["type"] == "paragraph"), None)
vt = [{"type": "heading", "id": bid("taller"), "level": 2, "text": "Videoteca"}]
if video_intro:
    vt.append({"type": "paragraph", "id": bid("taller"), "text": video_intro["text"]})
vt += [{"type": "video", "id": bid("taller"), "url": v["url"], **({"poster": v["poster"]} if v.get("poster") else {})} for v in vids]
t_sections.append({"id": "videoteca", "layout": "horizontal-track", "blocks": vt})
hero_t = next(s for s in tr if s["heading"].upper().startswith("TALLER"))
hero_img_t = next((b["src"] for s_ in tr for b in s_["blocks"] if b["type"] == "image" and "edificio" in b["src"]), None) or next((b["src"] for b in hero_t["blocks"] if b["type"] == "image" and "ventana-blanca" not in b["src"]), None) or next((b["src"] for b in origin["blocks"] if b["type"] == "image"), None)
taller_page = publishable("taller-del-artista", {
    "title": "Taller del Artista",
    "description": "Desde el año 2000, un espacio en Tres Ríos donde el arte, la gastronomía y la historia se encuentran.",
    "hero": {"title": "Taller del Artista", "subtitle": "Donde el arte, la gastronomía y la historia se encuentran para crear una experiencia que no existe en ningún otro lugar."},
    "sections": t_sections,
})
if hero_img_t:
    taller_page["hero"]["image"] = image(hero_img_t, "Taller del Artista, Tres Ríos")
menu = idx.get("taller", {}).get("menuPdf")
if menu:
    taller_page["sections"].insert(1, {"id": "visita", "layout": "editorial-columns", "blocks": [
        {"type": "links", "id": bid("taller"), "title": "Visitar el Taller", "items": [
            {"label": "Escribir por WhatsApp", "href": "https://wa.me/50683483785", "kind": "whatsapp"},
            {"label": "Cómo llegar", "href": settings["mapUrl"], "kind": "map"},
            {"label": "Menú del Taller", "href": file_url(menu), "note": file_note(menu, "pdf"), "kind": "pdf"},
        ]}]})
write("pages/taller-del-artista.json", taller_page)

# ---------------------------------------------------------------- trayectoria & entrevistas
press_links = [p for p in idx["pressAndCV"] if not p.get("localPath")]
cv_links = [p for p in idx["pressAndCV"] if p.get("localPath")]
OUTLET_YEAR = {"LA NACIÓN": "2015", "TEATRO NACIONAL": "2016", "AGULHA REVISTA DE CULTURA": "2017", "LA TEJA": "2017"}
tray_sections = [
    {"id": "curriculum", "layout": "editorial-columns", "blocks": [
        {"type": "links", "id": bid("tray"), "title": "Currículum", "items": [
            {"label": "Currículum en español", "href": file_url(p["localPath"]), "note": file_note(p["localPath"], "pdf" if p["localPath"].endswith(".pdf") else "doc"),
             "kind": "pdf" if p["localPath"].endswith(".pdf") else "doc"} if p["title"].upper() == "ESPAÑOL" else
            {"label": "Curriculum vitae (English)", "href": file_url(p["localPath"]), "note": file_note(p["localPath"], "doc"), "kind": "doc"}
            for p in cv_links]}]},
    {"id": "entrevistas", "layout": "editorial-columns", "blocks": [
        {"type": "links", "id": bid("tray"), "title": "Entrevistas nacionales e internacionales", "items": [
            {"label": sentence_case(p["title"]), "href": clean_url(p["href"]), "kind": "external"} for p in press_links]}]},
]
if expo_intro or timeline:
    tb = []
    if expo_intro:
        tb.append({"type": "paragraph", "id": bid("tray"), "text": expo_intro})
    tb.append({"type": "timeline", "id": bid("tray"), "items": timeline})
    tray_sections.insert(0, {"id": "exposiciones", "title": "Exposiciones destacadas", "layout": "editorial-columns", "blocks": tb})

# Puntos de vista (críticas 1995–2011 del sitio viejo, con enlace al archivo)
pv_items = []
for e in json.load(open(os.path.join(L, "prensa.json"))):
    if "puntos-de-vista/" not in e["url"] or not re.search(r"/\d+-", e["url"]):
        continue
    t = clean(e.get("title"))
    if not t or t.lower().startswith("cali rivera") or t.lower().startswith("puntos"):
        slug = re.sub(r"\.html$", "", e["url"].rsplit("/", 1)[-1])
        slug = re.sub(r"^\d+-", "", slug)
        t = slug.replace("-", " ").replace("qelementosq", "«Elementos»").strip()
        t = t[:1].upper() + t[1:]
    t = t.rstrip(".")
    y = re.search(r"(19|20)\d\d", t + " " + e["url"])
    pv_items.append({"label": t, "href": e["archive"], "note": "Archivo del sitio original" + (f" · {y.group(0)}" if y else ""), "kind": "external", "_y": y.group(0) if y else "0"})
pv_items.sort(key=lambda x: x["_y"], reverse=True)
for x in pv_items: x.pop("_y")
if pv_items:
    tray_sections.append({"id": "puntos-de-vista", "layout": "editorial-columns", "blocks": [
        {"type": "links", "id": bid("tray"), "title": "Puntos de vista: crítica y prensa, 1995–2011", "items": pv_items}]})
write("pages/trayectoria-and-entrevistas.json", publishable("trayectoria-and-entrevistas", {
    "title": "Trayectoria & Entrevistas",
    "description": "Exposiciones, currículum, entrevistas y crítica sobre la obra de Cali Rivera.",
    "sections": tray_sections,
}))

# ---------------------------------------------------------------- manifiesto (Mi visión, sitio viejo)
man = json.load(open(os.path.join(L, "manifiesto.json")))
mv = next((m for m in man if "mi-vision" in m["url"] and (m.get("text") or "").find("Mi\nvisión") >= 0), man[0])
txt = mv["text"]
start = txt.find("Soy artista")
body = txt[start:] if start >= 0 else ""
end_markers = ["Visita nuestro Facebook", "Dirección:", "Anterior\n", "350 MTS", "ARTE@CALIRIVERA.COM", "©"]
cut = min([body.find(m) for m in end_markers if body.find(m) > 0] or [len(body)])
paras = [clean(p) for p in body[:cut].split("\n") if len(clean(p)) > 40]
man_blocks = []
if paras:
    first = paras[0]
    sents = re.split(r"(?<=[.,])\s+", first)
    man_blocks.append({"type": "poem", "id": bid("man"), "title": "Mi visión", "author": "Cali Rivera", "lines": [s for s in sents if s]})
    man_blocks_rest = [{"type": "paragraph", "id": bid("man"), "text": p} for p in paras[1:]]
else:
    man_blocks_rest = []
write("pages/manifiesto.json", publishable("manifiesto", {
    "title": "Manifiesto",
    "description": "Mi visión: el texto de Cali Rivera sobre el arte, la paz y la unidad.",
    "hero": {"title": "El arte es para ser libres."},
    "sections": [
        {"id": "mi-vision", "layout": "poem-center", "blocks": man_blocks},
        *([{"id": "historia", "layout": "editorial-columns", "tone": "paper", "blocks": man_blocks_rest}] if man_blocks_rest else []),
    ],
}))

# ---------------------------------------------------------------- programas (texto de la llamada con Cali, nov 2026)
programs = [
    ("colaboracion", "Programa de Colaboración al Artista Nacional", None,
     "Durante 26 años el Taller del Artista ha puesto su espacio, su escenario y lo poco que tiene al servicio de otros artistas.",
     [
         "Una primera tarima para quien empieza, vestuario para quien sale del país a competir, un recibimiento para quien vuelve con un premio, un evento para recaudar fondos cuando alguien lo necesita.",
         "Es trabajo que se hace desde el amor y que casi nunca se ve. Aquí queremos nombrar a quienes han pasado por el Taller y lo que lograron.",
         "Entre ellos: un artista del origami que hoy es primer lugar mundial en halterofilia; un grupo de porristas con síndrome de Down campeón del mundo; una cantante que obtuvo el segundo lugar en un festival internacional de ópera en Perú; y La Semilla de Danza, que dio sus primeros pasos en esta tarima antes de llegar al Teatro Nacional.",
     ]),
    ("incubadora", "La Incubadora", "Jueves",
     "Una vez por semana, los jueves, el Taller abre su espacio a la literatura.",
     ["Poetas, escritores, cuentistas: cualquier forma de la palabra tiene lugar aquí. Cada autor que pasa por La Incubadora queda en esta página, con un fragmento de su obra."]),
    ("jovenes-talentos", "Jóvenes Talentos", "Viernes",
     "Los viernes el escenario es de los jóvenes talentos.",
     ["Músicos, sobre todo, y también bailarines que hacen performance entre la gente. El espacio está abierto a quien lo pida."]),
]
for n, (kind, title, sched, summary, paras) in enumerate(programs):
    doc = publishable(kind, {"kind": kind, "title": title, "summary": summary, "order": n,
                             "body": [{"type": "paragraph", "id": bid(kind), "text": p} for p in paras]})
    if sched: doc["schedule"] = sched
    write(f"programs/{kind}.json", doc)

# ---------------------------------------------------------------- bitácora (agenda del Taller 2010–2020, sitio viejo)
LEG_IDX = json.load(open(os.path.join(ROOT, "legacy", "assets", "_index.json")))
NAV = set()
for e in json.load(open(os.path.join(L, "actividades_taller.json"))):
    pass
NAV_WORDS = {"Inicio", "Histórico", "Cali Rivera", "Biografía", "Curriculum Vitae", "Exposiciones", "Puntos de Vista", "Obras",
             "Taller del Artista", "Café - Arte", "Vistas del Café Arte", "Actividades Recientes", "Recomendaciones", "Videos",
             "GUÍA DE NAVEGACIÓN", "/", "Anterior", "Siguiente", "Contactanos", "Buscar", "Menu", "Leer más...", "Regresar al Sitio"}
FOOT = ["Visita nuestro Facebook", "Tweet", "350 mts este", "Compartir", "Dirección:", "350 MTS ESTE", "ARTE@CALIRIVERA.COM", "© 20", "fab fa-"]


def legacy_img(src):
    if not src:
        return None
    s = re.sub(r"#.*$", "", src)
    s = re.sub(r"^https?://(www\.)?", "", s).lstrip("/")
    s = s.replace("//", "/")
    if not s.startswith("calirivera.com"):
        s = "calirivera.com/" + s
    for k in (s, s.replace("calirivera.com/", "calirivera.com/~calirive/")):
        if k in LEG_IDX:
            return "legacy/assets/" + LEG_IDX[k]
    return None


def article(e):
    lines = [clean(x) for x in (e.get("text") or "").split("\n")]
    # empezar después de la última línea del menú (Videos/Contactanos) o del breadcrumb
    start = 0
    title = None
    tweeted = False
    menu_done = False
    for i, x in enumerate(lines[:400]):
        if (x == "Videos" or x.startswith("Atmósfera - 19")) and not menu_done:
            start, menu_done = i + 1, (x == "Videos")
        if x == "GUÍA DE NAVEGACIÓN" and i - start < 25:
            start = i + 1
        if x == "Tweet" and not tweeted:  # plantilla 2012–2015: título antes de "Imprimir", cuerpo después de "Tweet"
            start, tweeted = i + 1, True
        if x == "Imprimir" and i > 0 and not title:
            title = lines[i - 1]
    body = []
    for x in lines[start:]:
        if any(x.startswith(f) for f in FOOT):
            break
        if not x or x in NAV_WORDS or x in ("guia", "de", "navegacion", "top", "Correo electrónico") or re.fullmatch(r"Bandera\d", x) or x.startswith("Hacer click en la lupa"):
            continue
        if "�" in x:
            continue
        body.append(x)
    # quitar breadcrumb duplicado del título
    while len(body) > 1 and body[0] == body[1]:
        body.pop(0)
    if body and body[0] in ("Cali Rivera-Taller del Artista", "Cali Rivera"):
        body.pop(0)
    if title and (not body or body[0] != title):
        body.insert(0, title)
    return body


def date_of(e, title):
    hay = (title + " " + e["url"]).lower().replace("-", " ")
    y = re.search(r"\b(20[01]\d|202\d)\b", hay)
    m = None
    for name, num in sorted(MONTHS.items(), key=lambda kv: -len(kv[0])):
        if re.search(r"\b" + name + r"\b", hay):
            m = num
            break
    d = re.search(r"\b(\d{1,2})\s+(dic|nov|oct|set|sep|ago|jul|jun|may|abr|mar|feb|ene)", hay)
    if not y:
        return None
    if not m:
        return None
    return f"{y.group(1)}-{(m or 1):02d}-{int(d.group(1)) if d else 1:02d}T12:00:00Z"


SEEN_TEXT = set()
def paras_ok(body, title):
    """Descarta duplicados de la misma agenda publicada en otra plantilla (mismo primer párrafo)."""
    first = next((p for p in body if p != title and len(p) > 60), "")[:120]
    if not first or first in SEEN_TEXT:
        return False
    SEEN_TEXT.add(first)
    return True

posts, seen = [], set()
sources = json.load(open(os.path.join(L, "actividades_taller.json"))) + json.load(open(os.path.join(L, "historico.json")))
for e in sources:
    body = article(e)
    if len(" ".join(body)) < 300:
        continue
    title = body[0] if body else clean(e.get("title"))
    if title.lower().startswith(("cali rivera", "actividades recientes")) and len(body) > 1:
        title = body[1]
    if re.search(r"\b(19|20)\d\d\.?$", title) and re.match(r"^[A-ZÁÉÍÓÚ][a-záéíóú]+ [A-Za-záéíóú]+, Costa Rica", title):
        # línea de fecha ("Tres Ríos, Costa Rica 9 de abril del 2007.") → título desde la URL
        m = re.search(r"/\d+-([a-z0-9-]+?)(\.html)?$", e["url"])
        if m:
            t2 = m.group(1).replace("qel-", "el-").replace("q", "") if m.group(1).startswith("qel") else m.group(1)
            t2 = re.sub(r"(^|-)q|q($|-)", r"\1\2", m.group(1)).replace("-", " ").strip()
            published = date_of({"url": ""}, title)
            title = (t2[:1].upper() + t2[1:]).replace("manifiesto de irazu", "Manifiesto de Irazú")
    published = date_of(e, title) or date_of({"url": ""}, " ".join(body[:2])) or date_of({"url": ""}, " ".join(body[:6]))
    approx = False
    if not published:
        y = re.search(r"\b(20[01]\d|202\d)\b", title + " " + e["url"])
        if not y:
            continue
        published, approx = f"{y.group(1)}-01-01T12:00:00Z", True
    key = (published[:7], slugify(title)[:40])
    if title in ("guia", "Fecha") or not paras_ok(body, title):
        continue
    if key in seen or any(k[0] == published[:7] and k[1][:20] == slugify(title)[:20] for k in seen):
        continue
    seen.add(key)
    paras = [p for p in body if p != title and len(p) > 2]
    imgs = []
    for im in e.get("images", []):
        if re.search(r"logo|siguenos|icon|facebook|youtube|twitter|showthumb", im.get("src", ""), re.I):
            continue
        li = legacy_img(im.get("src"))
        if li:
            imgs.append(image(li, clean(im.get("alt")) or title))
    imgs = [i for i in imgs if i]
    pid = slugify(title)
    if pid in {p["id"] for p in posts}:
        pid = f"{pid}-{published[:7]}"
    blocks = []
    if imgs:
        blocks.append({"type": "image", "id": bid("post"), "image": imgs[0]})
    blocks += [{"type": "paragraph", "id": bid("post"), "text": p} for p in paras]
    if len(imgs) > 1:
        blocks.append({"type": "gallery", "id": bid("post"), "images": imgs[1:]})
    excerpt = next((p for p in paras if len(p) > 80), paras[0] if paras else "")
    post = publishable(pid, {
        "title": title, "excerpt": excerpt[:240] + ("…" if len(excerpt) > 240 else ""),
        "body": blocks, "publishedAt": published, "tags": ["archivo"] + (["fecha-aproximada"] if approx else []), "sourceUrl": e.get("archive"),
    })
    if imgs:
        post["cover"] = imgs[0]
    posts.append(post)

for f in glob.glob(os.path.join(C, "posts", "*.json")):
    os.remove(f)
for p in posts:
    write(f"posts/{p['id']}.json", p)

json.dump([{"path": k, "group": v} for k, v in MEDIA_LIST.items()], open(os.path.join(ROOT, "tools", ".media-list.json"), "w"), indent=0)
print(f"pages={len(glob.glob(os.path.join(C,'pages','*.json')))} collections={len(ORDER)} artworks={len(all_artworks)} "
      f"catalogs={len(glob.glob(os.path.join(C,'catalogs','*.json')))} posts={len(posts)} media={len(MEDIA_LIST)} manifest={len(MANIFEST)}")
