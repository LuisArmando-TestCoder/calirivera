#!/usr/bin/env python3
"""
Qué tenía el sitio de 2025 (copia de Internet Archive, en legacy/) que el sitio nuevo todavía no usa.

Deja un solo archivo, legacy/hallazgos-2025.json, con tres listas:
  · colecciones: cada serie publicada bajo «Obras» y si está o no en el sitio nuevo;
  · obras: imágenes de obra y títulos con ficha que no aparecen en el contenido nuevo;
  · enlaces: páginas sin pasar, versiones en inglés, páginas nombradas que nadie archivó,
    archivos, contenido incrustado y enlaces externos sin usar.

No descarga nada. Compara lo ya inventariado (legacy/urls.json, legacy/content/*.json, legacy/redirects.csv,
legacy/enlaces-2025.json y, cuando están en el disco, legacy/assets/_missing.json y legacy/assets/galeria2006/)
contra content/. Por eso «no vista» significa aquí «el sitio nuevo no la usa ni por dirección ni por nombre
de archivo»: nadie abrió la imagen para confirmarlo.

Los nombres de coleccionistas particulares y los precios de las fichas de 2006 no se copian.

Uso: python3 tools/hallazgos-2025.py
"""
import collections
import csv
import datetime
import glob
import json
import os
import re
import unicodedata
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGACY, CONTENT = f"{ROOT}/legacy", f"{ROOT}/content"
SALIDA = f"{LEGACY}/hallazgos-2025.json"
MIN_PALABRAS = 40  # menos texto nuevo que esto no cuenta como «falta pasar»
ROUTE = {"collections": "/colecciones/", "catalogs": "/catalogos-and-proyectos/"}
IMAGE = re.compile(r"\.(jpe?g|png|gif)$", re.I)


# ───────────────────────────────────────────── utilidades de texto y direcciones
def load(path):
    with open(path) as fh:
        return json.load(fh)


def bare(url):
    """Dirección sin envoltura de Wayback, protocolo, www ni puerto."""
    url = re.sub(r"^https?://web\.archive\.org/web/\d+[a-z_]*/", "", url.strip())
    url = re.sub(r"^https?://", "", url)
    url = re.sub(r"^www\.", "", url).replace(":80/", "/")
    return urllib.parse.unquote(url).split("#")[0]


def plain(text):
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def words(text):
    return re.sub(r"[^a-z0-9ñ ]+", " ", plain(text)).split()


def key(text):
    """Lo que identifica un nombre: sin acentos, signos ni espacios."""
    return re.sub(r"[^a-z0-9]+", "", plain(text))


def shingles(tokens):
    return [tuple(tokens[i:i + 4]) for i in range(len(tokens) - 3)]


def href_of(link):
    return (link.get("href") if isinstance(link, dict) else link) or ""


# ───────────────────────────────────────────── lo que el sitio nuevo ya tiene
class Site:
    def __init__(self):
        self.docs = {}
        for kind in ("collections", "catalogs", "artworks", "memories", "posts", "press", "pages"):
            for path in sorted(glob.glob(f"{CONTENT}/{kind}/*.json")):
                doc = load(path)
                if isinstance(doc, dict):
                    self.docs[(kind, doc.get("id") or os.path.basename(path)[:-5])] = doc
        self.blob = " ".join(json.dumps(d, ensure_ascii=False) for d in self.docs.values())
        self.plain = plain(self.blob)
        self.shingles = set(shingles(words(self.blob)))
        self.urls = {bare(d["sourceUrl"]) for d in self.docs.values() if d.get("sourceUrl")}
        self.titles = {key(d["title"]): f"{kind}/{ident}" for (kind, ident), d in self.docs.items()
                       if kind in ("artworks", "memories") and d.get("title")}
        self.files = {key(name) for name in os.listdir(f"{ROOT}/web/public/files")}
        self.media = {key(os.path.basename(m).rsplit("-", 1)[0]) for m in re.findall(r"/media/[\w/.-]+?-\d+\.jpg", self.blob)}

    def coverage(self, lines):
        """Parte del texto que ya está, palabra por palabra, y cuántas palabras tiene."""
        tokens = words(" ".join(lines))
        grams = shingles(tokens)
        return (sum(g in self.shingles for g in grams) / len(grams) if grams else 1.0), len(tokens)

    def similar_title(self, stem):
        if len(stem) < 6:
            return None
        return next((ref for title, ref in self.titles.items() if len(title) >= 6 and (stem in title or title in stem)), None)


# ───────────────────────────────────────────── las páginas de 2025
SECCION = {"obras": "Obras", "otros": "Sitios de 2001 a 2011", "exposiciones": "Exposiciones", "actividades_taller": "Actividades del Taller",
           "prensa": "Puntos de vista", "historico": "Histórico", "recomendaciones": "Recomendaciones", "cafe_arte": "Café Arte",
           "biografia": "Biografía", "taller": "Taller", "manifiesto": "Mi visión", "galeria": "Galería de 2006", "videos": "Videos"}
