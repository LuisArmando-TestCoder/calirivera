#!/usr/bin/env python3
"""Enlaces que había dentro de las páginas del sitio de 2025, puestos donde corresponde.

Regla: si la dirección original sigue viva, va la dirección tal cual; si solo queda la copia de
Internet Archive, va esa. Lo que murió sin copia, o quedó en manos de otro, no se enlaza.
Entrada: legacy/enlaces-2025.json (lo arma la auditoría: estado de cada enlace y en qué página estaba).
Se puede correr varias veces: no duplica.
"""
import json, os, re, sys

C = os.path.join(os.path.dirname(__file__), "..", "content")
from datetime import datetime, timezone

NOW = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
ST = json.load(open(sys.argv[1]))["estado"]
changed = set()


def wb(key):
    u = next(v["wb"] for k, v in ST.items() if key in k and v["wb"])
    return u.replace("http://web.archive.org", "https://web.archive.org").replace(":80/", "/")


def load(rel):
    p = os.path.join(C, rel)
    raw = open(p).read()
    return p, json.loads(raw), (1 if raw.startswith('{\n "') else 2)


def save(p, d, ind):
    d["updatedAt"] = NOW
    open(p, "w").write(json.dumps(d, ensure_ascii=False, indent=ind) + "\n")
    changed.add(os.path.relpath(p, C))


def has(d, href):
    return href.split("://", 1)[-1].rstrip("/") in json.dumps(d, ensure_ascii=False)


def add_links(rel, items, title=None, where="body", block_id="wb-enlaces", section=None):
    """Agrega enlaces a un documento: al último bloque de enlaces si lo hay, o a uno nuevo."""
    p, d, ind = load(rel)
    blocks = d[where] if section is None else next(s for s in d["sections"] if s["id"] == section)["blocks"]
    items = [i for i in items if not has(d, i["href"])]
    if not items:
        return
    own = next((b for b in blocks if b["type"] == "links" and (b["id"] == block_id or title is None)), None)
    if own:
        own["items"].extend(items)
    else:
        b = {"type": "links", "id": block_id, "items": items}
        if title:
            b["title"] = title
        blocks.append(b)
    save(p, d, ind)


def ext(label, href, note=None):
    i = {"label": label, "href": href, "kind": "external"}
    if note:
        i["note"] = note
    return i


IA = "Internet Archive"

# 1. Galería de 2006 (galeria.calirivera.com ya no existe: solo queda la copia archivada)
for col, albums in {"detras-de-la-ventana": [1], "atmosfera": [4], "musas-del-cantaro": [5], "suenos-en-azul": [6], "ave-fenix": [7],
                    "plegaria": [9, 8], "transmutacion": [10], "prayer-flags": [11], "identidad": [12]}.items():
    its = [ext("La serie en la galería de 2006" + (" (segunda parte)" if n == 8 else ""), wb(f"album={n}"), IA) for n in albums]
    add_links(f"collections/{col}.json", its, title="Del sitio anterior", block_id="wb-galeria-2006")

# 2. Álbumes y publicaciones de Facebook que las páginas de 2025 enlazaban (siguen en línea)
add_links("collections/la-cofradia.json", [ext("Álbum de La Cofradía en Facebook", "https://www.facebook.com/media/set/?set=a.5163389447010994&type=3")])
add_links("collections/exvotos.json", [ext("Álbum de Exvotos en Facebook", "https://www.facebook.com/media/set/?set=a.567587979924520.150359.100000199696497&type=3")], title="Más imágenes", block_id="wb-facebook")
add_links("catalogs/casa-museo-ave-fenix.json", [ext("Fotografías de la Casa Museo en Facebook", "https://www.facebook.com/cali.rivera.10/posts/5146708068679132")], title="Más imágenes", block_id="wb-facebook")
for post in ("actividades-taller-del-artista-octubre-del-2012",):
    add_links(f"posts/{post}.json", [ext("El evento en Facebook", "https://www.facebook.com/events/511247172237394/")], title="Enlaces", block_id="wb-enlaces")

# 3. Prensa y catálogos de terceros: solo queda la copia archivada
add_links("posts/con-una-obra-que-tiene-como-base-el-huipil-tejidos-indigenas-guatemalt.json",
          [ext("La nota en La Nación (7 de setiembre de 2010)", wb("nacion.com/2010-09-07"), IA)], title="Fuente", block_id="wb-enlaces")
add_links("press/alfonso-chase-elementos-2009.json",
          [ext("La columna en La Prensa Libre (5 de marzo de 2009)", wb("prensalibre"), IA)], title="Fuente", block_id="wb-enlaces")
