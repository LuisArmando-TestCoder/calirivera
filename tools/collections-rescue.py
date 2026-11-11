#!/usr/bin/env python3
"""
Publica las colecciones que estaban en borrador sin obras (daban 404): Atmósfera, Plegaria y La Cofradía,
y suma a Musas del Cántaro su foto auténtica del sitio viejo.

Fuentes (sin inventar fichas):
  - Atmósfera 1993 y Plegaria 2001: textos del sitio viejo (Wayback, legacy/content/obras.json) y las fotos
    ya rescatadas para Memoria (content/memories, optimizadas en /media/memoria).
  - La Cofradía 2017: catálogo completo web/public/files/la-cofradia-2026.pdf (fichas técnicas y fotos
    recortadas → legacy/catalogos/la-cofradia → /media/la-cofradia vía tools/optimize-media.mjs).
    «Candela» viene del sitio actual (ya en Memoria) y queda con ficha pendiente.
Nota: las banderas Rohingyas/Bálticos/Musulmanes/Bután/Israel/Huicholes son de «Revelaciones: plegarias
por los pueblos» (2015, ver revelaciones_plegarias_por_los_pueblos.pdf), no de Plegaria: no se suman acá.
Uso: python3 tools/collections-rescue.py
"""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, "content")
NOW = "2026-11-11T18:00:00Z"
manifest = json.load(open(os.path.join(ROOT, "web/public/media/_manifest.json")))


def mem(slug):
    return json.load(open(os.path.join(C, "memories", f"{slug}.json")))


def asset_from_manifest(rel, alt):
    m = manifest[rel]
    a = {k: m[k] for k in ("src", "widths", "width", "height", "placeholder", "color") if k in m}
    a["alt"] = alt
    if m.get("lowRes"):
        a["lowRes"] = True
    return a


def asset_from_memory(slug, alt):
    im = dict(mem(slug)["image"])
    im["alt"] = alt
    return im


def write(kind, obj):
    path = os.path.join(C, kind, f"{obj['slug']}.json")
    old = json.load(open(path)) if os.path.exists(path) else {}
    obj.setdefault("createdAt", old.get("createdAt", NOW))
    obj["updatedAt"] = NOW
    json.dump(obj, open(path, "w"), ensure_ascii=False, indent=1)


def artwork(cid, slug, title, image, order, year, technique=None, dimensions=None, notes=None, source=None):
    a = {
        "id": slug,
        "slug": slug,
        "status": "published",
        "title": title,
        "collectionId": cid,
        "images": [image],
        "aiAltered": bool(image.get("aiAltered")),
        "order": order,
        "year": year,
    }
    if technique:
        a["technique"] = technique
    if dimensions:
        a["dimensions"] = dimensions
    if notes:
        a["notes"] = notes
    if source:
        a["sourceUrl"] = source
    write("artworks", a)
    return slug


def collection(cid, **kw):
    path = os.path.join(C, "collections", f"{cid}.json")
    old = json.load(open(path))
    old.update(kw)
    old["status"] = "published"
    write("collections", old)


# ---------------------------------------------------------------- Atmósfera (1993)
ATM = [
    ("vivian", "Vivian Azul", "21,5 × 30 cm"),
    ("atmosfera", "Atmósfera", None),
    ("espermato", "Espermato", None),
    ("flamingos", "Flamingos", None),
    ("guardianes", "Guardianes", None),
    ("pensamiento", "Pensamiento", None),
    ("ruptura", "Ruptura", None),
    ("viaje", "Viaje", None),
    ("zonas-oscuras", "Zonas oscuras", None),
]
ids = []
for i, (m, title, dims) in enumerate(ATM, 1):
    ids.append(
        artwork(
            "atmosfera",
            f"atmosfera-{m}",
            title,
            asset_from_memory(f"1993-{m}", f"{title} — Atmósfera, 1993. Tiza pastel sobre papel"),
            i,
            1993,
            "Tiza pastel sobre papel",
            dims,
            None if dims else "Foto rescatada del sitio anterior (Internet Archive). Medidas pendientes.",
            mem(f"1993-{m}").get("sourceUrl"),
        )
    )