SIN_TITULO = re.compile(r"^(cali rivera([-: ].*)?|calirivera\.com|autor|general( b)?|uncategorised|fecha de publicación|(skip to )?content)?$", re.I)
GALERIA = {"index.php": "lista de álbumes", "thumbnails.php?album=toprated": "obras mejor valoradas"}
RELLENO = re.compile(r"aliquam|suspendisse|lorem ipsum|no tienes permisos|campos con el asterisco|^skip to ", re.I)  # texto de muestra y avisos del sistema
ES = re.compile(r"\b(el|la|los|las|que|del|una|con|por|para|como|su)\b")
EN = re.compile(r"\b(the|of|and|with|for|this|that|from|is|are|his)\b")


def language(text, count):
    es, en = len(ES.findall(text)), len(EN.findall(text))
    if count > 30 and en > es * 3:
        return "en"
    return "es+en" if en > 40 and en > es * 0.4 else "es"


def load_pages(site):
    pages = []
    for path in sorted(glob.glob(f"{LEGACY}/content/*.json")):
        for row in load(path):
            if isinstance(row, dict) and "url" in row and "text" in row:
                row["sec"] = os.path.basename(path)[:-5]
                pages.append(row)
    seen_in = collections.Counter()
    for page in pages:
        for line in {l.strip() for l in page["text"].split("\n") if l.strip()}:
            seen_in[line] += 1
    template = {line for line, n in seen_in.items() if n >= 6}  # menú, pie y demás texto de plantilla
    for page in pages:
        page["body"] = [l.strip() for l in page["text"].split("\n") if l.strip() and l.strip() not in template and not RELLENO.search(l)]
        page["cov"], page["n"] = site.coverage(page["body"])
        page["lang"] = language(" ".join(page["body"]).lower(), page["n"])
        page["path"] = re.sub(r"^calirivera\.com/(~calirive/|%7Ecalirive/)?(index\.php/?)?", "", urllib.parse.unquote(page["url"]))
    return pages


def title_of(page):
    """El título de la página; si es el genérico de la plantilla o una sola palabra, el que se lee en su dirección."""
    if page["path"].startswith("galeria/"):
        name = page["path"].split("/", 1)[1]
        return "Galería de 2006: " + GALERIA.get(name, name)
    title = (page.get("title") or "").strip()
    generic = bool(SIN_TITULO.match(title))
    if not generic and " " in title:
        return title
    slug = re.sub(r"\.html$", "", page["path"].split("?")[0].rstrip("/").split("/")[-1])
    slug = re.sub(r"[-_]+", " ", re.sub(r"^\d+-", "", slug))
    if "." not in slug and not slug.startswith("index") and (" " in slug or generic and len(slug) > 5):
        return slug.capitalize()
    return title if not generic else next((line for line in page["body"] if 3 < len(line) < 90), page["path"])


def source(page):
    return {"direccion": "http://" + urllib.parse.unquote(page["url"]), "copia": page["archive"], "capturada": page["snapshot"][:4]}


# ───────────────────────────────────────────── 1 · colecciones
# Colección de 2025 → dónde vive hoy (None: no está). Lo que no aparece aquí se empareja por nombre.
DONDE = {"alquimia-2008": "collections/alquimia", "cofradia-2017": "collections/la-cofradia",
         "casa-museo-ave-fenix-2018": "catalogs/casa-museo-ave-fenix", "el-agua-es-oro-2020": "catalogs/el-agua-es-oro",
         "plegaria-2011": "catalogs/plegaria", "poetry": "catalogs/poetry", "obras-recientes": None, "arte-objeto-y-entropia-2021": None}
MAL_ESCRITAS = {"player-flags": "prayer-flags", "ave-f-nix": "ave-fenix", "transmutaci-n": "transmutacion"}
NOTAS = {
    "obras-recientes": ("Obras recientes", "No era una serie sino una categoría del blog. Reunía la declaración de Exvotos (en español ya está en el sitio; "
                                           "la versión en inglés no) y dos entradas del taller en Guatemala de 2009, que también están casi enteras."),
    "arte-objeto-y-entropia-2021": ("Arte Objeto y Entropía 2021", "Estaba en el menú de 2025, pero la página decía «Página en construcción»: "
                                                                   "no hay texto ni imágenes que rescatar, solo el nombre y el año."),
}


def collection_slug(path):
    found = re.match(r"obras(?:-28)?/([^/?]+)", path)
    if not found:
        return None
    slug = re.sub(r"[^a-z0-9]+", "-", plain(found.group(1).replace(".html", ""))).strip("-")
    return None if slug == "mc-comment" else MAL_ESCRITAS.get(slug, slug)


