#!/usr/bin/env python3
"""
El menú del Taller del Artista, como página (/menu), sacado del PDF que el sitio aloja
(web/public/files/menu-taller-del-artista.pdf, 32 MB: en un teléfono no conviene descargarlo).

Lee cada página del PDF: en las de comida, «nombre / precio / descripción» vienen en ese orden; en las de
cafés y cócteles vienen en columnas, y se arman los renglones por su altura en la página.
No toca nombres ni precios (solo pasa ¢ a ₡ y corrige mayúsculas sostenidas y cuatro erratas evidentes).
Si la página ya existe, no la pisa: los precios se cambian desde el editor. Con --forzar se rehace.

Uso: python3 tools/menu-from-pdf.py [--forzar]      (necesita pymupdf)
"""
import json, os, re, sys
import pymupdf as fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = f"{ROOT}/content/pages/menu.json"
NOW = "2026-11-22T12:00:00Z"
if os.path.exists(OUT) and "--forzar" not in sys.argv:
    print("content/pages/menu.json ya existe; no se toca (use --forzar para rehacerlo)")
    sys.exit(0)
doc = fitz.open(f"{ROOT}/web/public/files/menu-taller-del-artista.pdf")
PRICE = re.compile(r"^[¢₡]\s?[\d.,]+$")
TAX = "Los precios incluyen todos los impuestos"


def money(s):
    n = int(re.sub(r"\D", "", s))
    return "₡" + f"{n:,}".replace(",", ".")


def clean(s):
    s = re.sub(r"\s+", " ", s).strip()
    return re.sub(r"\s+([,.;:])", r"\1", s)


def lines(page):
    return [l.strip() for l in doc[page - 1].get_text().split("\n") if l.strip() and l.strip() != TAX]


def food(pages, lead_for=None):
    """Páginas de comida → (título de la sección, renglones, notas)."""
    items, notes, title, lead = [], [], None, []
    for page in pages:
        L = lines(page)
        i = 0
        while i < len(L):
            l = L[i]
            nxt = L[i + 1] if i + 1 < len(L) else ""
            if l.isupper() and not PRICE.match(l) and len(l) > 6 and not items or (l.isupper() and l == (title or "").upper()):
                if title is None:
                    title = l.capitalize()
                i += 1
            elif PRICE.match(nxt):
                items.append({"name": clean(l), "price": money(nxt), "text": ""})
                i += 2
            elif l.startswith("Todos nuestros platos fuertes"):
                notes.append(clean(l.rstrip(".") + ": " + nxt.replace(" - ", ", ").lower()) + ".")
                i += 2
            elif l.startswith("Da un toque personal"):
                notes.append(clean(" ".join(L[i:])).replace("ensalada eligiendo", "ensaladas eligiendo").replace("₡2,500", "₡2.500").replace("₡3,500", "₡3.500")
                             .replace(" Camarones:", "; camarones:").replace(" Salmón:", "; salmón:").replace("proteínas: Pollo", "proteínas: pollo").replace(" ¡Haz", ". ¡Haz") + "!")
                break
            elif l == "Tabla de Appetizers":
                j = next(k for k in range(i, len(L)) if "Personas" in L[k])
                per = " · ".join(f"{m.group(1)} personas {money(m.group(2))}" for m in (re.match(r"(\d) Personas ([¢₡][\d.]+)", x) for x in L[j:j + 3]) if m)
                items.append({"name": l, "price": per, "text": clean(" ".join(L[i + 1:j]))})
                i = j + 3
            elif not items and title is None:
                lead.append(l)  # texto antes del título de la sección (p. 6: la crema de pejibaye)
                i += 1
            else:
                if items:
                    items[-1]["text"] = clean(items[-1]["text"] + " " + l)
                i += 1
    if lead_for and lead:
        next(x for x in items if x["name"] == lead_for)["text"] = clean(" ".join(lead))
    for x in items:
        if not x["text"]:
            x.pop("text")
        else:
            x["text"] = x["text"][0].upper() + x["text"][1:] + ("" if x["text"].endswith((".", "!", ")")) else ".")
    return title, items, notes


SMALL = {"De", "Del", "Con", "En", "Y", "A", "La", "El", "Los", "Las"}
# erratas evidentes del PDF (nombres propios y cuatro palabras); lo demás queda como está impreso
NAME_FIX = {"Lima Limon": "Lima Limón", "Maracuya": "Maracuyá", "Trópical": "Tropical", "Cesar Valverde": "César Valverde", "Lola Fernandez": "Lola Fernández",
            "¨Felo¨": "«Felo»", "6.O": "6.0"}
TEXT_FIX = {"marshmallws": "marshmallows", "liquído": "líquido", "bayleis": "Baileys", "melocotóny": "melocotón y", "dechocolate": "de chocolate"}


def name_case(s):
    w = s.title().split()
    s = " ".join(x.lower() if k and x in SMALL else x for k, x in enumerate(w))
    for a, b in NAME_FIX.items():
        s = s.replace(a, b)
    return s


def sentence(s):
    s = s.strip().capitalize()
    for a, b in TEXT_FIX.items():
        s = s.replace(a, b)
    return s