collection(
    "atmosfera",
    artworkIds=ids,
    period="1993",
    subtitle="Tiza pastel sobre papel",
    technique="Tiza pastel sobre papel",
    statement="La búsqueda de un personaje renace en esta propuesta: la mujer de mi infancia, la que muchas veces dibujé sobre grandes cartulinas con tizas, lentejuelas y escarcha, se reduce a pequeños formatos en técnica pastel.",
    body=[
        {"type": "paragraph", "id": "atmosfera-b1", "text": "La serie Atmósfera culminó en una exposición que nació de la invitación de conocidos y amigos con quienes había compartido mi trabajo esporádico en épocas anteriores. La expuse en 1993 en La Taberna, un desaparecido bar de San José, Costa Rica."},
        {"type": "paragraph", "id": "atmosfera-b2", "text": "Aunque la colección es mayor, solo se pudieron fotografiar los nueve cuadros que aquí se muestran."},
        {"type": "quote", "id": "atmosfera-b3", "text": "Su diversidad y amplia visión de la vida, la expresión sentimental del auto encuentro y el deseo innato de comunicarlo, lo han llevado por el dibujo, técnicas mixtas, murales; prefiriendo el pastel, entregándonos una obra de trazo firme con veladuras de suave atmósfera…", "cite": "Isaac Barra, Anuarium de Arte y Cultura, edición 1994"},
    ],
    cover=asset_from_memory("1993-vivian", "Vivian Azul — Atmósfera, 1993"),
)

# ---------------------------------------------------------------- Plegaria (2001 · 2011)
PLE = [
    ("2001-ave-maria", "Ave María"),
    ("2001-cielos-liquidos", "Cielos líquidos"),
    ("2001-frecuencia", "Frecuencia"),
    ("2001-molto-vivace", "Molto vivace"),
    ("2001-obra", "Fe"),
    ("2001-plegaria-de-las-aves", "Plegaria de las aves"),
    ("2001-trascendencia", "Trascendencia"),
]
ids = []
for i, (m, title) in enumerate(PLE, 1):
    ids.append(
        artwork(
            "plegaria",
            f"plegaria-{m.split('-', 1)[1] if m != '2001-obra' else 'fe'}",
            title,
            asset_from_memory(m, f"{title} — Plegaria, el fuego como elemento, 2001"),
            i,
            2001,
            "Acrílico",
            None,
            "De «Plegaria, el fuego como elemento», Galería Nacional de Costa Rica, 2001. Foto rescatada del sitio anterior (Internet Archive). Medidas pendientes."
            + (" La obra incluye una variación musical del Ave María de Schubert interpretada por el artista." if m == "2001-ave-maria" else ""),
            mem(m).get("sourceUrl"),
        )
    )