def where_now(slug, site):
    if slug in DONDE:
        return DONDE[slug]
    name = "-".join(t for t in slug.split("-") if not t.isdigit() and t not in ("marzo", "julio", "febrero"))
    homes = [(kind, ident) for kind in ROUTE for (k, ident) in site.docs if k == kind]
    exact = next((h for h in homes if h[1] == name), None)
    loose = next((h for h in homes if h[1] in slug or name.startswith(h[1])), None)
    found = exact or loose
    return "/".join(found) if found else None


def collections_of_2025(pages, site):
    groups = collections.defaultdict(list)
    for page in pages:
        slug = collection_slug(page["path"]) if page["sec"] == "obras" else None
        if slug:
            groups[slug].append(page)
    out = []
    for slug, group in sorted(groups.items()):
        fronts = [p for p in group if re.fullmatch(r"obras(-28)?/[^/]+", p["path"].split("?")[0]) and "view=article" not in p["path"]] or group
        front = max(fronts, key=lambda p: p["n"])
        subpages = {}
        for page in group:
            if page not in fronts and page["n"] >= 30:
                subpages.setdefault(key(title_of(page)), page)
        home = where_now(slug, site)
        pending = [p for p in [front, *subpages.values()] if p["cov"] < 0.5 and p["n"] >= MIN_PALABRAS and p["lang"] != "en"]
        english = [p for p in group if p["lang"] == "en" and p["n"] > 100]
        own_titles = sorted({p["title"].strip() for p in fronts if not SIN_TITULO.match(p["title"].strip())}, key=len)
        entry = {"nombre": NOTAS.get(slug, (own_titles[-1] if own_titles else title_of(front),))[0],
                 "estado": "no está en el sitio" if not home else "está, con texto de 2025 sin pasar" if pending else "está",
                 "en_el_sitio": ROUTE[home.split("/")[0]] + home.split("/")[1] if home else None,
                 "palabras_propias": front["n"], "ya_en_el_sitio_pct": round(front["cov"] * 100), **source(front),
                 "capturas": sorted({p["snapshot"][:4] for p in group})}
        if slug in NOTAS:
            entry["nota"] = NOTAS[slug][1]
        if subpages:
            entry["subpaginas"] = [{"titulo": title_of(p), "palabras": p["n"], "ya_en_el_sitio_pct": round(p["cov"] * 100), "idioma": p["lang"], **source(p)}
                                   for p in sorted(subpages.values(), key=lambda p: -p["n"])]
        if english:
            entry["version_en_ingles"] = source(max(english, key=lambda p: p["n"]))
        out.append(entry)
    out += gallery_albums(pages, out)
    order = {"no está en el sitio": 0, "álbum de la galería de 2006": 1, "está, con texto de 2025 sin pasar": 2, "está": 3}
    return sorted(out, key=lambda c: (order[c["estado"]], c["nombre"]))


def gallery_albums(pages, known):
    """Álbumes de la galería de 2006 que no corresponden a ninguna colección publicada."""
    index = next((p for p in pages if p["path"].startswith("galeria/index.php")), None)
    if not index:
        return []
    names = [key(c["nombre"]) for c in known]
    albums = re.findall(r"\n([^\n]+)\n(\d+) files, last one added on", index["text"])
    return [{"nombre": name.strip(), "estado": "álbum de la galería de 2006", "en_el_sitio": None, "obras_en_el_album": int(count),
             "nota": "No era una colección aparte en el menú; conviene revisar si sus obras ya están repartidas en otra.", **source(index)}
            for name, count in albums if not any(key(name) in known_name for known_name in names)]


# ───────────────────────────────────────────── 2 · obras
ADORNO = re.compile(r"/templates/|/modules/|/plugins/|/media/system|/components/|/administrator/|/includes/|/mambots/|/language/|/editor|favicon|/banners|"
                    r"M_images|smilies|/system/|logo|boton|button|icon|bullet|arrow|spacer|pixel|bg_|_bg|header|footer|menu|rss|indent|rating|/themes/|"
                    r"blank\.|shadow|flecha|linea|fondo|acymailing|cgi-sys|gantry|siguenos|transparent\.gif|/img/|pinit|share|captcha", re.I)
