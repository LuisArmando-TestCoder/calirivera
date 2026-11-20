#!/usr/bin/env python3
"""
Colecciones que el sitio de 2025 (Joomla, rescatado del Internet Archive) tenía bajo «Obras» y faltaban acá:
Identidad (2000–2005), Alquimia (2008), Banderas de Corpus Christi (2010), Sincretismo religioso (2014),
Revelaciones (2015); y como proyectos: Casa Museo Ave Fénix (2018–2020) y el texto de El agua es Oro.
También el reverso de las banderas 4, 6, 7 y 9 de Prayer Flags.

Textos: legacy/content/obras.json (palabras de Cali, sin reescribir). Fotos: las ya rescatadas en Memoria
(por su dirección original) y, para Revelaciones, legacy/assets.
Uso: python3 tools/wayback-collections.py <obras-extra.json> <carpeta legacy/assets>   (Pillow con AVIF)
"""
import base64, io, json, os, re, sys, glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C, PUB = f"{ROOT}/content", f"{ROOT}/web/public"
OBRAS, ASSETS = sys.argv[1], sys.argv[2]
NOW = "2026-11-20T03:00:00Z"
SRC = "Texto y fotos del sitio calirivera.com de 2025 (Internet Archive)."
pages = json.load(open(OBRAS))
mem = {os.path.basename(f)[:-5]: json.load(open(f)) for f in glob.glob(f"{C}/memories/*.json")}
touched = {}


def write(p, d):
    open(p, "w").write(json.dumps(d, ensure_ascii=False, indent=1) + "\n")


def lines(pat):
    x = next(x for x in pages if re.search(pat, x["url"]))
    L = [re.sub(r"\s+", " ", l).strip() for l in x["text"].split("\n") if l.strip()]
    end = next((i for i, l in enumerate(L) if re.match(r"350 mts este", l, re.I)), len(L))
    start = next((i for i, l in enumerate(L) if len(l) >= 90), 0)
    return [l for l in L[start:end] if l not in ("Anterior", "Siguiente", "Tweet", "Compartir", "f", "top", "English version", ".", "m", '"')]


def M(mid, alt, col, year=None):
    """La foto de un recuerdo, con su texto alternativo; el recuerdo queda enlazado a la colección."""
    a = dict(mem[mid]["image"])
    a["alt"] = alt
    touched[mid] = (col, year)
    return a


def make_asset(path, rel, alt):
    im = Image.open(path).convert("RGB")
    full = im.width
    widths = [w for w in (640,) if w < full * 0.9] + [full]
    os.makedirs(os.path.dirname(f"{PUB}/media/{rel}"), exist_ok=True)
    for w in widths:
        v = im if w == full else im.resize((w, round(im.height * w / full)), Image.LANCZOS)
        v.save(f"{PUB}/media/{rel}-{w}.jpg", quality=84, optimize=True, progressive=True)
        v.save(f"{PUB}/media/{rel}-{w}.webp", quality=80, method=6)
        v.save(f"{PUB}/media/{rel}-{w}.avif", quality=58)
    buf = io.BytesIO()
    im.resize((16, max(1, round(16 * im.height / im.width))), Image.LANCZOS).save(buf, "WEBP", quality=40)
    r, g, b = im.resize((1, 1), Image.BOX).getpixel((0, 0))
    a = {"src": f"/media/{rel}-{full}.jpg", "widths": widths, "width": full, "height": im.height,
         "placeholder": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(), "color": f"rgb({r} {g} {b})", "alt": alt}
    if full < 700:
        a["lowRes"] = True
    return a


def nice(s):
    s = s.strip().rstrip(".").replace("Butthan", "Bután")
    return s[0] + s[1:].lower() if s.isupper() else s


def blocks(prefix, L):
    out = []
    for i, l in enumerate(L, 1):
        num = re.match(r"(\d+)\.\s*(Plegaria.*)$", l, re.I)
        if num:  # «7.Plegaria por…», «12.PLEGARIA POR LOS GENOCIDIOS»
            l = f"{num.group(1)}. {nice(num.group(2))}"
        elif l.isupper():
            l = nice(l)
        short = bool(num) or (len(l) < 70 and not l.endswith((".", "!", ",")))
        out.append({"type": "heading", "id": f"{prefix}-{i}", "level": 2, "text": l} if short else {"type": "paragraph", "id": f"{prefix}-{i}", "text": l})
    return out