collection(
    "plegaria",
    artworkIds=ids,
    subtitle="El fuego como elemento",
    technique="Acrílico; instalación con velas, banderas y objetos",
    statement="Quise mediante mi nueva propuesta pictórica crear visualmente una plegaria por los nuevos tiempos. Pensé en guerras y soldados, en miles de velas que se encienden para llamar a la esperanza, y en la búsqueda de imágenes me topé con lo elemental: la fe.",
    body=[
        {"type": "heading", "id": "plegaria-h1", "level": 2, "text": "2001 · El fuego como elemento"},
        {"type": "paragraph", "id": "plegaria-b1", "text": "A manera de ritual, el 2 de noviembre de 2001 se inauguró en la Galería Nacional de Costa Rica «Plegaria, el fuego como elemento»: una obra no figurativa en acrílico, inspirada en la filosofía cristiana, acompañada por una instalación de cientos de velas benditas en la ceremonia del fuego de la tradición católica. El público no solo veía la exposición: la encendía, en señal de esperanza por los nuevos tiempos."},
        {"type": "paragraph", "id": "plegaria-b2", "text": "Una variación musical del Ave María de Franz Schubert, interpretada por el artista, forma parte de la obra pictórica del mismo nombre; un dispositivo electrónico permitía vivirla con la vista y con el oído. Radio Nacional de Costa Rica transmitió esa versión dos veces al día desde mediados de 2005."},
        {"type": "quote", "id": "plegaria-b3", "text": "Para quienes no han conocido todo mi trabajo, Plegaria es un salto abismal, pero en realidad es sólo un proceso lógico de mi búsqueda: de lo simbólico a la figuración, y cada vez más cerca de lo no figurativo, curiosamente con lo que inicié en mi primera exposición a principios de los noventa.", "cite": "Cali Rivera, 2001"},
        {"type": "heading", "id": "plegaria-h2", "level": 2, "text": "2006 · Plegaria tica en Francia"},
        {"type": "paragraph", "id": "plegaria-b4", "text": "Siguiendo la temática de las banderas de plegaria, tres banderines montados en textiles autóctonos costarricenses: el preámbulo de una serie dedicada a la bandera robada en el FIA, símbolo de la iniciativa de la Carta de la Tierra. Junto a la «plegaria tica» viajaron a una galería francesa un dispensador de combustible intervenido con pintura y tres bitácoras de papel reciclado con pruebas de color, llamadas «Poetry»."},
        {"type": "heading", "id": "plegaria-h3", "level": 2, "text": "2011 · Plegaria"},
        {"type": "paragraph", "id": "plegaria-b5", "text": "Una instalación de más de cien piezas entre objetos, banderas y obras de pared, con un compromiso explícito con la madre tierra. Por primera vez se expusieron las banderas del Corpus Christi junto a la Cruz de San Pedro: estandartes desarrollados en 2009 frente al lago Atitlán, en Guatemala, en un trabajo social con una comunidad indígena para proteger ese manto acuífero."},
        {"type": "paragraph", "id": "plegaria-b6", "text": "Ocho altares de luz, activados por los visitantes al encender una vela y elevar una oración por el planeta, formaron parte de la puesta en escena. La problemática del agua y la del petróleo fueron sus dos pilares conceptuales; la museografía fue de Hugo Pineda."},
    ],
    cover=asset_from_memory("2001-plegaria-de-las-aves", "Plegaria de las aves — Plegaria, 2001"),
)

# ---------------------------------------------------------------- La Cofradía (2017)
OBJ = "Mixta sobre objeto, intervenido con pedrería, pintura y resina"
COF = [
    ("el-ojo-del-cosmos", "El ojo del cosmos", OBJ, "130 cm de diámetro"),
    ("plegaria-por-los-cristianos", "Plegaria por los Cristianos", OBJ, "148 × 128 cm"),
    ("mariposa-de-la-libertad", "Mariposa de la Libertad", OBJ, "120 × 120 cm"),
    ("los-ausentes", "Los Ausentes", "Ensamble / arte objeto con cinco butacas históricas del Cine de Tres Ríos, estructura intervenida, pintura automotriz, esmaltes, exvotos, piedras e imágenes devocionales con pedrería, pintura y resina", "244 × 60 × 120 cm"),
    ("arcangel-miguel", "Arcángel Miguel", OBJ, "30 × 60 cm"),
    ("arcangel-rafael", "Arcángel Rafael", OBJ, "20 × 40 cm"),
    ("arcangel-gabriel", "Arcángel Gabriel", OBJ, "25 × 45 cm"),
    ("caliz", "Cáliz", "Ensamble de objetos, intervenido con pedrería, pintura y resina", "10 × 36 cm"),
]
ids = []
for i, (n, title, tech, dims) in enumerate(COF, 1):
    ids.append(
        artwork(
            "la-cofradia",
            f"la-cofradia-{n}",
            title,
            asset_from_manifest(f"legacy/catalogos/la-cofradia/{n}.png", f"{title} — La Cofradía, 2017"),
            i,
            2017,
            tech,
            dims,
            "Restaurado en 2023." if n == "caliz" else None,
        )
    )