DE_OBRA = re.compile(r"obras|plegaria|sincretismo|prayer_flags|tienda|mi_trabajo|rsgallery|albums/|exposiciones|alquimia|poetry|bandera|galeria", re.I)
CODIGO = re.compile(r"^[0-9a-f]{32}\.\w+$")
SIN_NOMBRE = re.compile(r"^(\d+\w?|ima?ge?n? ?\d+|img ?\d+|dsc ?\d+.*|mg ?\d+|[a-z]+ ?\d+[a-z]?)$")
SUFIJO = re.compile(r"[_-]?(frente|reverso|dorso|detalle\d*|det\d*|peq|web|ret|copy|_0\d)$", re.I)  # variantes y trozos de una misma imagen
CARPETA_A_COLECCION = [
    ("identidad", "identidad"), ("detras", "detras-de-la-ventana"), ("obras_agua", "el-agua-como-elemento"), ("el-agua-como-elemento", "el-agua-como-elemento"),
    ("sexto_sol", "el-agua-como-elemento"), ("transmu", "transmutacion"), ("suenos", "suenos-en-azul"), ("sincretismo", "sincretismo-religioso"),
    ("plegaria", "plegaria"), ("alquimia", "alquimia"), ("prayer_flags", "prayer-flags"), ("bandera", "prayer-flags"), ("atmosfera", "atmosfera"),
    ("/ave/", "ave-fenix"), ("ave_fenix", "ave-fenix"), ("musas", "musas-del-cantaro"), ("globaliz", "globalizacion"), ("poetry", "poetry"),
    ("exvotos", "exvotos"), ("cruz", "banderas-de-corpus-christi"), ("vistas_guate", "banderas-de-corpus-christi"), ("revelacion", "revelaciones"),
    ("cofradia", "la-cofradia")]


def thumbnail_rest(path):
    """Si es una miniatura con nombre, la parte del nombre que describe la imagen original; si no, None."""
    folder, name = os.path.split(path)
    patterns = [(r"http--.*-uploads-[^-]+-(?:thumb_)?(.+?)(?:-\d+x\d+)?(\.\w+)$", True), (r"jw_sig_cache_[0-9a-f]+_(.+)$", True), (r"\d+x\d+-(.+)$", "mgthumbnails" in folder), (r"b_\d+_\d+_\d+_\d+_(.+)$", "multithumb" in folder),
                (r"(?:thumb|tn|normal|p)_(.+)$", True), (r"(.+\.(?:gif|jpe?g))\.jpg$", "rsgallery" in folder),
                (r"(.+?)(?:-\d+x\d+|_\d+_\d+)(\.\w+)$", "/thumbnails/" in path or "/resized/" in path)]
    for pattern, applies in patterns:
        found = applies and re.match(pattern, name)
        if found:
            return "".join(found.groups())
    return None


class Images:
    """Todas las imágenes del sitio viejo, agrupadas por la imagen original de la que salen."""

    def __init__(self):
        self.records = []  # (ruta, copia o None, es miniatura, página que la muestra, texto alternativo)
        self.unnamed = collections.defaultdict(list)

    def add(self, path, copy=None, page=None, alt=()):
        path = urllib.parse.unquote(path).split("?")[0]
        if ADORNO.search(path) or not IMAGE.search(path):
            return
        if CODIGO.match(os.path.basename(path)):
            if copy:
                self.unnamed["/".join(path.split("/")[1:-1])].append(copy)
            return
        self.records.append((path, copy, page, tuple(alt)))

    def grouped(self):
        originals = {}
        for path, *_ in self.records:
            if thumbnail_rest(path) is None:
                originals[key(re.sub(r"\.\w+$", "", path.split("/", 1)[-1]))] = os.path.basename(path)
        groups = collections.defaultdict(lambda: {"full": [], "thumbs": [], "pages": set(), "alt": set()})
        for path, copy, page, alt in self.records:
            rest = thumbnail_rest(path)
            name = os.path.basename(path) if rest is None else self.original_name(rest, originals)
            group = groups[self.stem(name)]
            group["name"] = group.get("name") or name
            target = group["thumbs"] if rest is not None else group["full"]
            if (path, copy) not in target:
                target.append((path, copy))
            if page:
                group["pages"].add(page)
            group["alt"].update(alt)
        return groups

    @staticmethod
    def original_name(rest, originals):
        """Las miniaturas guardan la ruta aplastada («images-stories-obras-x.jpg»): se busca a qué original corresponde."""
        flat = key(re.sub(r"\.\w+$", "", rest))
        match = next((name for path_key, name in originals.items() if len(flat) > 8 and path_key.endswith(flat)), None)
        if match or not rest.startswith("images"):
            return match or rest
        return rest.split("-" if "-" in rest else "_")[-1]  # sin original conocido: lo que queda tras la última carpeta

    @staticmethod
    def stem(name):
        base = re.sub(r"\.\w{3,4}$", "", name)
        return key(SUFIJO.sub("", base)) or key(base)