def collection(cid, title, period, order, works, **extra):
    for n, w in enumerate(works, 1):
        write(f"{C}/artworks/{w['id']}.json", {"slug": w["id"], "status": "published", "collectionId": cid, "aiAltered": False, "order": n, "createdAt": NOW, "updatedAt": NOW, **w})
    write(f"{C}/collections/{cid}.json", {"id": cid, "slug": cid, "status": "published", "createdAt": NOW, "updatedAt": NOW, "title": title, "period": period, "order": order,
                                          "artworkIds": [w["id"] for w in works], **extra})
    print(cid, len(works), "obras")


W = lambda wid, title, imgs, **kw: {"id": wid, "title": title, "images": imgs, **kw}

# ------------------------------------------------------------ Identidad (2000–2005)
col = "identidad"
names = [("2001-identidad-917f", "Identidad I"), ("2001-identidad", "Identidad II"), ("2001-geografia", "Geografía"), ("2001-han-derramado-sangre", "Han derramado sangre"),
         ("2001-infinito-espacio", "Infinito espacio"), ("2001-irak-dios-america", "Irak, Dios, América"), ("2001-naturalezaq-no-olvide", "Naturaleza, no olvide"),
         ("2001-nuestro-mundo-hoy", "Nuestro mundo hoy"), ("2001-obra-11f8", "1950, tierra tibetana"), ("2001-padre-nuestro", "Padre nuestro"), ("2001-plegaria-por-el-tibet", "Plegaria por el Tíbet"),
         ("2001-que-pasara", "¿Qué pasará?"), ("2001-tierra-de-paz", "Tierra de paz"), ("2001-viva-la-sele", "Viva la Sele"), ("2005-identidad-mundo", "Identidad mundo")]
works = [W(f"identidad-{re.sub(r'^\d+-', '', m)}", t, [M(m, f"{t} — Identidad", col)], year="2000–2005", technique="Técnica mixta sobre tela, resina", notes=SRC + " Año exacto y medidas pendientes.") for m, t in names]
collection(col, "Identidad", "2000–2005", 55, works, subtitle="Serie Identidad", technique="Técnica mixta sobre tela · resina",
           statement="Proyecto artístico «Serie Identidad», desarrollado entre 2000 y 2005 en técnica mixta sobre tela y resina.",
           cover=works[5]["images"][0], catalogUrl="/files/identidad-1-091rtdf8ceodkkzv.pdf",
           body=[{"type": "paragraph", "id": "identidad-1", "text": "La exposición individual Identidad, de pintura e instalación, se presentó en el Taller del Artista en septiembre de 2005, en la celebración de sus 18 años de carrera."},
                 {"type": "gallery", "id": "identidad-2", "images": [M("2001-poliptico-completo", "Identidad: políptico completo", col), M("2001-vista-espacio-instalado", "Identidad: vista del espacio instalado", col)]}])

# ------------------------------------------------------------ Alquimia (2008)
col = "alquimia"
pint = [("ascender-i", "Ascender I", ["2016-1ascender"]), ("ascender-ii", "Ascender II", ["2016-2ascender"]), ("con-el-corazon-en-la-mano", "Con el corazón en la mano", ["2016-mano"]),
        ("flor-de-vida", "Flor de vida", ["2016-vida"]), ("mericaba", "Mericaba", ["2016-5mericaba"]), ("transmutacion-azul", "Transmutación azul", ["2003-6transmutacion-azul"]),
        ("cumulos-cirros-y-estratos", "Cúmulos, cirros y estratos", ["2016-estratos-7040", "2016-estratos"]), ("infinito", "Infinito", ["2016-9infinito"]), ("horeb", "Horeb", ["2016-horeb"]), ("shakra", "Shakra", ["2016-shakra"])]
