#!/usr/bin/env python3
"""
Fichas y fotos de las obras, tomadas de los catálogos en PDF que el sitio ya aloja (web/public/files).

Qué hace (se puede correr varias veces: no duplica):
  · completa título, técnica, medidas y año de las obras con lo que está IMPRESO en cada catálogo;
  · cambia la foto de una obra por la del catálogo cuando esa es más grande o más limpia;
  · agrega las obras que los catálogos traen con ficha y el sitio no tenía.
No inventa nada: cada dato lleva al lado el catálogo y la página de donde sale. Donde dos catálogos no
coinciden, se usa uno y el otro queda anotado en `notes`.

Catálogos escaneados (Exvotos, Alquimia 2008): no tienen texto; las fichas se leyeron página por página.

Uso: python3 tools/catalog-fichas.py      (necesita pymupdf y Pillow con AVIF)
"""
import base64, io, json, os, re
import pymupdf as fitz
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C, PUB, F = f"{ROOT}/content", f"{ROOT}/web/public", f"{ROOT}/web/public/files"
NOW = "2026-11-22T12:00:00Z"
PDF = {"elem": "elementos2.pdf", "ident": "identidad-1-091rtdf8ceodkkzv.pdf", "sinc": "sincretismo_religioso.pdf",
       "corpus": "catalogo_banderas_corpus_christi.pdf", "rev": "revelaciones_plegarias_por_los_pueblos.pdf"}
_docs = {}
log = []


def doc(k):
    if k not in _docs:
        _docs[k] = fitz.open(f"{F}/{PDF[k]}")
    return _docs[k]


