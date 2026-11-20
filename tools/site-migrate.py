#!/usr/bin/env python3
"""
Migra lo que calirivera.com (sitio actual, Hostinger/Zyro) tenía bajo «Obras» y acá solo vivía suelto en
Memoria: Ave Fénix (2000), Transmutación (2003), Prayer Flags (2003), Globalización (2004),
El agua como elemento (2006) y Plegaria tica en Francia (2006). Suma «Irazú» a Plegaria y
«El triunfo del tiempo» a La Cofradía (ficha del catálogo la-cofradia-2026.pdf).

Fuentes (sin inventar fichas): los textos y el orden de cada página del sitio actual
(OLD/extract.json, sacado del HTML) y sus fotos (OLD/img). Cada foto se empareja por huella visual
(OLD/phash.json) con la que ya está en /media; si la del sitio actual es más grande, se genera de nuevo.

Uso: python3 tools/site-migrate.py /ruta/a/descarga-del-sitio   (necesita Pillow con AVIF)
"""
import base64, io, json, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, "content")
PUB = os.path.join(ROOT, "web/public")
OLD = sys.argv[1] if len(sys.argv) > 1 else "/tmp/cr-old"
NOW = "2026-11-20T02:30:00Z"
ex = json.load(open(f"{OLD}/extract.json"))
ph = json.load(open(f"{OLD}/phash.json"))

mem_by_src = {}
for f in os.listdir(f"{C}/memories"):
    d = json.load(open(f"{C}/memories/{f}"))
    mem_by_src[re.sub(r"-\d+\.\w+$", "", d["image"]["src"])] = d