obj = [("epifanio", "Epifanio", ["2019-epifanio", "2019-epifanios-6ead", "2019-epifanios"]), ("pendiente", "Pendiente", ["2019-pendiente", "2019-pendiente-alquimia"]), ("renacimiento", "Renacimiento", ["2019-renacimiento", "2019-renacimiento-1953"])]
works = [W(f"alquimia-{s}", t, [M(m, f"{t}{' (detalle)' if j else ''} — Alquimia, 2008", col, 2008) for j, m in enumerate(ms)], year=2008, technique=tec, notes=SRC + " Ficha técnica pendiente (medidas).")
         for group, tec in ((pint, "Pintura"), (obj, "Arte objeto")) for s, t, ms in group]
collection(col, "Alquimia", "2008", 59, works, subtitle="Pintura y arte objeto", technique="Pintura · arte objeto",
           statement="Alquimia es la producción 2008 de Cali Rivera. Alquimia es la habilidad para convertir e intercambiar una materia por otra mediante el uso de la conciencia o conocimiento humano.",
           cover=works[2]["images"][0], catalogUrl="/files/catalogo_alquimia_2008.pdf",
           body=[{"type": "paragraph", "id": "alquimia-1", "text": "Aunque algunos alquimistas eran efectivamente farsantes, mentirosos y charlatanes, la mayoría eran investigadores inteligentes y bien intencionados, e incluso distinguidos científicos, como Isaac Newton y Robert Boyle."},
                 {"type": "paragraph", "id": "alquimia-2", "text": "La alquimia fue practicada en Mesopotamia, el Antiguo Egipto, Persia, la India y China, en la Antigua Grecia y el Imperio romano, en el Imperio islámico y después en Europa hasta el siglo XIX, en una compleja red de escuelas y sistemas filosóficos que abarca al menos 2500 años."},
                 {"type": "paragraph", "id": "alquimia-3", "text": "La exposición individual se presentó en la Galería Kandinsky, San Pedro, Costa Rica, en junio de 2008."},
                 {"type": "gallery", "id": "alquimia-4", "images": [M("2013-alquimia-taller", "Alquimia en el Taller del Artista", col, 2008)]}])

# ------------------------------------------------------------ Banderas de Corpus Christi (2010)
col = "banderas-de-corpus-christi"
t = lines(r"banderas-de-corpus-christi-2010-$")
cruz = " ".join(lines(r"/130-")[:-1]).replace(" ,", ",")
proc = " ".join(lines(r"/129-")[:-1])
gal = [M("2010-corpus", "Banderas de Corpus Christi, 2010", col), M("2010-corpus-6d4e", "Banderas de Corpus Christi, 2010", col), M("2003-transmutacion-dorso", "Bandera de Corpus Christi", col, 2010),
       M("2010-bandera-del-corpus-christi-2010", "Bandera de Corpus Christi, 2010", col), M("2010-banderas-del-corpus-christi-en-terra-mall", "Banderas de Corpus Christi en Terramall, 2012", col)]
gcruz = [M("sf-cruz", "La Cruz de San Pedro", col, 2009), M("2009-guate31a-jpg", "La Cruz de San Pedro, Guatemala, 2009", col)] + [M(m, "La Cruz de San Pedro, 2009", col, 2009) for m in ("2016-obra-43b6", "2016-obra-4954", "2016-obra-86c7")]
gtaller = [M(m, "Taller del Artista Guatemala, San Pedro La Laguna, 2009", col) for m in sorted(mem) if re.match(r"2009-(taller|cali|cristo|desk)", m) and "vistas_guate" in (mem[m].get("sourceUrl") or "")]
collection(col, "Banderas de Corpus Christi", "2009–2010", 59.5, [], subtitle="El año del aire, a orillas del lago Atitlán", technique="Ensambles de textiles y güipiles intervenidos con pintura",
           statement=t[0].split(". ")[0] + ".", cover=gal[0], catalogUrl="/files/catalogo_banderas_corpus_christi.pdf",
           body=[{"type": "paragraph", "id": "corpus-1", "text": t[0]}, {"type": "gallery", "id": "corpus-2", "images": gal},
                 {"type": "heading", "id": "corpus-3", "level": 2, "text": "La Cruz de San Pedro (2009)"}, {"type": "paragraph", "id": "corpus-4", "text": cruz}, {"type": "gallery", "id": "corpus-5", "images": gcruz},
                 {"type": "heading", "id": "corpus-6", "level": 2, "text": "Taller del Artista Guatemala: obras en proceso (2009)"}, {"type": "paragraph", "id": "corpus-7", "text": proc}, {"type": "gallery", "id": "corpus-8", "images": gtaller}])

