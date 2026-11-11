#!/usr/bin/env python3
"""
Notas de prensa («Puntos de vista» del sitio viejo) → bloques limpios.
Lee los enlaces a Wayback de content/pages/trayectoria-and-entrevistas.json, busca el HTML ya descargado en
legacy/html (si falta o está vacío, lo baja de Wayback en crudo `id_`, con reintentos) y deja en
legacy/content/press.json: título, medio, autor, fecha, bloques (párrafos, imágenes con pie) e imágenes a rescatar.
No reescribe ni resume: solo quita el menú, botones y basura del Joomla viejo.
Uso: python3 tools/press-extract.py
"""
import json, os, re, subprocess, time, unicodedata
from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
L = os.path.join(ROOT, "legacy")
page = json.load(open(os.path.join(ROOT, "content/pages/trayectoria-and-entrevistas.json")))


def links():
    out = []
    def walk(o):
        if isinstance(o, dict):
            if isinstance(o.get("href"), str) and "web.archive.org" in o["href"] and "puntos-de-vista" in o["href"]:
                out.append(o)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(page)
    return out


HTML = os.listdir(os.path.join(L, "html"))


def html_for(href):
    m = re.search(r"puntos-de-vista/(\d+-[^/?#]+?)(?:\.html)?$", href)
    key = m.group(1)
    cands = [f for f in HTML if f.endswith(key) or f.endswith(key + ".html")]
    for f in cands:
        p = os.path.join(L, "html", f)
        if os.path.getsize(p) > 2000:
            return p, key
    # bajar de Wayback (crudo, sin barra) y guardarlo junto a los demás
    raw = re.sub(r"/web/(\d+)/", r"/web/\1id_/", href)
    dest = os.path.join(L, "html", f"wb_{key}")
    for i in range(5):
        r = subprocess.run(["curl", "-sS", "-L", "-m", "60", "-o", dest, "-w", "%{http_code}", raw], capture_output=True, text=True)
        if r.stdout == "200" and os.path.getsize(dest) > 2000 and b"Temporarily Offline" not in open(dest, "rb").read():
            return dest, key
        time.sleep(4 * (i + 1))
    raise SystemExit(f"no se pudo bajar {href}")


JUNK = re.compile(r"^(Imprimir|Correo electrónico|Compartir|Tweet|f|Pin It|Anterior|Siguiente|Detalles|Visto:.*|Escrito por.*|Categoría:.*|Publicado:.*|View the embedded image gallery online at:?|http\S+|Social Sharing|Pagination|Ver artículo|« Anterior|Siguiente »|Prev|Next)$", re.I)


def body_of(soup):
    b = soup.select_one('[itemprop="articleBody"]')
    if b:
        return b
    art = soup.select_one("article.page-item") or soup.select_one("article")
    if art:
        for sel in ["header", ".item_icons", "#fb-root", ".lrcounter-horizontal-vertical", ".pagenav", "ul.pager", ".sigFreeContainer", ".sig-container"]:
            for t in art.select(sel):
                t.decompose()
        return art
    raise ValueError("sin cuerpo")


def norm_img(src):
    src = src.split("#")[0]
    src = re.sub(r"^https?://web\.archive\.org/web/\d+(?:im_|id_)?/", "", src)
    src = re.sub(r"^https?://(www\.)?", "", src)
    src = src.lstrip("/")
    if not src.startswith("calirivera.com"):
        src = "calirivera.com/" + src
    src = src.replace("calirivera.com/~calirive/", "calirivera.com/")
    # miniaturas de mgthumbnails → original: images/mgthumbnails/180x180-images-stories-a-b.jpg → images/stories/a/b.jpg
    m = re.search(r"images/mgthumbnails/\d+x\d+-(images-.+)$", src)
    if m:
        parts = m.group(1).split("-")
        # el último segmento es el archivo; los anteriores son carpetas (los nombres con guión se pierden: se prueban ambos)
        src = "calirivera.com/" + "/".join(parts)
    src = re.sub(r"-\d+x\d+(\.\w+)$", r"\1", src)
    return src


def text_of(el):
    t = el.get_text(" ", strip=True)
    t = re.sub(r"\s+", " ", t).replace(" ,", ",").replace(" .", ".").replace("( ", "(").replace(" )", ")")
    return t.strip()