def write(path, doc):
    with open(path, "w") as fh:
        fh.write(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")


def make_asset(im, rel, alt, low=None):
    """Guarda jpg/webp/avif en /media/<rel>-<ancho>.* y devuelve el ImageAsset."""
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        im = bg
    im = im.convert("RGB")
    if max(im.size) > 1600:
        k = 1600 / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    full = im.width
    widths = [w for w in (640, 1280) if w < full * 0.9] + [full]
    os.makedirs(os.path.dirname(f"{PUB}/media/{rel}"), exist_ok=True)
    for w in widths:
        v = im if w == full else im.resize((w, round(im.height * w / full)), Image.LANCZOS)
        v.save(f"{PUB}/media/{rel}-{w}.jpg", quality=84, optimize=True, progressive=True)
        v.save(f"{PUB}/media/{rel}-{w}.webp", quality=80, method=6)
        v.save(f"{PUB}/media/{rel}-{w}.avif", quality=58)
    tiny = im.resize((16, max(1, round(16 * im.height / im.width))), Image.LANCZOS)
    buf = io.BytesIO()
    tiny.save(buf, "WEBP", quality=40)
    r, g, b = im.resize((1, 1), Image.BOX).getpixel((0, 0))
    a = {"src": f"/media/{rel}-{full}.jpg", "widths": widths, "width": full, "height": im.height,
         "placeholder": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(), "color": f"rgb({r} {g} {b})", "alt": alt}
    if low if low is not None else full < 700:
        a["lowRes"] = True
    return a


used = {}  # id de memoria → colección (para enlazar el recuerdo con su colección)


def asset(key, alt, col, name):
    """La foto `key` del sitio actual: la que ya tenemos, o una nueva si la de ellos es más grande (o no la teníamos)."""
    k = key.replace("/", "_")
    v = ph[k]
    m = mem_by_src.get(re.sub(r"-\d+\.\w+$", "", v["match"])) if v["dist"] <= 22 else None
    if m:
        used[m["id"]] = col
    if m and v["size"][0] <= v["ourw"] * 1.15:
        a = dict(m["image"])
        a["alt"] = alt
        return a
    im = Image.open(f"{OLD}/img/{k}")
    im.seek(0)
    return make_asset(im, f"colecciones/{col}/{name}", alt)


def keys(page):
    return [k for k, _ in ex[page]["images"] if not k.startswith("http") and "disea--o" not in k]


def find(page, frag):
    return next(k for k in keys(page) if frag in k)


P = lambda i, t, **kw: {"type": "paragraph", "id": i, "text": t, **kw}
H = lambda i, t: {"type": "heading", "id": i, "level": 2, "text": t}
V = lambda i, yt, title: {"type": "video", "id": i, "url": f"https://www.youtube.com/watch?v={yt}", "title": title, "poster": f"https://i.ytimg.com/vi/{yt}/hqdefault.jpg"}


def collection(cid, title, period, order, works, **extra):
    doc = {"id": cid, "slug": cid, "status": "published", "createdAt": NOW, "updatedAt": NOW, "title": title, "period": period,
           "order": order, "artworkIds": [w["id"] for w in works], **extra}
    for n, w in enumerate(works, 1):
        write(f"{C}/artworks/{w['id']}.json", {"slug": w["id"], "status": "published", "collectionId": cid, "aiAltered": False, "order": n,
                                                "createdAt": NOW, "updatedAt": NOW, **w})
    write(f"{C}/collections/{cid}.json", doc)
    print(f"{cid}: {len(works)} obras, {sum(len(b.get('images', [])) for b in extra.get('body', []))} fotos en galería")


def work(wid, title, imgs, **kw):
    return {"id": wid, "title": title, "images": imgs, **kw}


SRC = "Texto y fotos del sitio calirivera.com (2026)."

# ---------------------------------------------------------------- Ave Fénix (2000)
pg = "ave-fenix-2000"
af = [("tastaga", "Tastaga, la mujer testigo"), ("ave_fenix", "Ave Fénix"), ("umbral", "Umbral"), ("la_puerta", "La Puerta")]
works = [work(f"ave-fenix-{re.sub('_', '-', k)}", t, [asset(find(pg, k), f"{t} — Ave Fénix, 2000", "ave-fenix", k.replace("_", "-"))], year=2000,
              technique="Técnica mixta: acrílico y estuco", dimensions="151 × 97 cm", notes=SRC) for k, t in af]
collection("ave-fenix", "Ave Fénix", "2000", 32, works, subtitle="Serie de transición", technique="Técnica mixta: acrílico y estuco · 151 × 97 cm",
           statement="Ave Fénix es una serie de transición: el artista «limpia su paleta» y da paso al acrílico como técnica de sus siguientes series.",
           cover=works[1]["images"][0],
           body=[P("ave-fenix-1", "La serie consta de cuatro obras: Tastaga, la mujer testigo; Ave Fénix; Umbral y La Puerta."),
                 P("ave-fenix-2", "Fue expuesta por primera vez en la muestra colectiva Zoológico Abierto, realizada en el Taller del Artista en mayo del año 2000.")])

# ---------------------------------------------------------------- Transmutación (2003)
pg = "transmutacion-2003"
gal = []
for n, k in enumerate(keys(pg), 1):
    v = ph[k.replace("/", "_")]
    m = mem_by_src.get(re.sub(r"-\d+\.\w+$", "", v["match"]))
    alt = m["image"]["alt"] if m and not m["image"]["alt"].startswith(("Foto de", "Memoria")) else "Transmutación"
    gal.append(asset(k, f"{alt} — Transmutación, 2003" if alt != "Transmutación" else "Transmutación, instalación de Cali Rivera, 2003", "transmutacion", f"transmutacion-{n:02d}"))
collection("transmutacion", "Transmutación", "2003", 52, [], subtitle="Un «ambiance» de Cali Rivera · octubre de 2003",
           technique="Instalación de 260 m² con muebles de época, resinas, pintura y objetos",
           statement="De un proceso de investigación iniciado hace ya varios años nace una lectura del acontecer mundial y sus consecuencias en el ser humano, mediante imágenes creadas a través de las resinas, la pintura, los objetos y otros elementos contemporáneos.",
           cover=gal[3],
           body=[P("transmutacion-1", "Intervención arquitectónica del espacio para inaugurar el Café Arte Costa Rica: una instalación de 260 m² con muebles de época y obra de investigación."),
                 P("transmutacion-2", "La problemática del petróleo y las soluciones que ofrecen las grandes potencias ponen nuevamente en entredicho nuestra condición de seres pensantes, pues pareciera que la devastadora experiencia de la guerra sigue siendo el resultado. La avaricia de los grandes y la falta de una conciencia colectiva hacia la tolerancia nos hacen aparecer, frente al vasto universo evolutivo, como una especie de bárbaros y primitivos."),
                 P("transmutacion-3", "En esta puesta del Taller se invitó a la diseñadora de joyas Julieta Odio y, por primera vez, a un chef: Jorge Eduardo Chacón, quien realizó la apertura del Café Arte Costa Rica con el respaldo del restaurante Hama Sushi."),
                 P("transmutacion-4", "Acondicionado con sillas coloniales costarricenses originales, butacas art déco y arte moderno, el Taller del Artista nuevamente se refresca. Así nació Transmutación."),
                 {"type": "quote", "id": "transmutacion-5", "text": "Haciendo un recorrido desde sus telas abstractas hasta sus innovadoras piezas de resina epóxica, encontramos una experiencia plena de gozo por la vida, deseo de comunicación y gran armonía con su tiempo y realidad; su estética se constituye de una gran sensibilidad permeable a los estímulos que el arte en todas sus disciplinas le ofrece. Pasión y coraje de un solo golpe detonan la llama de la creación y el artista vive el regocijo que el arte nos brinda.", "cite": "Mario Maffioli, artista"},
                 {"type": "gallery", "id": "transmutacion-6", "images": gal}])

# ---------------------------------------------------------------- Prayer Flags (2003)
pg = "player-flags-2003"
fichas = [
    ("Mixta sobre alfombra trenzada a mano, intervenida con pintura, gel, objetos y resina", "6 × 1,3 m", "Finca Mirasol, Higuito del Guarco, Cartago"),
    ("Mixta sobre textil industrial: pintura, gel, bordados con botones, pasamanerías, semillas rojas y resina", "6 × 1,4 m", "Paisaje costarricense"),
    ("Mixta sobre tela: pintura, gel, espejos de Perú, alfombras típicas, piedras y resina", "6 × 1,4 m", "El Alto del Carmen, Dulce Nombre de Tres Ríos, Cartago"),
    ("Mixta sobre textil industrial: pintura, gel, 600 bordados con semillas rojas y resina", "6 × 1,4 m", "Parque Central de Cartago"),
    ("Mixta sobre tela: pintura, gel, lentejuelas rojas y resina", "6 × 1,4 m", "Paisaje costarricense"),
    ("Mixta sobre textil industrial: pintura, gel, objetos de madera bordados", "6 × 1,4 m", "Parque Industrial de Cartago"),
    ("Mixta sobre textil industrial: impresión de cuerpos con pintura, bordados en lentejuelas rojas y resina", "6 × 1,4 m", "Cementerio de San Rafael de Cartago"),
    ("Mixta sobre telas, collage", "6 × 1,55 m", "Paisaje costarricense"),
    ("Mixta sobre textil industrial: pintura, gel, objetos y resina", "6 × 1,4 m", "Parque de la Basílica de Nuestra Señora de los Ángeles, Cartago"),
]
ks = keys(pg)[:9]
works = []
for n, (k, (tec, dim, loc)) in enumerate(zip(ks, fichas), 1):
    note = f"Fotografiada en: {loc}."
    w = work(f"prayer-flags-bandera-{n}", f"Bandera {n}", [asset(k, f"Bandera {n} — Prayer Flags, 2003. {loc}", "prayer-flags", f"bandera-{n}")], year=2003, technique=tec, dimensions=dim, notes=note)
    if n == 9:
        w["availability"] = "lost"
        w["notes"] = note + " Esta bandera fue robada durante el Festival Internacional de las Artes (FIA) de 2006."
    works.append(w)
collection("prayer-flags", "Prayer Flags", "2003", 54, works, subtitle="El aire como elemento", technique="Nueve banderas de seis metros · técnica mixta sobre textil",
           statement="Primera exposición itinerante para parques y plazas de Costa Rica: nueve banderas de seis metros de longitud, instaladas sobre estructuras metálicas de nueve metros.",
           cover=works[0]["images"][0], catalogUrl="/files/prayer_flags.pdf",
           body=[P("prayer-flags-1", "Presentadas por la Galería Nacional en marzo de 2003, las banderas recorrieron el Parque México, la Plaza Roosevelt y el Parque de la Paz. Son los estandartes alegóricos de la Carta de la Tierra, una obra vinculada al movimiento mundial pro cultura tibetana."),
                 P("prayer-flags-2", "Cada bandera fue fotografiada en un paisaje distinto de Costa Rica. La novena fue robada durante el Festival Internacional de las Artes de 2006; de ese hecho nacieron Plegaria tica en Francia y El agua como elemento.")])

# ---------------------------------------------------------------- Globalización (2004)
pg = "globalizacion-2004"
alts = ["Invitación a Globalización en el Taller del Artista, 2004", "Afiche del XXIV International Sea Turtle Symposium", "Invitación al XXIV Simposio de Tortugas Marinas", "Globalización: banderas instaladas, 2004"]
gal = [asset(k, a, "globalizacion", f"globalizacion-{n}") for n, (k, a) in enumerate(zip(keys(pg), alts), 1)]
collection("globalizacion", "Globalización", "2004", 56, [], subtitle="XXIV Simposio de Tortugas Marinas", technique="Alfombras típicas costarricenses, textiles y objetos, intervenidos con pintura",
           statement="Cinco banderas confeccionadas con alfombras típicas costarricenses, textiles y objetos, e intervenidas con pintura.",
           cover=gal[3],
           body=[P("globalizacion-1", "Instalación de cinco banderas para celebrar el XXIV Simposio de Tortugas Marinas (Sea Turtle Symposium XXIV), realizado en Costa Rica en 2004."),
                 {"type": "gallery", "id": "globalizacion-2", "images": gal}])

# ---------------------------------------------------------------- El agua como elemento (2006)
pg = "el-agua-como-elemento-2006"
A = lambda frag, alt, name: asset(find(pg, frag), alt, "el-agua-como-elemento", name)
named = [
    ("duelo", "Duelo", ["duelo-"]), ("continentes-en-duelo", "Continentes en duelo", ["continentes_en_duelo"]), ("hurto", "Hurto", ["/hurto-", "detalle_hurto"]),
    ("del-corazon", "Del corazón", ["/del_corazon", "detalle_del_corazon"]), ("azul-de-murano", "Azul de Murano", ["azul_de_murano"]),
    ("mantos-acuiferos", "Mantos acuíferos", ["mantos_acuiferos"]), ("larga-vida", "Larga vida", ["detalle_larga_vida-", "detalle_larga_vida2", "detalle_larga_vida3"]),
]
works, taken = [], set()
for slug, t, frags in named:
    imgs = []
    for j, fr in enumerate(frags):
        k = next(k for k in keys(pg) if ("/" + k).find(fr) >= 0 or k.startswith(fr.lstrip("/")))
        taken.add(k)
        det = "detalle" in k
        imgs.append(asset(k, f"{t}{' (detalle)' if det else ''} — El agua como elemento", "el-agua-como-elemento", f"{slug}{'-detalle-%d' % j if det else ''}"))
    w = work(f"el-agua-como-elemento-{slug}", t, imgs, year=2006, notes=SRC + " Ficha técnica pendiente (técnica, medidas).")
    if slug == "larga-vida":
        w["notes"] = SRC + " Solo se conservan fotos de detalle. Ficha técnica pendiente."
    works.append(w)
rest = [k for k in keys(pg) if k not in taken]
gal = [asset(k, "El agua como elemento: registro de la exposición", "el-agua-como-elemento", f"registro-{n:02d}") for n, k in enumerate(rest, 1)]
collection("el-agua-como-elemento", "El agua como elemento", "2006–2007", 57, works, subtitle="Cierre del proyecto de los Elementos",
           statement="A finales de marzo de 2006, a raíz de un desafortunado acontecimiento (el robo de una bandera de la colección Prayer Flags en el FIA), inicié la propuesta final del discurso de los elementos, que comenzó con la tierra como elemento en 1995 y fue inaugurada en el 2000.",
           cover=works[0]["images"][0], catalogUrl="/files/catalogo_alquimia_2008.pdf",
           body=[P("agua-1", "La exposición individual se presentó en el Taller del Artista en noviembre de 2007, como cierre del proyecto de los Elementos: la tierra (Detrás de la ventana, 2000), el fuego (Plegaria, 2001), el aire (Prayer Flags, 2003) y el agua."),
                 H("agua-2", "La inauguración, en video"),
                 P("agua-3", "Con motivo de la inauguración del Anfiteatro del Taller del Artista, Cali Rivera hizo un recorrido por su trabajo artístico y presentó la serie El agua como elemento, con un espectáculo de danza y personajes en torno a los elementos. Estos cuatro videos son el registro de aquella noche."),
                 V("agua-4", "6B8HOYSHUCY", "Propuesta de los Elementos (parte 1 de 4)"), V("agua-5", "4uAsKc4YLss", "Propuesta de los Elementos (parte 2 de 4)"),
                 V("agua-6", "j_7lxrGg1wE", "Propuesta de los Elementos (parte 3 de 4)"), V("agua-7", "PUKSb-r1KJw", "Propuesta de los Elementos (parte 4 de 4): los nombres de quienes participaron"),
                 {"type": "gallery", "id": "agua-8", "images": gal}])

# ---------------------------------------------------------------- Plegaria tica en Francia (2006)
pg = "plegaria-tica-en-francia-2006"
gal = [asset(k, "Boletín de Plegaria tica en Francia, 2006" if "boletin" in k else "Plegaria tica en Francia, 2006", "plegaria-tica-en-francia", f"francia-{n:02d}") for n, k in enumerate(keys(pg)[:10], 1)]
collection("plegaria-tica-en-francia", "Plegaria tica en Francia", "2006", 58, [], subtitle="Tres banderines, un dispensador y tres bitácoras",
           technique="Banderines sobre textiles autóctonos costarricenses",
           statement="Siguiendo la temática de las banderas de plegaria, desarrollé tres banderines montados en textiles autóctonos costarricenses.",
           cover=gal[1],
           body=[P("francia-1", "La trilogía es el preámbulo de una serie de obras que desarrollaré como oda a la bandera robada en el FIA, que fuera símbolo alegórico de la iniciativa de la Carta de la Tierra."),
                 P("francia-2", "De aquí la importancia de elevar estas plegarias en una galería de ese país. Además de la «plegaria tica», llevo un dispensador de combustible intervenido con pintura y tres bitácoras de papel reciclado con pruebas de color, llamadas Poetry."),
                 {"type": "gallery", "id": "francia-3", "images": gal}])

# ---------------------------------------------------------------- Plegaria: Irazú
pl = json.load(open(f"{C}/collections/plegaria.json"))
if "plegaria-irazu" not in pl["artworkIds"]:
    a = asset(find("plegaria-2001", "irazu"), "Irazú — Plegaria, 2001", "plegaria", "irazu")
    write(f"{C}/artworks/plegaria-irazu.json", {"id": "plegaria-irazu", "slug": "plegaria-irazu", "status": "published", "title": "Irazú", "collectionId": "plegaria",
                                                "images": [a], "aiAltered": False, "order": 8, "year": 2001, "technique": "Acrílico",
                                                "notes": "De «Plegaria, el fuego como elemento», Galería Nacional de Costa Rica, 2001. " + SRC + " Medidas pendientes.", "createdAt": NOW, "updatedAt": NOW})
    pl["artworkIds"].append("plegaria-irazu")
    pl["updatedAt"] = NOW
    write(f"{C}/collections/plegaria.json", pl)

# ---------------------------------------------------------------- Poetry: sus cuatro fotos
po = json.load(open(f"{C}/catalogs/poetry.json"))
if not any(b["type"] == "gallery" for b in po["body"]):
    gal = [asset(k, "Poetry, instalación de Cali Rivera, 2001", "poetry", f"poetry-{n}") for n, k in enumerate(keys("poetry-2001")[:4], 1)]
    po["body"].append({"type": "gallery", "id": "poetry-galeria", "images": gal})
    po.setdefault("cover", gal[1])
    po["updatedAt"] = NOW
    write(f"{C}/catalogs/poetry.json", po)

# ---------------------------------------------------------------- La Cofradía: El triunfo del tiempo
co = json.load(open(f"{C}/collections/la-cofradia.json"))
tid = "la-cofradia-el-triunfo-del-tiempo"
if tid not in co["artworkIds"] and os.path.exists(f"{OLD}/hero.jpeg"):
    a = make_asset(Image.open(f"{OLD}/hero.jpeg"), "la-cofradia/el-triunfo-del-tiempo", "El triunfo del tiempo — La Cofradía, 2017: figura alada que sostiene un ramo de rosas sobre una lámpara de porcelana", low=False)
    write(f"{C}/artworks/{tid}.json", {"id": tid, "slug": tid, "status": "published", "title": "El triunfo del tiempo", "collectionId": "la-cofradia", "images": [a],
                                        "aiAltered": False, "order": 10, "year": 2017, "technique": "Arte objeto", "availability": "private-collection",
                                        "notes": "Construida a partir de los fragmentos de una antigua lámpara de porcelana que acompañó la infancia del artista, regalo de su madre, destruida en un accidente. Sobre la porcelana herida emerge una figura alada que sostiene un ramo de rosas. Actualmente en colección privada. Ficha del catálogo La Cofradía (2026).",
                                        "createdAt": NOW, "updatedAt": NOW})
    co["artworkIds"].append(tid)
    co["updatedAt"] = NOW
    write(f"{C}/collections/la-cofradia.json", co)

# ---------------------------------------------------------------- Memoria: cada recuerdo, con su colección y su año
YEAR = {"ave-fenix": 2000, "transmutacion": 2003, "prayer-flags": 2003, "globalizacion": 2004, "el-agua-como-elemento": 2006, "plegaria-tica-en-francia": 2006, "plegaria": 2001, "poetry": 2001}
n = 0
for mid, col in used.items():
    p = f"{C}/memories/{mid}.json"
    d = json.load(open(p))
    if col != "poetry":
        d["collectionId"] = col
    if d.get("year") != YEAR[col]:
        d["year"] = YEAR[col]
        d["yearApprox"] = False
    d["updatedAt"] = NOW
    write(p, d)
    n += 1
print("recuerdos enlazados:", n)