# ------------------------------------------------------------ Sincretismo religioso (2014)
col = "sincretismo-religioso"
est = [("alegoria", "Alegoría", ["2014-alegoria-frente", "2014-alegoria-dorso"]), ("canto", "Canto", ["2014-canto-frente", "2014-canto-dorso"]), ("flor", "Flor", ["2014-flor-frente"]),
       ("padre-nuestro", "Padre nuestro", ["2014-padre-nuestro-frente", "2014-rezo-del-agua-dorso"]), ("sincretismo", "Sincretismo", ["2014-sincretismo-frente", "2014-sincretismo-dorso"]),
       ("transmutacion", "Transmutación", ["2003-transmutacion-frente"])]
works = [W(f"sincretismo-religioso-{s}", t, [M(m, f"{t} ({'dorso' if j else 'frente'}) — Sincretismo religioso, 2014", col, 2014) for j, m in enumerate(ms)], year=2014, technique="Estandarte: ensamble de textiles",
           notes=SRC + " Ficha técnica en el catálogo.") for s, t, ms in est]
collection(col, "Sincretismo religioso", "2014–2015", 62, works, subtitle="Un camino para la Paz", technique="Estandartes: ensambles de textiles intervenidos",
           statement="Después de quince años de absoluta dedicación a mi proyecto, el Taller del Artista, y a la confección de estas mantas sagradas, aún me sigo considerando un aprendiz del complejo mundo de los textiles.",
           cover=works[4]["images"][0], catalogUrl="/files/sincretismo_religioso.pdf",
           body=[{"type": "paragraph", "id": "sincretismo-0", "text": "Presentada en 2014 como CUD – Milagro en el Museo Central de Arte Textil de Łódź, Polonia, y en la Galería Nacional de Costa Rica; en 2015 volvió a Łódź como exposición individual. El estandarte «Rezo del agua» también es parte de la colección; su foto no se conserva."}]
           + blocks("sincretismo", lines(r"sincretismo-religioso-2014\.html")))

# ------------------------------------------------------------ Revelaciones (2015)
col = "revelaciones"
L = lines(r"obras/revelaciones-2015$")
ced = L.index("CÉDULAS") if "CÉDULAS" in L else len(L)
cedulas, text = L[ced + 1:], L[:ced]
KEYS = [("rohingyas", "Rohingyas", r"rohingya"), ("balticos", "Balticos", r"b[áa]ltic"), ("musulmanes", "musulmanes", r"musulman"), ("siria", "Siria", r"siria"), ("israel", "Israel", r"israel"),
        ("huicholes", "Huicholes", r"huichol"), ("butan", "Butthan", r"but+h?[áa]n"), ("turquia", "turquia", r"turqu"), ("pigmeos", "Pigmeos", r"pigme|[áa]frica"), ("grecia", "Grecia", r"grecia"),
        ("inmigrantes", "Inmigrantes", r"inmigrante"), ("genocidios", "Genocidios", r"genocidio")]
heads = [l for l in text if re.match(r"\d+\.\s?Plegaria", l, re.I)]
works = []
for slug, fname, rx in KEYS:
    title = nice(next((re.sub(r"^\d+\.\s*", "", h) for h in heads if re.search(rx, h, re.I)), f"Plegaria: {fname}"))
    f = next(f for f in os.listdir(ASSETS) if re.search(rf"(Plegaria|revelaciones)_{fname}\.jpg$", f))
    w = W(f"revelaciones-{slug}", title, [make_asset(f"{ASSETS}/{f}", f"colecciones/revelaciones/{slug}", f"{title} — Revelaciones, 2015")], year=2015, notes=SRC)
    c = next((c for c in cedulas if re.search(rx, c, re.I)), None)
    if c:
        m = re.search(r"(\d)[.,](\d+)\s*mts?\s*x\s*(\d+)\s*c", c, re.I)
        if m:
            w["dimensions"] = f"{m.group(1)},{m.group(2)} m × {m.group(3)} cm"
        tec = re.search(r"(Mixta.*)$", c)
        if tec:
            w["technique"] = tec.group(1).replace("Mixta-", "Mixta:").strip(" ./")
    works.append(w)