add_links("posts/en-el-mes-de-abril-del-2014-cali-rivera-fue-uno-de-los-artistas-invita.json",
          [ext("Catálogo de la muestra en Issuu", wb("catalogo-cud"), IA)], title="Catálogo", block_id="wb-enlaces")

# 4. Organizaciones que las páginas nombraban (siguen en línea)
add_links("collections/prayer-flags.json", [ext("La Carta de la Tierra", "https://earthcharter.org/")], block_id="wb-galeria-2006")
add_links("press/carta-de-la-tierra-prayer-flags-2003.json", [ext("Carta de la Tierra Internacional", "https://www.cartadelatierra.org/")], title="Enlaces", block_id="wb-enlaces")
add_links("posts/actividades-taller-del-artista-marzo-2013.json", [ext("ALASAX, festival de saxofón", "https://www.alasax.org/")], title="Enlaces", block_id="wb-enlaces")
riga = [f for f in os.listdir(f"{C}/posts") if "trienal" in f]
for f in riga:
    add_links(f"posts/{f}", [ext("Red Textil Iberoamericana", "https://www.redtextilia.org/")], block_id="wb-fuente")

# 5. Del Taller: el menú antiguo y el primer sitio web
add_links("pages/taller-del-artista.json", [
    ext("El menú del Café Arte, edición anterior", wb("youblisher"), IA),
    ext("El primer sitio web: «El arte para ser libre» (2007)", wb("version1"), IA),
], title="Del archivo", block_id="wb-archivo", section="origen")

# 6. Videos de Vimeo que las páginas de 2025 tenían (siguen en línea)
p, d, ind = load("pages/taller-del-artista.json")
sec = next(s for s in d["sections"] if s["id"] == "videoteca")
for vid, title in (("2355017", "Estandarte del amor (video de Mario Gamboa)"), ("2694240", "Homenaje al poeta César Vallejo (video de Mario Gamboa)"), ("2712625", "Todos somos uno (video de Mario Gamboa)")):
    if not any(vid in b.get("url", "") for b in sec["blocks"]):
        sec["blocks"].append({"type": "video", "id": f"taller-vimeo-{vid}", "url": f"https://vimeo.com/{vid}", "title": title})
        save(p, d, ind)

# 7. Párrafos que eran solo una dirección (muerta o del sitio viejo): pasan a ser un enlace que funciona
PDF = lambda label, f: {"label": label, "href": f"/files/{f}", "kind": "pdf"}
INT = lambda label, href: {"label": label, "href": href, "kind": "internal"}
URLS = {
    "yoguiandoencasa.com/index.php/eventos/76-clases-de-yoga.html": ext("Clases de yoga: Yoguiando en Casa", wb("yoguiandoencasa"), IA),
    "issuu.com/luisinfoluis/docs/revelaciones_plegarias_por_los_pueb": PDF("Catálogo «Revelaciones: plegarias por los pueblos»", "revelaciones_plegarias_por_los_pueblos.pdf"),
    "calirivera.com/elementos2.pdf": PDF("Catálogo «Elementos»", "elementos2.pdf"),
    "calirivera.com/catalogo_banderas_corpus_christi.pdf": PDF("Catálogo «Banderas de Corpus Christi»", "catalogo_banderas_corpus_christi.pdf"),
    "calirivera.com/plegaria_catalogo.pdf": PDF("Catálogo «Plegaria»", "plegaria_catalogo.pdf"),
    "calirivera.com/index.php/catalogo-sincretismo.html": INT("Catálogo «Sincretismo religioso»", "/catalogos-and-proyectos/sincretismo-religioso"),
}
for f in sorted(os.listdir(f"{C}/posts")):
    p, d, ind = load(f"posts/{f}")
    hit = False
    for b in d.get("body", []):
        if b.get("type") != "paragraph":
            continue
        txt = b.get("text", "").strip()
        if not re.fullmatch(r"(https?://|www\.)\S+", txt):
            continue
        bare = re.sub(r"^https?://(www\.)?", "", txt).rstrip("/")
        item = URLS.get(bare) or (INT("Catálogos y proyectos", "/catalogos-and-proyectos") if bare == "calirivera.com" and txt.startswith("http") else None)
        if item:
            keep = b["id"]
            b.clear()
            b.update({"type": "links", "id": keep, "items": [dict(item)]})
            hit = True
    if hit:
        save(p, d, ind)

print(len(changed), "documentos")
for c in sorted(changed):
    print("  ", c)