def columns(page, brands=False):
    """Páginas en columnas: junta cada nombre con el precio de su altura y con la línea que tiene debajo."""
    B = [(b[0], b[1], b[4].strip()) for b in doc[page - 1].get_text("blocks") if b[4].strip() and b[4].strip() != TAX]
    title = min(B, key=lambda b: b[1])
    rest = [b for b in B if b is not title]
    prices = [b for b in rest if PRICE.match(b[2])]
    px = min(p[0] for p in prices)
    left = min(b[0] for b in rest if not PRICE.match(b[2]))
    names = sorted([b for b in rest if not PRICE.match(b[2]) and abs(b[0] - left) < 4 and any(abs(b[1] - p[1]) < 8 for p in prices)], key=lambda b: b[1])
    descs = [b for b in rest if b not in names and b not in prices]
    out = []
    for n in names:
        it = {"name": name_case(n[2]), "price": money(min(prices, key=lambda p: abs(p[1] - n[1]))[2])}
        out.append((n[1], it))
    notes = []
    for d in descs:
        if d[2].upper().startswith("CONSULTAR"):
            notes.append("Batidos: " + d[2].lower() + ".")
            continue
        y, it = max((x for x in out if x[0] <= d[1] + 8), key=lambda x: x[0])
        it["text"] = (sentence(d[2]) if not brands else name_case(d[2].replace(" - ", ", ").replace(",  ", ", ")).replace("Bavaria Master, Gold, Master", "Bavaria Master, Gold")).rstrip(".") + "."
    return [it for _, it in out], " ".join(notes) or None


def block(i, items, note=None):
    b = {"type": "menu", "id": f"menu-{i}", "items": items}
    if note:
        b["note"] = note
    return b


S = []
for sid, pages, lead in (("entradas-y-tapas", (3, 4), None), ("sopas-y-ensaladas", (6,), "Crema de Pejibaye"), ("platos-fuertes-de-la-tierra", (7,), None),
                         ("platos-fuertes-del-mar", (8,), None), ("pastas-y-bocatas", (9,), None), ("para-compartir", (10,), None), ("postres", (11,), None)):
    title, items, notes = food(pages, lead)
    S.append({"id": sid, "layout": "auto", "title": title, "blocks": [block(sid, items, " ".join(notes) or None)]})
acomp = next(b["note"] for s in S if s["id"] == "platos-fuertes-del-mar" for b in s["blocks"])
next(s for s in S if s["id"] == "platos-fuertes-de-la-tierra")["blocks"][0]["note"] = acomp
S.append({"id": "cafes-calientes", "layout": "auto", "title": "Galería de cafés calientes", "blocks": [
    {"type": "paragraph", "id": "menu-cafes-nota", "text": "Cada café lleva el nombre de un artista costarricense."}, block("cafes-calientes", columns(12)[0])]})
S.append({"id": "cafes-frios", "layout": "auto", "title": "Galería de cafés fríos", "blocks": [block("cafes-frios", columns(13)[0])]})
p15, p15note = columns(15, brands=True)
S.append({"id": "cocteles", "layout": "auto", "title": "Cócteles", "blocks": [block("cocteles", columns(14)[0] + [x for x in p15 if x["name"].startswith(("Mojito", "Gin"))])]})
S.append({"id": "cervezas-y-bebidas", "layout": "auto", "title": "Cervezas y bebidas", "blocks": [block("cervezas-y-bebidas", [x for x in p15 if not x["name"].startswith(("Mojito", "Gin"))], p15note)]})
art = lines(5)
S.append({"id": "espacio-de-arte", "layout": "auto", "title": "Espacio de arte", "blocks": [
    {"type": "paragraph", "id": "menu-arte-1", "text": clean(" ".join(art[1:6]))},
    {"type": "paragraph", "id": "menu-arte-2", "text": clean(" ".join(art[6:]))},
    {"type": "quote", "id": "menu-cierre", "text": clean(" ".join(lines(16)[:6])).strip('"').replace("  ", " "), "cite": "Cali Rivera"},
    {"type": "links", "id": "menu-enlaces", "items": [
        {"label": "Reservar por WhatsApp", "href": "https://wa.me/50683483785", "kind": "whatsapp"},
        {"label": "El menú en PDF, como se entrega en la mesa", "href": "/files/menu-taller-del-artista.pdf", "note": "PDF · 32 MB", "kind": "pdf"},
        {"label": "Taller del Artista", "href": "/taller-del-artista", "kind": "internal"}]}]})
page = {"id": "menu", "slug": "menu", "status": "published", "createdAt": NOW, "updatedAt": NOW, "title": "Menú",
        "description": "Explora, saborea, inspírate. La carta del Taller del Artista; los precios incluyen todos los impuestos.",
        "menu": "taller", "sections": S,
        "seo": {"title": "Menú del Taller del Artista", "description": "La carta del restaurante del Taller del Artista, en Tres Ríos: entradas, platos fuertes, pastas, postres, cafés con nombre de artista y cócteles, con precios."}}
with open(OUT, "w") as fh:
    fh.write(json.dumps(page, ensure_ascii=False, indent=1) + "\n")
for s in S:
    for b in s["blocks"]:
        if b["type"] == "menu":
            print(f"{s['title']}: {len(b['items'])}", "| nota:" if b.get("note") else "", (b.get("note") or "")[:90])