collection(col, "Revelaciones", "2015", 64, works, subtitle="Plegarias por los pueblos", technique="Estandartes: ensambles de textiles intervenidos con pintura",
           statement=text[1] if len(text) > 1 else "", cover=works[0]["images"][0], catalogUrl="/files/revelaciones_plegarias_por_los_pueblos.pdf",
           body=[{"type": "paragraph", "id": "revelaciones-0", "text": "Producción 2015 de Cali Rivera. Se presentó como Plegarias – Revelaciones en la galería Klaus Steinmetz Contemporary, Escazú, en julio de 2015, y en 2016 acompañó a la Orquesta Sinfónica Nacional en el Teatro Nacional de Costa Rica (Canto a la Libertad)."}]
           + blocks("revelaciones", [l for l in text if l != "Cali Rivera 2015."]))

# ------------------------------------------------------------ Proyectos: Casa Museo Ave Fénix y El agua es Oro
t = lines(r"casa-museo")
img = M("2025-obra", "Casa Museo Ave Fénix: la reconstrucción", None, 2018)
write(f"{C}/catalogs/casa-museo-ave-fenix.json", {"id": "casa-museo-ave-fenix", "slug": "casa-museo-ave-fenix", "status": "published", "createdAt": NOW, "updatedAt": NOW, "kind": "project",
                                                  "title": "Casa Museo Ave Fénix", "year": "2018–2020", "summary": "La reconstrucción de la casa museo después del incendio de 2017.", "cover": img, "order": 3,
                                                  "body": [{"type": "image", "id": "fenix-0", "image": img}] + blocks("fenix", [re.sub(r"^2018-2020 ", "", l) for l in t])})
p = f"{C}/catalogs/el-agua-es-oro.json"
d = json.load(open(p))
if not d.get("body"):
    t = [l for l in lines(r"el-agua-es-oro") if len(l) > 80]
    t[0] = "En el año 2020 mi obra gráfica El agua es oro (2013) " + t[0]
    d["body"] = blocks("oro", t)
    d["updatedAt"] = NOW
    write(p, d)

# ------------------------------------------------------------ Prayer Flags: el reverso de las banderas
p = f"{C}/collections/prayer-flags.json"
d = json.load(open(p))
if not any(b["id"] == "prayer-flags-reverso" for b in d["body"]):
    d["body"].append({"type": "heading", "id": "prayer-flags-reverso", "level": 2, "text": "El reverso de las banderas"})
    d["body"].append({"type": "paragraph", "id": "prayer-flags-reverso-0", "text": "Cuatro de las banderas llevan un texto en el reverso."})
    cites = {4: "Bandera 4 · fuente: tibet.iteso.mx", 6: "Bandera 6 · Carta de la Tierra (The Earth Charter Initiative)", 7: "Bandera 7 · Carta de la Tierra (The Earth Charter Initiative)", 9: "Bandera 9 · Carta del Santo Padre Juan Pablo II a los artistas, Vaticano, 4 de abril de 1999"}
    for n, cite in cites.items():
        t = [l for l in lines(rf"bandera{n}-reverso") if len(l) > 60 and not l.startswith(("Extracto", "Fuente"))]
        d["body"].append({"type": "quote", "id": f"prayer-flags-reverso-{n}", "text": " ".join(t).strip('" '), "cite": cite})
    d["updatedAt"] = NOW
    write(p, d)

# ------------------------------------------------------------ Memoria: enlazar
for mid, (col, year) in touched.items():
    m = mem[mid]
    if col:
        m["collectionId"] = col
    if year and m.get("year") != year:
        m["year"], m["yearApprox"] = year, False
    if mid == "2014-rezo-del-agua-dorso":
        m["title"] = m["image"]["alt"] = "Padre nuestro (dorso)"
    m["updatedAt"] = NOW
    write(f"{C}/memories/{mid}.json", m)
print("recuerdos enlazados:", len(touched))