def extract(path):
    soup = BeautifulSoup(open(path, encoding="utf-8", errors="replace"), "html.parser")
    for t in soup(["script", "style", "noscript", "iframe", "form"]):
        t.decompose()
    h = soup.select_one('[itemprop="headline"]') or soup.select_one(".item_title") or soup.select_one("h1, h2.contentheading, .contentheading")
    title = text_of(h) if h else ""
    body = body_of(soup)
    blocks, imgs, author = [], [], None
    seen = set()

    def add_par(t, cls=""):
        nonlocal author
        t = re.sub(r"^f\s+Compartir\s*", "", t.strip(" •·")).strip()
        if not t or JUNK.match(t) or t in seen:
            return
        if "autor" in cls and len(t) < 60:
            author = t
            return
        seen.add(t)
        blk = {"type": "paragraph", "text": t}
        if any(c in cls for c in ("titulo", "pretitulo", "bajada")):
            blk["lead"] = True
            blk["role"] = "titulo" if "titulo" in cls and "pre" not in cls else ("pretitulo" if "pre" in cls else "bajada")
        blocks.append(blk)

    def walk(node):
        for ch in node.children:
            if isinstance(ch, NavigableString):
                t = str(ch).strip()
                if t:
                    add_par(re.sub(r"\s+", " ", t))
                continue
            if not isinstance(ch, Tag):
                continue
            if ch.name == "img":
                src = ch.get("src") or ""
                if re.search(r"logo|pinit|siguenos|transparent|arrow|spacer|icon|joomlaImage|data:image", src, re.I):
                    continue
                n = norm_img(src)
                if n not in [i["src"] for i in imgs]:
                    imgs.append({"src": n, "alt": ch.get("alt") or "", "orig": src})
                    blocks.append({"type": "image", "src": n, "alt": ch.get("alt") or ""})
                continue
            cls = " ".join(ch.get("class") or [])
            if "piefoto" in cls:
                cap = text_of(ch)
                for b in reversed(blocks):
                    if b["type"] == "image" and not b.get("caption"):
                        b["caption"] = cap
                        break
                continue
            if ch.name in ("table", "tbody", "tr", "td", "div", "section", "center", "font", "blockquote") or (ch.name in ("p", "span") and ch.find("img")):
                walk(ch)
                continue
            if ch.name in ("p", "span", "h1", "h2", "h3", "h4", "h5", "li", "strong", "em", "b", "i", "a"):
                if ch.name in ("h1", "h2", "h3", "h4", "h5") and text_of(ch) == title:
                    continue
                if ch.name == "p" and ch.find("br") and not cls:
                    # párrafos partidos con <br>: un bloque por línea lógica
                    parts = [p for p in re.split(r"\n{1,}", ch.get_text("\n")) if p.strip()]
                    for p in parts:
                        add_par(re.sub(r"\s+", " ", p))
                    continue
                add_par(text_of(ch), cls)
                continue
            if ch.name == "br":
                continue
            walk(ch)

    walk(body)
    ext = None
    for a in body.find_all("a"):
        if a.get_text(strip=True).lower().startswith("ver art") and a.get("href", "").startswith("http"):
            ext = a["href"]
    # juntar líneas sueltas que en el original eran un mismo párrafo cortado
    merged = []
    for b in blocks:
        if merged and b["type"] == "paragraph" and merged[-1]["type"] == "paragraph" and not b.get("lead") and not merged[-1].get("lead") and not re.search(r"[.:!?»\"”…)]$", merged[-1]["text"]) and len(merged[-1]["text"]) < 400 and b["text"][:1].islower():
            merged[-1]["text"] += " " + b["text"]
        else:
            merged.append(b)
    return title, author, merged, imgs, ext


MESES = {m: i for i, m in enumerate("enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split(), 1)}
MESES["setiembre"] = 9


def date_of(label, title):
    s = (label + " " + title).lower()
    y = re.findall(r"(19\d\d|20\d\d)", s)
    year = int(y[-1]) if y else None
    m = next((v for k, v in MESES.items() if k in s), None)
    d = re.search(r"\b(\d{1,2})\s+(?:de\s+)?(?:" + "|".join(MESES) + ")", s)
    m2 = re.search(r"(\d{2})(\d{2})(20\d\d)", s)  # 10032011
    if m2:
        return f"{m2.group(3)}-{m2.group(2)}-{m2.group(1)}", True
    if year and m:
        return f"{year}-{m:02d}-{int(d.group(1)) if d else 1:02d}", bool(d)
    if year:
        return f"{year}-01-01", False
    return None, False


def slugify(s):
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:70]


out = []
for i, it in enumerate(links()):
    path, key = html_for(it["href"])
    title, author, blocks, imgs, ext = extract(path)
    date, exact = date_of(it["label"], title)
    out.append({
        "key": key,
        "label": it["label"],
        "title": title or it["label"],
        "author": author,
        "date": date,
        "exactDate": exact,
        "sourceUrl": it["href"],
        "html": os.path.relpath(path, ROOT),
        "externalUrl": ext,
        "blocks": blocks,
        "images": imgs,
        "order": i,
    })
json.dump(out, open(os.path.join(L, "content/press.json"), "w"), ensure_ascii=False, indent=1)
for o in out:
    words = sum(len(b.get("text", "").split()) for b in o["blocks"])
    print(f'{o["key"][:48]:48} | {o["date"]} | {words:4} palabras | {len(o["images"])} img | {o["author"] or ""}')