def collect_images(pages, urls):
    images = Images()
    for row in urls:
        if row["mimetype"].startswith("image/") and row.get("last200"):
            images.add(row["url"], copy=f"https://web.archive.org/web/{row['last200']}/{row['original']}")
    for page in pages:
        base = "http://" + urllib.parse.unquote(page["url"])
        for image in page.get("images") or []:
            alt = [t.strip() for t in (image.get("alt"), image.get("title"))
                   if t and len(t) < 120 and not re.match(r"click to enlarge|leer más|photo thumb", t, re.I)]
            images.add(bare(urllib.parse.urljoin(base, image.get("src") or "")), page=page["archive"], alt=alt)
    missing = f"{LEGACY}/assets/_missing.json"  # imágenes que las páginas nombran y el archivo nunca guardó
    if os.path.exists(missing):
        data = load(missing)
        for item in data if isinstance(data, list) else data.keys():
            images.add(bare(item if isinstance(item, str) else item.get("url") or item.get("src") or ""))
    fetched = f"{LEGACY}/assets/galeria2006/fetch.txt"  # la galería de 2006 vivía en otro dominio
    if os.path.exists(fetched):
        for line in open(fetched):
            url = line.split("\t")[0].strip()
            if "/albums/" in url:  # lo demás son botones de la propia galería
                images.add(bare(url), copy=url.replace("id_/", "/"))
    return images


def unseen_artworks(images, site):
    seen_stems = {Images.stem(os.path.basename(u.split("?")[0])) for u in site.urls if IMAGE.search(u.split("?")[0])}
    seen_stems |= {Images.stem(thumbnail_rest(u.split("?")[0]) or "") for u in site.urls} | site.media
    tally = collections.Counter()
    unseen, others = [], collections.Counter()
    for stem, group in images.grouped().items():
        entries = group["full"] + group["thumbs"]
        paths = [path for path, _ in entries]
        folder = "/".join(paths[0].split("/")[1:-1])
        if any(bare(p) in site.urls for p in paths) or stem in seen_stems:
            tally["ya_usadas_por_direccion_o_nombre_de_archivo"] += 1
        elif stem in site.titles:
            tally["con_el_mismo_titulo_que_una_obra_del_sitio"] += 1
        elif not DE_OBRA.search(" ".join(paths)):
            others[folder.split("/thumbnails/")[-1]] += 1
        else:
            archived = [(p, c) for p, c in entries if c]
            best = next(iter([e for e in group["full"] if e[1]] + archived + entries))
            label = re.sub(r"\s+", " ", re.sub(r"[_-]+", " ", re.sub(r"\.\w{3,4}$", "", group["name"]))).strip()
            entry = {"titulo_probable": None if SIN_NOMBRE.match(plain(label)) else label.capitalize(), "archivo": group["name"],
                     "coleccion_probable": next((c for hint, c in CARPETA_A_COLECCION if hint in plain(" ".join(paths))), None),
                     "carpeta": folder, "direccion": "http://" + best[0], "copia": best[1],
                     "guardada": "tamaño completo" if any(c for _, c in group["full"]) else "solo miniatura" if archived else "nunca se archivó"}
            for field, value in (("parecida_a", site.similar_title(stem)), ("texto_alternativo", sorted(group["alt"])[:3]), ("aparece_en", sorted(group["pages"])[:3])):
                if value:
                    entry[field] = value
            unseen.append(entry)
    unseen.sort(key=lambda o: (o["coleccion_probable"] or "zz", o["carpeta"], o["archivo"]))
    tally["no_vistas"] = len(unseen)
    return unseen, dict(others.most_common()), dict(tally)


# fichas de la galería de 2006
PARTICULAR = re.compile(r"Colecci[oó]n\s+(Particula\w*|Privada)\b.*", re.I)
PRECIO = re.compile(r"\s*\|?\s*Precio:?\s*\$?\s*[\d.,]+", re.I)
RUIDO = re.compile(r"^(disponible|last additions|random files|\(\d+ votes?\)|\d+ views|\d+ files on .*|\d+|)$", re.I)
VISTAS = re.compile(r"\d+ views")
ENTIDADES = {"&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&aacute;": "á", "&eacute;": "é", "&iacute;": "í", "&oacute;": "ó", "&uacute;": "ú", "&ntilde;": "ñ"}


