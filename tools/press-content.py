#!/usr/bin/env python3
"""
legacy/content/press.json (tools/press-extract.py) → content/press/<slug>.json, una página por nota de prensa.
Fecha, medio y autor van en META, leídos a mano de cada nota (no se adivinan).
Imágenes: solo las que existen de verdad (legacy/assets/prensa; Wayback nunca guardó la mayoría de los recortes).
Las dos notas de La Nación de 2011 que el sitio viejo solo enlazaba: resumen propio + una cita del artista + enlace
al archivo (no se republica el texto completo del diario).
Uso: python3 tools/press-content.py   (antes: node tools/optimize-media.mjs con la lista que imprime)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, "content")
NOW = "2026-11-11T18:30:00Z"
P = json.load(open(os.path.join(ROOT, "legacy/content/press.json")))
manifest = json.load(open(os.path.join(ROOT, "web/public/media/_manifest.json")))

# id del sitio viejo → (título, medio, autor, fecha ISO, precisión: d|m|y, slug)
META = {
    "180": ("120 obras de arte elevan ‘plegarias’ en Cartago", "La Nación", None, "2011-03-10", "d", "la-nacion-120-obras-elevan-plegarias-2011"),
    "178": ("Plegarias por la Madre Tierra", "La Nación · Áncora", None, "2011-04-17", "d", "la-nacion-plegarias-por-la-madre-tierra-2011"),
    "109": ("Sobre el libro «Elementos»", "La Prensa Libre", "Alfonso Chase", "2009-03-05", "d", "alfonso-chase-elementos-2009"),
    "179": ("Cali Rivera repartirá un beso", "La República", None, "2009-01-26", "d", "la-republica-repartira-un-beso-2009"),
    "63": ("En la portada de San José Volando", "Revista San José Volando", None, "2006-02-01", "m", "san-jose-volando-2006"),
    "25": ("Cali Rivera: artista circular, regido por elementos vitales", "Informa-tico.com", "Ana Beatriz Fernández", "2005-10-10", "d", "informa-tico-artista-circular-2005"),
    "26": ("Ojo al Cristo: el Taller del Artista", "La Nación", "Rocío Fernández", "2005-09-24", "d", "la-nacion-ojo-al-cristo-2005"),
    "18": ("Cali Rivera lleva el petróleo y la guerra al Taller del Artista", "La Nación", "Marcela Cantero", "2005-09-03", "d", "la-nacion-petroleo-y-guerra-2005"),
    "62": ("«Esperanza» en la portada de San José Volando", "Revista San José Volando", None, "2004-07-01", "m", "san-jose-volando-2004"),
    "65": ("Festival Fusión, Nicaragua", "Festival Fusión", None, "2004-01-01", "y", "festival-fusion-nicaragua-2004"),
    "19": ("Fusión de arte y café", "La Nación", "Fabiola Martínez O.", "2003-11-01", "d", "la-nacion-fusion-de-arte-y-cafe-2003"),
    "20": ("Arte y banderas en el Parque de la Paz", "La Nación", "Doriam Díaz", "2003-04-15", "d", "la-nacion-arte-y-banderas-2003"),
    "27": ("Prayer Flags: banderas de oración para la Carta de la Tierra", "Iniciativa de la Carta de la Tierra", None, "2003-04-04", "d", "carta-de-la-tierra-prayer-flags-2003"),
    "21": ("Arte de tinte pacifista", "La Nación", None, "2003-03-14", "d", "la-nacion-arte-de-tinte-pacifista-2003"),
    "22": ("Tres son multitud", "La Nación", None, "2001-11-13", "d", "la-nacion-tres-son-multitud-2001"),
    "23": ("Plegaria artística por el mundo", "La Nación", "Doriam Díaz", "2001-11-02", "d", "la-nacion-plegaria-artistica-2001"),
    "24": ("Un Milano para el arte", "La Nación", "Doriam Díaz", "2001-06-20", "d", "la-nacion-un-milano-para-el-arte-2001"),
    "4": ("Pincel de esperanza", "Revista Estilos y Casas", None, "2001-01-01", "y", "estilos-y-casas-pincel-de-esperanza-2001"),
    "6": ("Punto de vista", "Galería y Consultoría de Arte Kandinsky", "Alma Fernández", "2000-08-01", "m", "kandinsky-alma-fernandez-2000"),
    "9": ("Enfocando las artes", "The Tico Times", "Susan H. Liang", "2000-06-09", "d", "tico-times-enfocando-las-artes-2000"),
    "11": ("Vivir del arte para él", "La Nación", "Camila Schumacher", "2000-03-07", "d", "la-nacion-vivir-del-arte-2000"),
    "10": ("El arte para ser libre", "Detrás de la ventana", "Fabio Herrera", "2000-03-07", "d", "fabio-herrera-detras-de-la-ventana-2000"),
    "12": ("Estandartes femeninos", "La República", "Paola Ramírez", "2000-03-01", "m", "la-republica-estandartes-femeninos-2000"),
    "5": ("Sobre Cali Rivera", "Mario Maffioli, pintor", "Mario Maffioli", "2000-01-01", "y", "mario-maffioli-2000"),
    "13": ("Guía de la plástica en Costa Rica", "Art. En Costa Rica II", None, "1999-01-01", "y", "art-en-costa-rica-1999"),
    "14": ("Un pacífico mundo", "El Heraldo", None, "1998-04-24", "d", "el-heraldo-1998"),
    "15": ("Entre luces y sueños", "Revista Join Us", None, "1996-09-01", "m", "join-us-entre-luces-y-suenos-1996"),
    "66": ("Entre luces y sueños", "Monthia Sancho", "Monthia Sancho", "1996-01-01", "y", "monthia-sancho-entre-luces-y-suenos"),
    "16": ("La germinal obra de Cali Rivera", "Anuarium de Arte y Cultura", None, "1995-01-01", "y", "anuarium-1995"),
    "17": ("De azules profundos", "Revista Rumbo · Tiempo de Vivir", None, "1995-01-01", "m", "rumbo-de-azules-profundos-1995"),
}

# Notas que el sitio viejo solo enlazaba (texto del diario no republicado): resumen propio, cita del artista y archivo
EXTERNAL = {
    "180": {
        "summary": [
            "La Nación reseñó la apertura de «Plegaria» en el Museo Municipal de Cartago, el antiguo Cuartel Militar: 120 obras que repasan quince años de trayectoria —arte textil, banderas y estandartes, objetos intervenidos, ensamblajes, instalaciones y pintura— ocupando paredes, pasillos, salas y hasta los calabozos del edificio.",
            "La nota destaca la instalación «Ave María», un altar donde el público enciende una vela y escucha el Ave María en versión electrónica, y la obra «Oración por el calentamiento global», premiada en el I Encuentro Textil Iberoamericano.",
        ],
        "quote": "Cada uno de los espacios del Museo está acondicionado para despertar en el público una sensación de estar en un recinto espiritual.",
        "archive": "https://web.archive.org/web/2011/http://www.nacion.com/2011-03-11/AldeaGlobal/FotoVideoDestacado/AldeaGlobal2704119.aspx",
    },
    "178": {
        "summary": [
            "Un perfil largo en la revista Áncora de La Nación: desde los altares de flores secas que Cali levantaba a los cuatro años para un amigo imaginario —una «mamá virgen» que con los años reconoció como la Madre Tierra— hasta «Plegaria», abierta hasta el 15 de junio de 2011 en el Museo Municipal de Cartago.",
            "La nota recorre la instalación de cerca de 125 piezas, ocho meses de montaje organizados alrededor de los cuatro elementos, y su llamado a la conservación del planeta.",
        ],
        "quote": "Yo pretendo crear un mensaje de esperanza y reflexión universal.",
        "archive": "https://web.archive.org/web/2011/http://www.nacion.com/2011-04-17/Ancora/NotaPrincipal/AX17-CALI-RIVERA.aspx",
    },
}

JUNK = re.compile(r"^(Esta dirección de correo electrónico.*|\{mospagebreak\}|\.|Ver artículo|Social Sharing|Pagination|©.*-)$")
MONTH = "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split()


def label_date(iso, prec):
    y, m, d = iso.split("-")
    if prec == "y":
        return y
    if prec == "m":
        return f"{MONTH[int(m) - 1]} de {y}"
    return f"{int(d)} de {MONTH[int(m) - 1]} de {y}"


def image_asset(src, alt, caption=None):
    rel = f"legacy/assets/prensa/{os.path.basename(src)}"
    if rel not in manifest:
        return None
    m = manifest[rel]
    a = {k: m[k] for k in ("src", "widths", "width", "height", "placeholder", "color") if k in m}
    a["alt"] = alt or caption or ""
    if m["width"] < 400:
        a["lowRes"] = True
    return a


if "--list" in sys.argv:
    files = sorted(f for f in os.listdir(os.path.join(ROOT, "legacy/assets/prensa")) if re.search(r"\.(jpe?g|png|gif)$", f, re.I))
    print(json.dumps([{"path": f"legacy/assets/prensa/{f}", "group": "prensa"} for f in files]))
    sys.exit()

os.makedirs(os.path.join(C, "press"), exist_ok=True)
index = {}
for o in P:
    pid = o["key"].split("-")[0]
    title, outlet, author, date, prec, slug = META[pid]
    body, missing, cover = [], 0, None
    if pid in EXTERNAL:
        e = EXTERNAL[pid]
        body += [{"type": "paragraph", "id": f"{slug}-s{i}", "text": t, **({"lead": True} if i == 0 else {})} for i, t in enumerate(e["summary"])]
        body.append({"type": "quote", "id": f"{slug}-q", "text": e["quote"], "cite": f"Cali Rivera, en {outlet}"})
        body.append({"type": "links", "id": f"{slug}-l", "items": [{"label": "Leer la nota completa en el archivo de La Nación", "href": e["archive"], "note": "Internet Archive", "kind": "external"}]})
    else:
        n = 0
        for b in o["blocks"]:
            n += 1
            if b["type"] == "image":
                a = image_asset(b["src"], b.get("alt"), b.get("caption"))
                if not a:
                    missing += 1
                    continue
                blk = {"type": "image", "id": f"{slug}-{n}", "image": a}
                if b.get("caption"):
                    blk["caption"] = b["caption"]
                body.append(blk)
                cover = cover or a
                continue
            t = b["text"].strip()
            if JUNK.match(t) or (author and t.rstrip(".") == author.rstrip(".")) or t == o["title"] or t == o["label"]:
                continue
            if t.startswith("Fabio Herrrera") or t == "Paola Ramírez" or t == "Susan H Liang":
                continue  # firmas: ya están como autor
            blk = {"type": "paragraph", "id": f"{slug}-{n}", "text": t}
            if b.get("lead"):
                blk["lead"] = True
            body.append(blk)
    words = sum(len(b.get("text", "").split()) for b in body if b["type"] in ("paragraph", "quote"))
    if words < 15 and not any(b["type"] == "image" for b in body):
        # recortes escaneados que Wayback nunca guardó: no hay contenido que mostrar → queda el enlace al archivo
        print("sin contenido recuperable:", slug)
        continue
    excerpt = next((b["text"] for b in body if b["type"] == "paragraph" and len(b["text"]) > 60), "")
    excerpt = (excerpt[:217].rsplit(" ", 1)[0] + "…") if len(excerpt) > 220 else excerpt
    doc = {
        "id": slug,
        "slug": slug,
        "status": "published",
        "createdAt": NOW,
        "updatedAt": NOW,
        "title": title,
        "outlet": outlet,
        "publishedAt": f"{date}T12:00:00Z",
        "dateLabel": label_date(date, prec),
        "excerpt": excerpt,
        "body": body,
        "sourceUrl": o["sourceUrl"],
        "order": o["order"],
    }
    if author:
        doc["author"] = author
    if cover:
        doc["cover"] = cover
    if missing:
        doc["missingImages"] = missing
    json.dump(doc, open(os.path.join(C, "press", f"{slug}.json"), "w"), ensure_ascii=False, indent=1)
    index[o["sourceUrl"]] = (slug, outlet, label_date(date, prec))
    print(f"{slug:50} {words:4} palabras  {len([b for b in body if b['type']=='image'])} img  {missing} perdidas")

# Trayectoria: los enlaces a Wayback pasan a la página propia de cada nota
tp = os.path.join(C, "pages/trayectoria-and-entrevistas.json")
page = json.load(open(tp))
def walk(x):
    if isinstance(x, dict):
        if x.get("href") in index:
            slug, outlet, when = index[x["href"]]
            x["href"] = f"/puntos-de-vista/{slug}"
            x["kind"] = "internal"
            x["note"] = f"{outlet} · {when}"
        for v in x.values():
            walk(v)
    elif isinstance(x, list):
        for v in x:
            walk(v)
walk(page)
page["updatedAt"] = NOW
json.dump(page, open(tp, "w"), ensure_ascii=False, indent=1)
print("listo:", len(index), "notas")