ids.append(
    artwork(
        "la-cofradia",
        "la-cofradia-candela",
        "Candela",
        asset_from_memory("2017-candela", "Candela — La Cofradía, 2017"),
        len(ids) + 1,
        2017,
        None,
        None,
        "Del sitio actual. Ficha técnica pendiente.",
        mem("2017-candela").get("sourceUrl"),
    )
)
collection(
    "la-cofradia",
    artworkIds=ids,
    subtitle="El cosmos, la fe y la esperanza",
    technique="Arte objeto y ensamble: pedrería, pintura y resina",
    statement="Más que una colección de obras, fue una celebración de la amistad, de la memoria y de la capacidad humana de otorgar nuevos significados a aquello que parecía perdido. Ángeles rescatados, porcelanas heridas, lámparas destruidas por el tiempo y pequeñas reliquias familiares encontraron una nueva existencia.",
    body=[
        {"type": "paragraph", "id": "cofradia-b1", "text": "En 2017, después de representar a Costa Rica en la Trienal de Riga, de exponer «Sincretismo religioso. Un camino para la paz» en el Museo Central de Arte Textil de Łódź, Polonia, y de ocupar el Teatro Nacional entero junto al Coro y la Orquesta Sinfónica Nacional, Cali Rivera volvió la mirada al espacio más íntimo de su universo creativo: drenó las aguas del Sexto Sol y lo convirtió en un anfiteatro."},
        {"type": "paragraph", "id": "cofradia-b2", "text": "Una rampa permitió acceder a su interior y, como una declaración de unidad, dieciséis símbolos de distintas tradiciones filosóficas y espirituales fueron integrados a sus muros. Lo que había sido una isla rodeada por más de veintisiete mil galones de agua se volvió una plaza abierta al encuentro."},
        {"type": "heading", "id": "cofradia-h1", "level": 2, "text": "El cosmos, la fe y la esperanza"},
        {"type": "paragraph", "id": "cofradia-b3", "text": "El Ojo del Cosmos invita a contemplar el misterio; Plegaria por los Cristianos, con sus pequeñas capillas hechas de antiguos relicarios y latas de confites alemanes, piensa la fe desde lo humano; La Virgen de la Esperanza afirma la ternura y la posibilidad de renacer. Entre esas tres dimensiones se despliegan los arcángeles Miguel, Rafael y Gabriel, nacidos de una bolsa de figuras rotas e intervenidos con el principio del kintsugi; el Cáliz, hecho de una copa de diseñador y un antiguo bombillo; y Los Ausentes, cinco butacas del desaparecido Cine de Tres Ríos, una por continente."},
        {"type": "quote", "id": "cofradia-b4", "text": "La belleza no nace de la perfección, sino de la reconciliación.", "cite": "La Cofradía, catálogo 2026"},
        {"type": "paragraph", "id": "cofradia-b5", "text": "Nadie podía imaginar entonces que, pocos meses después, el fuego consumiría la casa y gran parte de la obra construida durante décadas. Vista desde la distancia, La Cofradía permanece como el último gran canto de celebración antes de las cenizas y, a la vez, como la primera señal de que la belleza puede sobrevivir a cualquier pérdida."},
        {"type": "links", "id": "la-cofradia-1", "items": [{"label": "Ver el catálogo de La Cofradía", "href": "/files/la-cofradia-2026.pdf", "note": "PDF · 44 págs.", "kind": "pdf"}]},
    ],
    cover=asset_from_manifest("legacy/catalogos/la-cofradia/el-ojo-del-cosmos.png", "El ojo del cosmos — La Cofradía, 2017"),
)

# ---------------------------------------------------------------- Musas del Cántaro: la foto auténtica
mus = json.load(open(os.path.join(C, "collections", "musas-del-cantaro.json")))
sid = artwork(
    "musas-del-cantaro",
    "musas-del-cantaro-musa-mixta",
    "Musa mixta",
    asset_from_memory("1996-musa-mixta", "Musa mixta — Musas del Cántaro, 1995–1996"),
    len(mus["artworkIds"]) + 1,
    "1995–1996",
    "Técnica mixta",
    None,
    "Foto original del sitio anterior (Internet Archive), sin retoque de IA. Medidas pendientes.",
    mem("1996-musa-mixta").get("sourceUrl"),
)
if sid not in mus["artworkIds"]:
    mus["artworkIds"].append(sid)
    write("collections", mus)

print("listo")