def html_to_lines(html):
    html = re.sub(r"<script.*?</script>|<style.*?</style>", "", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", "\n", html)
    for entity, char in ENTIDADES.items():
        text = text.replace(entity, char)
    return [line.strip() for line in text.split("\n") if line.strip()]


def clean_details(lines):
    cleaned = (PRECIO.sub("", PARTICULAR.sub("Colección particular", line)).strip() for line in lines)
    return [line for line in cleaned if not RUIDO.match(line) and len(line) < 200]


def gallery_cards(lines):
    """En los listados cada obra es: título, «N views» y unas pocas líneas de ficha."""
    for i, line in enumerate(lines):
        if i == 0 or not VISTAS.fullmatch(line):
            continue
        details = []
        for j in range(i + 1, min(i + 8, len(lines))):
            next_is_title = j + 1 < len(lines) and VISTAS.fullmatch(lines[j + 1])
            if VISTAS.fullmatch(lines[j]) or next_is_title:
                break
            details.append(lines[j])
        yield {"titulo": lines[i - 1], "ficha": clean_details(details)}


def gallery_sheet(lines):
    """La página de una sola obra: álbum, «FILE 9/19», título, ficha hasta «Rate this file» y, más abajo, el nombre del archivo."""
    at = next((i for i, line in enumerate(lines) if re.fullmatch(r"FILE \d+/\d+", line)), None)
    if at is None or at + 1 >= len(lines):
        return
    end = next((i for i in range(at + 2, len(lines)) if lines[i].startswith("Rate this file")), at + 2)
    sheet = {"titulo": lines[at + 1], "ficha": clean_details(lines[at + 2:end]), "album": lines[at - 1]}
    if "Filename:" in lines[:-1]:
        sheet["archivo"] = lines[lines.index("Filename:") + 1]
    yield sheet


def unseen_cards(pages, site):
    sources = [p["text"].split("\n") for p in pages if p["path"].startswith("galeria/")]
    for path in sorted(glob.glob(f"{LEGACY}/assets/galeria2006/page_*.html")):
        with open(path, errors="replace") as fh:
            sources.append(html_to_lines(fh.read()))
    cards = {}
    for source_lines in sources:
        lines = [line.strip() for line in source_lines if line.strip()]
        for card in (*gallery_cards(lines), *gallery_sheet(lines)):
            title = card["titulo"]
            if len(title) >= 80 or re.fullmatch(r"[\d ]+", title):
                continue
            merged = cards.setdefault(key(title), {"titulo": title, "ficha": []})
            merged["ficha"] += [detail for detail in card["ficha"] if detail not in merged["ficha"]]
            for extra in ("album", "archivo"):
                if card.get(extra):
                    merged.setdefault(extra, card[extra])
    out = []
    for stem, card in sorted(cards.items()):
        if stem in site.titles:
            continue
        similar = site.similar_title(stem)
        out.append({**card, **({"parecida_a": similar} if similar else {}), "fuente": "galería de 2006 (galeria.calirivera.com), copia en Internet Archive"})
    return out


# ───────────────────────────────────────────── 3 · enlaces
ARCHIVO = re.compile(r"\.(pdf|docx?|pptx?|xlsx?|zip|mp3|mp4|m4a|wav|swf|flv|mov|wmv)(\?|$)", re.I)
TIPO = {"pdf": "PDF", "mp3": "audio", "swf": "Flash (animación o música del sitio viejo; hoy no se abre sin un emulador)"}
QUIZA = {"catalogo_agua.pdf": "elementos2.pdf", "taller_del_artista_menu.pdf": "menu-taller-del-artista.pdf", "menu_agosto_19.pdf": "menu-taller-del-artista.pdf"}
VIDEO = re.compile(r"(?:youtube\.com/(?:watch\?v=|embed/|v/)|youtu\.be/)([\w-]{11})|vimeo\.com/(?:video/)?(\d{6,})")
NAVEGACION = re.compile(r"mailto|print=1|tmpl=component|format=feed|task=|/component/|option=com_(?!content)|javascript:|^#|type=(rss|atom)|login|registr|"
                        r"start=|/administrator|/feed|/tag|search|lang=|view=category|/galeria/|forgot|\.(css|js|jpe?g|png|gif|ico)(\?|$)", re.I)
DEL_SISTEMA = re.compile(r"login|contactanos|component/content")  # formularios y listados automáticos, sin contenido propio
PROPIO = re.compile(r"(calirivera\.com|tallerdelartista\.com)/")
SIN_TEXTO = re.compile(r"[\d\W]+|ver detalles\.?|leer más.*|anterior|siguiente|english version.*|album list|last \w+|most viewed|top rated|"
                       r"leave a comment|uncategorised|blog test", re.I)


def article_slug(path):
    """El nombre de una entrada de Joomla, igual aunque cambie la carpeta desde la que se enlaza; None si no es una entrada."""
    found = re.search(r"id=\d+:([\w-]+)", path) or re.search(r"/\d+-([\w-]+?)(?:\.html)?$", path.split("?")[0].rstrip("/"))
    return key(found.group(1)) if found else None


def distinct_pages(pages):
    """Sin las capturas repetidas de una misma página: de cada una queda la más completa."""
    kept = []
    for page in sorted(pages, key=lambda p: -p["n"]):
        grams = set(shingles(words(" ".join(page["body"]))))
        repeated = any(abs(other["n"] - page["n"]) <= other["n"] * 0.25 and len(grams & other["grams"]) >= len(grams) * 0.8 for other in kept)
        if grams and not repeated:
            kept.append({**page, "grams": grams})
    return kept


def pending_pages(pages, site, redirect):
    """Páginas con texto que el sitio nuevo no tiene. Cada texto se anota una sola vez, en la página más pequeña que lo trae:
    así una categoría que repite sus entradas solo aparece si además tiene algo propio."""
    claimed, spanish, english = set(), [], []
    readable = [p for p in pages if not DEL_SISTEMA.search(p["path"])]
    for page in sorted(distinct_pages(readable), key=lambda p: p["n"]):
        fresh = {g for g in page["grams"] if g not in site.shingles and g not in claimed}
        if len(fresh) >= max(MIN_PALABRAS, min(150, len(page["grams"]) * 0.3)):  # poco texto suelto en una página ya pasada no cuenta
            starts = next((l for l in page["body"] if len(l) > 15 and fresh.issuperset(shingles(words(l))[:6])), None)
            target = redirect.get(page["url"])
            entry = {"titulo": title_of(page), "seccion": SECCION.get(page["sec"], page["sec"]), "idioma": page["lang"], "palabras": page["n"],
                     "palabras_nuevas": len(fresh), "ya_en_el_sitio_pct": round(page["cov"] * 100), "empieza": starts[:140] if starts else None,
                     **source(page), "adonde_iria": target if target and target != "gone" else None}
            (english if page["lang"] == "en" else spanish).append(entry)
        claimed |= page["grams"]
    by_size = lambda entry: -entry["palabras_nuevas"]
    return sorted(spanish, key=by_size), sorted(english, key=by_size)


def named_never_archived(pages, urls, site):
    """Páginas propias que el sitio viejo enlazaba y de las que no quedó ninguna copia."""
    archived = {urllib.parse.unquote(row["url"]).rstrip("/") for row in urls}
    archived_slugs = {article_slug(path) for path in archived} - {None}
    known_titles = {key(title_of(p)) for p in pages}
    found = {}
    for page in pages:
        base = "http://" + urllib.parse.unquote(page["url"])
        for link in page.get("links") or []:
            href, text = href_of(link), (link.get("text") or "").strip() if isinstance(link, dict) else ""
            target = bare(urllib.parse.urljoin(base, href))
            if not href or len(text) < 8 or SIN_TEXTO.fullmatch(text) or NAVEGACION.search(target) or ARCHIVO.search(target):
                continue
            if not PROPIO.match(target) or re.search(r"/ ?(https?:|www\.)", target) or key(text) in known_titles:
                continue
            if target.rstrip("/") in archived or article_slug(target) in archived_slugs:
                continue
            found.setdefault(key(text), {"texto_del_enlace": text, "direccion": "http://" + target, "nombrada_en": page["archive"],
                                         "se_menciona_en_el_sitio": plain(text) in site.plain})
    return sorted(found.values(), key=lambda e: e["texto_del_enlace"])


def unused_files(pages, urls, site):
    files = {}
    for row in urls:
        path = urllib.parse.unquote(row["url"])
        if ARCHIVO.search(path) and row.get("last200"):
            name = os.path.basename(path.split("?")[0])
            files[name.lower()] = {"archivo": name, "direccion": "http://" + path, "copia": f"https://web.archive.org/web/{row['last200']}/{row['original']}"}
    for page in pages:
        for link in page.get("links") or []:
            if ARCHIVO.search(href_of(link)):
                path = bare(urllib.parse.urljoin("http://" + urllib.parse.unquote(page["url"]), href_of(link)))
                name = os.path.basename(path.split("?")[0])
                files.setdefault(name.lower(), {"archivo": name, "direccion": "http://" + path, "copia": None, "enlazado_desde": page["archive"]})
    out = []
    for name, entry in sorted(files.items()):
        if key(name) in site.files:
            continue
        entry["tipo"] = TIPO.get(name.rsplit(".", 1)[-1], name.rsplit(".", 1)[-1].upper())
        if name in QUIZA:
            entry["quiza_es"] = f"{QUIZA[name]}, que ya está en el sitio (sin comparar)"
        out.append(entry)
    return out


def unused_embeds(pages, site):
    videos, frames = {}, {}
    for page in pages:
        flags = [str(f) for f in page.get("flags") or []]
        haystack = " ".join([page["text"], *flags, *(href_of(l) for l in page.get("links") or [])])
        for found in VIDEO.finditer(haystack):
            ident = found.group(1) or found.group(2)
            if ident not in site.blob:
                address = ("https://www.youtube.com/watch?v=" if found.group(1) else "https://vimeo.com/") + ident
                videos.setdefault(ident, {"video": address, "pagina": title_of(page), "copia_de_la_pagina": page["archive"]})
        for flag in flags:
            address = flag[7:]
            if flag.startswith("iframe:") and not VIDEO.search(flag) and not re.search(r"facebook|google|twitter|addthis|shoutit", flag) \
                    and bare(address).split("?")[0] not in site.blob:
                frames.setdefault(address, {"incrustado": address, "pagina": title_of(page), "copia_de_la_pagina": page["archive"]})
    return list(videos.values()), list(frames.values())


def unused_external(site):
    path = f"{LEGACY}/enlaces-2025.json"
    if not os.path.exists(path):
        return []
    data = load(path)
    placed = collections.defaultdict(set)
    for group in data["paginas"].values():
        for page in group:
            for link in page["links"]:
                placed[bare(link[0]).rstrip("/")].add((page.get("title") or "")[:60])
    used_copies = {bare(u).rstrip("/") for u in re.findall(r"https://web\.archive\.org/web/[^\"\\ ]+", site.blob)}
    out = {}
    for address, state in data["estado"].items():
        core = bare(address).rstrip("/")
        if core in site.blob or (state.get("wb") and bare(state["wb"]).rstrip("/") in used_copies):
            continue
        out.setdefault(core, {"direccion": address, "sigue_en_linea": state["live"].startswith("200"), "copia": state.get("wb") or None,
                              "estaba_en": sorted(placed.get(core, []))[:3]})
    return list(out.values())


# ───────────────────────────────────────────── salida
def main():
    site = Site()
    pages = load_pages(site)
    urls = load(f"{LEGACY}/urls.json")
    with open(f"{LEGACY}/redirects.csv") as fh:
        redirect = {row[0]: row[1] for row in csv.reader(fh) if len(row) > 1}

    series = collections_of_2025(pages, site)
    images = collect_images(pages, urls)
    by_image, other_images, tally = unseen_artworks(images, site)
    by_card = unseen_cards(pages, site)
    spanish, english = pending_pages(pages, site, redirect)
    never = named_never_archived(pages, urls, site)
    files = unused_files(pages, urls, site)
    videos, frames = unused_embeds(pages, site)
    external = unused_external(site)
    unnamed = sum(len(copies) for copies in images.unnamed.values())

    result = {
        "generado": datetime.date.today().isoformat(),
        "sobre": "Lo que el sitio de 2025 (calirivera.com en Joomla, copia de Internet Archive) tenía y el sitio nuevo todavía no usa.",
        "como_leerlo": {
            "no_vista": "El sitio nuevo no la usa ni por dirección ni por nombre de archivo. Ninguna imagen se abrió para confirmarlo: "
                        "puede ser otra foto de una obra que ya está. «parecida_a» avisa cuando el nombre se parece al de una obra del sitio.",
            "ya_en_el_sitio_pct": "Parte del texto propio de la página (sin menú ni pie) que ya aparece, palabra por palabra, en el contenido nuevo.",
            "copia": "Dirección de la copia en Internet Archive. Cuando es null, alguna página la nombraba pero el archivo nunca la guardó.",
            "privacidad": "Las fichas de 2006 traían nombres de coleccionistas particulares y precios; aquí no se copian.",
        },
        "resumen": {
            "colecciones_en_2025": len(series),
            "colecciones_que_no_estan": sum(1 for c in series if not c["en_el_sitio"]),
            "colecciones_con_texto_sin_pasar": sum(1 for c in series if "sin pasar" in c["estado"]),
            "imagenes_de_obra_no_vistas": len(by_image),
            "de_ellas_a_tamano_completo": sum(1 for o in by_image if o["guardada"] == "tamaño completo"),
            "de_ellas_solo_miniatura": sum(1 for o in by_image if o["guardada"] == "solo miniatura"),
            "de_ellas_nunca_archivadas": sum(1 for o in by_image if o["guardada"] == "nunca se archivó"),
            "titulos_con_ficha_no_vistos": len(by_card),
            "miniaturas_sin_nombre": unnamed,
            "paginas_con_texto_sin_pasar": len(spanish),
            "paginas_en_ingles": len(english),
            "paginas_nombradas_nunca_archivadas": len(never),
            "archivos_sin_usar": len(files),
            "videos_sin_usar": len(videos),
            "contenido_incrustado_sin_usar": len(frames),
            "enlaces_externos_sin_usar": len(external),
        },
        "colecciones": series,
        "obras": {
            "como_se_descartaron": tally,
            "por_imagen": by_image,
            "por_titulo_con_ficha": by_card,
            "miniaturas_sin_nombre": {"nota": "El nombre del archivo es un código: no se sabe qué muestran sin abrirlas.",
                                      "copias": {folder: sorted(copies) for folder, copies in sorted(images.unnamed.items())}},
            "otras_imagenes_no_usadas": {"nota": "Afiches de agenda, fotos de actividades y otras que no parecen obra. Cantidad por carpeta.",
                                         "por_carpeta": other_images},
        },
        "enlaces": {"paginas_con_texto_sin_pasar": spanish, "paginas_en_ingles": english, "paginas_nombradas_nunca_archivadas": never,
                    "archivos": files, "videos": videos, "contenido_incrustado": frames, "externos": external},
    }
    with open(SALIDA, "w") as fh:
        fh.write(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    for name, value in result["resumen"].items():
        print(f"{value:5}  {name}")


if __name__ == "__main__":
    main()