def page_image(k, page, pick="area"):
    """La imagen más grande incrustada en esa página del catálogo (o la más alta, para estandartes)."""
    d = doc(k)
    best = None
    for im in d[page - 1].get_images(full=True):
        pix = fitz.Pixmap(d, im[0])
        if pix.width < 300 or pix.height < 300:
            continue
        if pix.colorspace is None:
            continue
        if pix.colorspace.n != 3 or pix.alpha:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        if pix.alpha:
            pix = fitz.Pixmap(pix, 0)
        score = pix.width * pix.height if pick == "area" else pix.height * 10000 + pix.width
        if best is None or score > best[0]:
            best = (score, Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    assert best, (k, page)
    return best[1]


def make_asset(im, rel, alt, cap=2000):
    """Guarda jpg/webp/avif en /media/<rel>-<ancho>.* y devuelve el ImageAsset."""
    im = im.convert("RGB")
    if max(im.size) > cap:
        s = cap / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    full = im.width
    widths = [w for w in (640, 1280) if w < full * 0.9] + [full]
    os.makedirs(os.path.dirname(f"{PUB}/media/{rel}"), exist_ok=True)
    for w in widths:
        v = im if w == full else im.resize((w, round(im.height * w / full)), Image.LANCZOS)
        v.save(f"{PUB}/media/{rel}-{w}.jpg", quality=86, optimize=True, progressive=True)
        v.save(f"{PUB}/media/{rel}-{w}.webp", quality=82, method=6)
        v.save(f"{PUB}/media/{rel}-{w}.avif", quality=60)
    tiny = im.resize((16, max(1, round(16 * im.height / im.width))), Image.LANCZOS)
    buf = io.BytesIO()
    tiny.save(buf, "WEBP", quality=40)
    r, g, b = im.resize((1, 1), Image.BOX).getpixel((0, 0))
    a = {"src": f"/media/{rel}-{full}.jpg", "alt": alt, "width": full, "height": im.height, "widths": widths,
         "placeholder": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(), "color": f"rgb({r} {g} {b})"}
    if max(im.size) < 700:
        a["lowRes"] = True
    return a


def target_w(im, cap=2000):
    return im.width if max(im.size) <= cap else round(im.width * cap / max(im.size))


def load(kind, i):
    p = f"{C}/{kind}/{i}.json"
    return p, json.load(open(p))


def save(p, d):
    d["updatedAt"] = NOW
    with open(p, "w") as fh:
        fh.write(json.dumps(d, ensure_ascii=False, indent=1) + "\n")


COLS = {}


def col_title(cid):
    if cid not in COLS:
        COLS[cid] = json.load(open(f"{C}/collections/{cid}.json"))["title"]
    return COLS[cid]


def alt_for(d, extra=""):
    return f"{d['title']}{extra} — {col_title(d['collectionId'])}, {d['year']}"


def upd(i, images=None, **f):
    """Completa la ficha de una obra que ya existe. `images`: [(PIL, nombre, sufijo del alt)] reemplaza sus fotos."""
    p, d = load("artworks", i)
    before = json.dumps(d, ensure_ascii=False, sort_keys=True)
    note = f.pop("note", None)
    old_title = d["title"]
    for k, v in f.items():
        d[k] = v
    if note and note not in (d.get("notes") or ""):
        old = (d.get("notes") or "").strip()
        d["notes"] = (old + " " if old and not old.startswith("Ficha técnica pendiente") else "") + note
    elif (d.get("notes") or "").startswith("Ficha técnica pendiente") and (f.get("dimensions") or f.get("title")):
        d.pop("notes")
    if images:
        fresh = []
        for im, name, extra in images:
            rel = f"colecciones/{d['collectionId']}/{name}"
            src = f"/media/{rel}-{target_w(im)}.jpg"
            have = next((x for x in d["images"] if x["src"] == src), None)
            if have and os.path.exists(PUB + src):
                have["alt"] = alt_for(d, extra)
                fresh.append(have)
            else:
                fresh.append(make_asset(im, rel, alt_for(d, extra)))
        # las fotos nuevas ocupan los primeros lugares; si la obra tenía más, las demás se conservan
        d["images"] = fresh + [x for x in d["images"][len(fresh):] if x not in fresh]
    elif f.get("title") and f["title"] != old_title and d["images"]:
        for a in d["images"]:
            a["alt"] = a["alt"].replace(old_title, d["title"], 1) if old_title in a["alt"] else alt_for(d)
    if json.dumps(d, ensure_ascii=False, sort_keys=True) != before:
        save(p, d)
        log.append(f"ficha  {i}")


def new(cid, slug, title, year, images, technique=None, dimensions=None, note=None):
    """Una obra que el catálogo trae con ficha y el sitio no tenía."""
    i = f"{cid}-{slug}"
    p = f"{C}/artworks/{i}.json"
    cp, c = load("collections", cid)
    if os.path.exists(p):
        return upd(i, title=title, year=year, **({"technique": technique} if technique else {}), **({"dimensions": dimensions} if dimensions else {}))
    order = 1 + max([json.load(open(f"{C}/artworks/{a}.json")).get("order", 0) for a in c.get("artworkIds", [])] or [0])
    d = {"slug": i, "status": "published", "collectionId": cid, "aiAltered": False, "order": order, "createdAt": NOW, "updatedAt": NOW,
         "id": i, "title": title, "images": [], "year": year}
    d["images"] = [make_asset(im, f"colecciones/{cid}/{name}", alt_for(d, extra)) for im, name, extra in images]
    if technique:
        d["technique"] = technique
    if dimensions:
        d["dimensions"] = dimensions
    if note:
        d["notes"] = note
    save(p, d)
    c.setdefault("artworkIds", []).append(i)
    save(cp, c)
    log.append(f"NUEVA  {i}")


E = lambda page: page_image("elem", page)  # «Elementos. El Manifiesto de Irazú» (2007): una obra con su ficha por página
RES = "Técnica mixta sobre tela, resina"
OLEO = "Óleo sobre tela"

# ───────────────────────── Detrás de la ventana · Sueños en azul (Elementos, págs. 5–23)
upd("detras-de-la-ventana-17", technique=OLEO, dimensions="120 × 90 cm", year=1999)                    # p. 5 «Tu duelo Irazú»
upd("detras-de-la-ventana-10", technique=OLEO, dimensions="90 × 60 cm")                                # p. 15
upd("detras-de-la-ventana-18", technique=OLEO, dimensions="120 × 80 cm", year=1998, images=[(E(21), "delirio", "")])  # p. 21
upd("detras-de-la-ventana-01", technique=OLEO, dimensions="90 × 60 cm")                                # p. 23 «Amanecer»
upd("america-descubierta", technique=OLEO, dimensions="120 × 60 cm", year=1994)         # p. 19

# ───────────────────────── Plegaria, 2001 (Elementos, págs. 25–39 y 103)
MARMOL = "Acrílico y polvo de mármol sobre tela"
ACR = "Acrílico sobre tela"
upd("plegaria-ave-maria", technique=MARMOL, dimensions="150 × 200 cm", images=[(E(25), "ave-maria", "")])
upd("plegaria-fe", technique=MARMOL, dimensions="150 × 200 cm", images=[(E(27), "fe", "")])
upd("plegaria-irazu", technique=ACR, dimensions="150 × 200 cm", images=[(E(29), "irazu", "")], note="Colección pública: Centro Costarricense de la Ciencia y la Cultura.")
upd("plegaria-frecuencia", technique=ACR, dimensions="150 × 200 cm")
upd("plegaria-cielos-liquidos", technique=ACR, dimensions="148 × 196 cm", images=[(E(33), "cielos-liquidos", "")], note="Colección privada.")
new("plegaria", "paisaje-con-cascadas", "Paisaje con cascadas", 2001, [(E(39), "paisaje-con-cascadas", "")], ACR, "200 × 150 cm")
new("plegaria", "bosque-humedo", "Bosque húmedo", 2001, [(E(103), "bosque-humedo", "")], ACR, "90 × 60 cm")

# ───────────────────────── Prayer Flags, 2003: las mismas fotos, más grandes (Elementos)
for n, page in ((1, 45), (3, 43), (5, 49), (7, 51), (8, 123), (9, 71)):
    upd(f"prayer-flags-bandera-{n}", images=[(E(page), f"bandera-{n}", "")])
upd("prayer-flags-bandera-9", note="Hurtada en el Festival Internacional de las Artes (FIA) de 2006.")

# ───────────────────────── El agua como elemento (Elementos, págs. 69–111)
upd("el-agua-como-elemento-del-corazon", technique=RES, dimensions="31 × 81 cm", year=2007, images=[(E(69), "del-corazon", "")])
upd("el-agua-como-elemento-duelo", technique=RES, dimensions="95,5 × 66,5 cm", year=2006, images=[(E(73), "duelo", "")])
upd("el-agua-como-elemento-azul-de-murano", technique=RES, dimensions="60 × 41 cm", year=2007, images=[(E(85), "azul-de-murano", "")], note="Colección privada.")
upd("el-agua-como-elemento-mantos-acuiferos", technique="Técnica mixta sobre tela", dimensions="200 × 150 cm", year="2006–2007", images=[(E(91), "mantos-acuiferos", "")])
upd("el-agua-como-elemento-larga-vida", technique=RES, dimensions="200 × 150 cm", year=2007)
# la que figuraba como «Continentes en duelo» es «Continentes» (2007); «Continentes en duelo» es otra, de 2000–2003 (va en Identidad)
upd("el-agua-como-elemento-continentes-en-duelo", title="Continentes", technique=RES, dimensions="35 × 55 cm", year=2007, images=[(E(89), "continentes", "")])
new("el-agua-como-elemento", "universo-cosmico", "Universo cósmico", 2007, [(E(81), "universo-cosmico", "")], RES, "200 × 150 cm", "Colección privada.")
new("el-agua-como-elemento", "padre-hijo-espiritu-santo", "Padre, Hijo, Espíritu Santo", 2007, [(E(93), "padre-hijo-espiritu-santo", "")], RES, "35 × 55 cm")
new("el-agua-como-elemento", "pequeno-mundo", "Pequeño mundo", 2007, [(E(95), "pequeno-mundo", "")], RES, "152 × 89 cm")
new("el-agua-como-elemento", "puerta-a-otra-dimension", "Puerta a otra dimensión", "2006–2007", [(E(97), "puerta-a-otra-dimension", "")], "Técnica mixta sobre tela", "200 × 150 cm")
new("el-agua-como-elemento", "humanidad", "Humanidad", 2007, [(E(105), "humanidad", "")], RES, "35 × 61 cm", "Colección privada.")
new("el-agua-como-elemento", "reflexion", "Reflexión", "2006–2007", [(E(111), "reflexion", "")], RES, "35 × 61 cm", "El libro no deja legible el año; se anota el período de la serie.")

# ───────────────────────── Identidad 2000–2005 (catálogo de la exposición: 33 obras numeradas; y Elementos)
POSTER = None


def poster(box):
    global POSTER
    if POSTER is None:
        POSTER = page_image("ident", 2)  # la lámina con las 33 obras, 6375 × 2750 px
    return POSTER.crop(box)


upd("identidad-geografia", title="Geografía de un territorio al tiempo", dimensions="154 × 114 cm")                    # n.º 3
upd("identidad-han-derramado-sangre", title="Han derramado sangre en nuestro jardín I", dimensions="60 × 40 cm", year="2002–2003")  # n.º 16
upd("identidad-identidad-917f", dimensions="68 × 52 cm", year=2003)                                                 # n.º 14
upd("identidad-identidad", dimensions="68 × 52 cm", year=2003, images=[(E(55), "identidad-2", "")])                 # n.º 15
upd("identidad-infinito-espacio", dimensions="94 × 64 cm", year=2003, images=[(E(115), "infinito-espacio", "")])    # n.º 22
upd("identidad-irak-dios-america", title="¡Irak! Dios perdone a América", dimensions="46 × 60 cm", year=2005, images=[(E(65), "irak-dios-perdone-a-america", "")])  # n.º 9
upd("identidad-naturalezaq-no-olvide", title="Naturaleza que se empaca para que no se olvide (políptico)", year=2001,
    note="En el libro Elementos, un detalle del políptico figura con 68,5 × 55,5 cm.")                              # n.º 20
upd("identidad-nuestro-mundo-hoy", dimensions="157 × 114 cm", year=2004, images=[(E(101), "nuestro-mundo-hoy", "")], note="Colección privada.")  # n.º 17
upd("identidad-obra-11f8", title="1950, Tierra Tibetana", dimensions="154 × 115 cm", year="2003–2004", images=[(E(63), "1950-tierra-tibetana", "")],
    note="Medidas del libro Elementos; el catálogo Identidad 2000–2005 da 2 × 1,5 m.")                              # n.º 11
upd("identidad-plegaria-por-el-tibet", dimensions="66 × 53,5 cm", year=2002)                                        # n.º 13
upd("identidad-que-pasara", title="¿Y qué pasará con las reservas de petróleo?", dimensions="154 × 114 cm", year=2005, images=[(E(61), "que-pasara-con-las-reservas-de-petroleo", "")])  # n.º 23
upd("identidad-tierra-de-paz", dimensions="110 × 120 cm", year=2002, images=[(poster((5112, 1860, 6312, 2628)), "tierra-de-paz", "")])  # n.º 33
upd("identidad-viva-la-sele", title="¡Viva la Sele!", dimensions="30 × 42 cm", year=2001)                           # n.º 24
TR = "Serie Transmutación."
new("identidad", "se-debe-seguir-escribiendo-la-historia-con-sangre", "¿Se debe seguir escribiendo la historia con sangre?", 2003, [(E(67), "se-debe-seguir-escribiendo-la-historia-con-sangre", "")], RES, "30,5 × 30,5 cm", "Colección privada.")  # n.º 4
new("identidad", "trilogia-de-poder", "Trilogía de poder", "2000–2003", [(poster((100, 792, 500, 1104)), "trilogia-de-poder", "")], RES, "49 × 38 cm", TR)              # n.º 5
new("identidad", "continentes-en-duelo", "Continentes en duelo", "2000–2003", [(poster((96, 1156, 500, 1468)), "continentes-en-duelo", "")], RES, "49 × 38 cm", TR)       # n.º 6
new("identidad", "la-guerra-no-es-cosa-de-ninos", "La guerra no es cosa de niños", "2000–2003", [(poster((100, 1508, 500, 1828)), "la-guerra-no-es-cosa-de-ninos", "")], RES, "49 × 38 cm", TR)  # n.º 7
new("identidad", "sueno-de-cambio", "Sueño de cambio", 2005, [(E(7), "sueno-de-cambio", "")], RES, "46 × 60 cm", "Dedicada a ACERPA. " + TR)                                # n.º 8
new("identidad", "oda-al-maestro", "Oda al Maestro", "2000–2003", [(poster((1126, 2196, 1460, 2612)), "oda-al-maestro", "")], RES, "63 × 51 cm")                         # n.º 12
new("identidad", "transmutacion-triptico", "Transmutación (tríptico)", 2003, [(poster((2524, 1268, 3784, 1780)), "transmutacion-triptico", "")], RES, "55 × 40 cm cada pieza",
    TR + " El libro Elementos da otras medidas para el conjunto (150 × 65 cm).")                                                                                           # n.º 19
new("identidad", "emanuel-i", "Emanuel I. 9 estrellas peregrinas en un mundo sin nombre", "2000–2005", [(poster((4328, 140, 5044, 620)), "emanuel-i", "")], RES, "92 × 63 cm",
    "El catálogo no da el año; se anota el período de la exposición.")                                                                                                     # n.º 21
new("identidad", "entre-rezos-y-flores-humanidad", "Entre rezos y flores. Humanidad", "2000–2003", [(E(109), "entre-rezos-y-flores-humanidad", "")], RES, "90 × 70 cm", TR)  # Elementos, p. 109
# «Identidad mundo» era la obra de Exvotos «Identidad de un mundo material» (2012), repetida aquí por error
dup = f"{C}/artworks/identidad-identidad-mundo.json"
if os.path.exists(dup):
    os.remove(dup)
    cp, c = load("collections", "identidad")
    c["artworkIds"] = [a for a in c["artworkIds"] if a != "identidad-identidad-mundo"]
    save(cp, c)
    log.append("QUITADA identidad-identidad-mundo (repetía exvotos-03)")

# ───────────────────────── Exvotos, 2012 (catálogo escaneado, leído página por página)
MX = "Técnica mixta sobre tela"
upd("exvotos-01", technique=MX, dimensions="215 × 170 cm", note="Obra que abre el catálogo; allí no lleva título.")
for n, (title, dims, year) in {2: ("Ofrenda (Islam)", "70 × 65 cm", 2012), 3: ("Identidad de un mundo material (Judaísmo)", "70 × 65 cm", 2012),
                               4: ("Camino hacia la luz (Budismo)", "70 × 65 cm", 2012), 5: ("Luna azul (Taoísmo)", "70 × 56 cm", 2012),
                               6: ("Unificación (Sijismo)", "70 × 65 cm", 2013), 7: ("El tiempo (Cristianismo)", "70 × 65 cm", 2012),
                               8: ("El comienzo (Sintoísmo)", "70 × 65 cm", 2012), 9: ("Rosemberg contemporáneo (Hinduismo)", "70 × 65 cm", 2012)}.items():
    upd(f"exvotos-{n:02d}", title=title, technique=MX, dimensions=dims, year=year)
upd("exvotos-10", title="Performance de apertura, 21 de diciembre de 2012", note="Cali Rivera, Estelle Zaghloul y Andrea Vargas. Taller del Artista, Tres Ríos.")
upd("exvotos-12", title="Vista de la instalación, 21 de diciembre de 2012", note="Taller del Artista, Tres Ríos. Fotografía del catálogo: Jonathan Delgado Ledezma y José Pablo Porras Monge.")

# ───────────────────────── Alquimia, 2008 (catálogo de la Galería Kandinsky, escaneado)
INV = "Técnica de investigación"
upd("alquimia-cumulos-cirros-y-estratos", technique=INV, dimensions="38 × 80 cm")
upd("alquimia-shakra", technique=INV, dimensions="38 × 80 cm")
upd("alquimia-horeb", technique=INV, dimensions="38 × 80 cm")
upd("alquimia-infinito", technique=INV, dimensions="50 × 67 cm")
upd("alquimia-mericaba", title="Merkaba", technique=INV, dimensions="60 × 60 cm")
upd("alquimia-renacimiento", technique="Arte objeto, instalación. Técnica de investigación: bases de metal porcelanizadas, cuarzos, flores de papel, cristal de Murano, polvo de oro y resina")
upd("alquimia-epifanio", title="Epifanios", technique="Arte objeto, instalación. Técnica de investigación: hormas de madera porcelanizadas, cuarzos, cristal de Murano, polvo de oro y resina")

# ───────────────────────── Sincretismo religioso, 2014 (catálogo): frente y dorso limpios de cada estandarte
S = lambda page: page_image("sinc", page)
ST = "Mixta sobre tela; estandarte de textiles ensamblados"
for i, title, dims, pf in (("transmutacion", "Transmutación", "1,30 × 2,05 m", 12), ("sincretismo", "Sincretismo religioso, un camino para la paz", "1,10 × 3,49 m", 16),
                           ("canto", "Canto a la Libertad", "1,41 × 2,45 m", 24), ("padre-nuestro", "Mantra: Padre nuestro que estás en los cielos", "1,31 × 5,35 m", 28),
                           ("flor", "Flor de la Vida", "1,20 × 2,12 m", 32), ("alegoria", "Alegoría del amor entre los pueblos", "3,37 × 1,23 m", 38)):
    upd(f"sincretismo-religioso-{i}", title=title, technique=ST, dimensions=dims, images=[(S(pf), f"{i}-frente", " (frente)"), (S(pf + 1), f"{i}-dorso", " (dorso)")])
new("sincretismo-religioso", "rezo-del-agua", "Rezo del agua", 2014, [(S(20), "rezo-del-agua-frente", " (frente)"), (S(21), "rezo-del-agua-dorso", " (dorso)")], ST, "1,20 × 5 m")

# ───────────────────────── Banderas de Corpus Christi, 2009 (catálogo, págs. 7–13): las siete, con su ficha
CC = "Taller de San Pedro La Laguna, Sololá, Guatemala. Confección: Rosario Hi González. La foto muestra el frente (arriba) y el reverso (abajo)."
for page, slug, title, dims in ((7, "caridad", "Caridad", "88 × 187 cm"), (8, "el-caracter-sagrado-de-la-tierra", "El carácter sagrado de la Tierra", "79 × 169 cm"),
                                (9, "plegaria-por-los-oceanos", "Plegaria por los océanos", "82 × 140 cm"), (10, "paz", "Paz", "85 × 177 cm"),
                                (11, "transmutacion", "Transmutación", "90 × 181 cm"), (12, "plegaria-por-los-bosques", "Plegaria por los bosques", "97 × 191 cm"),
                                (13, "plegaria-por-el-calentamiento-global", "Plegaria por el calentamiento global", "89 × 177 cm")):
    new("banderas-de-corpus-christi", slug, title, 2009, [(page_image("corpus", page), slug, "")], "Ensamble de textiles intervenido con pintura y objetos", dims, CC)

# ───────────────────────── Revelaciones, 2015 (catálogo): frente y reverso a buen tamaño; medidas de las cuatro que faltaban
RT = "Mixta: ensamble de textiles intervenido con pintura y objetos"
for i, pf, extra in (("rohingyas", 8, {}), ("balticos", 10, {}), ("musulmanes", 12, {}), ("siria", 14, {}), ("israel", 16, {}), ("huicholes", 18, {}), ("butan", 20, {}),
                     ("turquia", 22, {}), ("pigmeos", 24, {"dimensions": "2,50 m × 66 cm"}), ("grecia", 26, {"dimensions": "2,40 m × 65 cm"}),
                     ("inmigrantes", 28, {"dimensions": "2,35 m × 61 cm"}), ("genocidios", 30, {"dimensions": "2,45 m × 63 cm"})):
    if extra:
        extra["technique"] = RT
    upd(f"revelaciones-{i}", images=[(page_image("rev", pf, "alto"), f"{i}-frente", " (frente)"), (page_image("rev", pf + 1, "alto"), f"{i}-reverso", " (reverso)")], **extra)

# ───────────────────────── Frecuencia: la foto del sitio actual (plegaria-2001) es la misma, al doble de tamaño
SITE = os.environ.get("SITE_IMG", "/tmp/cr-old/img") + "/obra-azul-YGVPBZYSeKTAMfzi.png"
if os.path.exists(SITE):
    upd("plegaria-frecuencia", images=[(Image.open(SITE), "frecuencia", "")])

# ───────────────────────── Elementos (2007): el prólogo y el epílogo del libro, que no estaban en el sitio
p, d = load("catalogs", "elementos")
if not d.get("body"):
    P = lambda i, text: {"type": "paragraph", "id": f"elementos-{i}", "text": text}
    d["year"] = "2007"
    d["body"] = [
        {"type": "heading", "id": "elementos-prologo", "text": "Bajo los cúmulos, cirros y estratos"},
        P(1, "Al pie del volcán Irazú, frente a la montaña la Carpintera, por la carretera a Tres Ríos, durante toda su vida frente al balcón de su casa, Cali Rivera, el niño artista, el hombre, el hermano, el amigo… año tras año vio pasar a los miles y miles de peregrinos que durante la noche caminaron para ir a visitar a la Virgen de los Ángeles."),
        P(2, "La tierra fértil de Cartago, el aire fresco de sus colinas, el agua bendita de la basílica y el fuego del cirio pascual son a la vez los elementos sagrados que alimentarán el proceso creativo, consecuente y organizado de este magnífico artista costarricense."),
        P(3, "Cali Rivera desde su territorio poético se proyecta al mundo como un creador que concilia su existencia con el arte."),
        P(4, "Amante de la vida, desde su infancia jugaba construyendo cementerios en el jardín para enterrar los miedos y convencionalismos, y desde siempre fue creador con explosiva energía innovadora: inquieto, sensible, tolerante, comunicativo, sorprendente, hiperactivo."),
        P(5, "Los elementos simbólicos, como iconografías en su producción, son a la vez la interacción de lo cotidiano con lo ceremonial. Así entonces el entorno de su taller se transforma en un espacio donde se conjugan todos los sabores, colores, sonidos y texturas."),
        P(6, "Cali comparte los componentes de su arte con los espectadores y, dándoles permanencia, los eterniza, adquiriendo un significado nuevo los pequeños juguetes, bolsitas de azúcar, hilos de colores, gotas de pintura, canicas y corbatines, en inmensos aeropuertos donde podemos despegar a un gran cielo de imaginación."),
        {"type": "quote", "id": "elementos-7", "text": "La realidad y la fantasía son lo mismo. Cali nos transporta a un nuevo mundo.", "cite": "Fabio Herrera, 2006"},
        {"type": "heading", "id": "elementos-epilogo", "text": "Epílogo"},
        P(8, "El desarrollo de este manifiesto se convierte en mi más reciente epifanía, pues con él doy cierre a un trabajo de 12 años que comulga con un sentir común de supervivencia y que me enfila como un miembro más de una sociedad consciente que se sabe responsable de lo que como especie debemos atender en este momento histórico."),
        P(9, "Muchas son las personas a quienes debo agradecer su aporte en este esfuerzo, amigos todos: Luis Rojas, Tatiana Estrada, Daniel Argüello, Enrique León, Julián Trejos, Fabio Herrera, Mario Maffioli, Eugenia Bermúdez, Mario Gamboa, Maritza Urbano, Francesca King, Veronique Hannon, Peter Mobus, Alma Fernández, Manuel Delgado, Mercedes Sánchez y muchas otras más…"),
    ]
    save(p, d)
    log.append("texto  catalogs/elementos (prólogo de Fabio Herrera y epílogo)")

# ───────────────────────── Alquimia: fecha y lugar exactos de la inauguración (tarjeta de la Galería Kandinsky)
p, d = load("collections", "alquimia")
OLD = "La exposición individual se presentó en la Galería Kandinsky, San Pedro, Costa Rica, en junio de 2008."
for b in d["body"]:
    if b.get("text") == OLD:
        b["text"] = "La exposición individual se inauguró el jueves 12 de junio de 2008 en la Galería Kandinsky (Centro Comercial de la Calle Real, San Pedro de Montes de Oca, Costa Rica)."
        save(p, d)
        log.append("texto  collections/alquimia (fecha de inauguración)")

print(len(log), "cambios")
for l in log:
    print("  ", l)
