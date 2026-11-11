#!/usr/bin/env python3
"""Limpia títulos de Memoria que salieron del nombre del archivo (Transmu, Page1 img, bichos2.jpg…).
Cambia `title` y, si era igual al título viejo, también `image.alt`. Un título vacío deja el número de archivo."""
import json, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "content", "memories")
MAP = {
 "Atmosfera": "Atmósfera", "vivian": "Vivian", "Musamixta": "Musa mixta", "America oficial": "América",
 "Sueaos": "Sueños en azul", "Suenos": "Sueños en azul", "Ave fenix": "Ave Fénix", "Detras": "Detrás de la ventana",
 "Oficial detras": "Detrás de la ventana", "Png": "", "Ave maria": "Ave María", "Cielos liquidos": "Cielos líquidos",
 "Geografia": "Geografía", "irak dios america": "Irak, Dios, América", "Naturalezaq no olvide": "Naturaleza, no olvide",
 "Plegaria por el tibet": "Plegaria por el Tíbet", "Poliptico completo": "Políptico completo", "Que pasara": "¿Qué pasará?",
 "Sueno cambio": "Sueño de cambio", "retiro1.jpg": "Retiro", "Transmu": "Transmutación",
 "transmutacion dorso": "Transmutación (dorso)", "transmutacion frente": "Transmutación (frente)",
 "Banderas globalizacion": "Banderas de Globalización", "BANDERAS DE GLOBALIZACIÓN EN EL CENAC": "Banderas de Globalización en el CENAC",
 "ff": "", "internacional sea turtle": "International Sea Turtle", "img_0675.jpg": "", "img_8430.jpg": "",
 "zulay_soto_2006.jpg": "Zulay Soto", "bichos2.jpg": "Bichos", "guate31a.jpg": "Guatemala",
 "BANDERA DEL CORPUS CHRISTI. 2010": "Bandera del Corpus Christi, 2010", "Plegaria Butthan": "Plegaria Bután",
 "Plegaria catalog": "Plegaria, catálogo", "Plegarias galeria klaus 16 julio": "Plegarias, Galería Klaus, 16 de julio",
 "PLEGARIA POR LA PAZ": "Plegaria por la paz", "revelaciones Grecia": "Revelaciones: Grecia", "revelaciones Pigmeos": "Revelaciones: pigmeos",
 "Ver pdf Catálogo Plegaria 2011": "Catálogo Plegaria 2011", "Cali exvotos": "Cali, Exvotos",
 "Colección: EXVOTOS 2012-Titulo: RELICARIO": "Relicario (Exvotos 2012)", "Contemporaneo exvotos": "Exvotos contemporáneos",
 "exvotos_afiche": "Exvotos, afiche", "Big bam": "Big Bang", "Performance cv": "Performance",
 "alegoria dorso": "Alegoría (dorso)", "alegoria frente": "Alegoría (frente)", "canto dorso": "Canto (dorso)", "canto frente": "Canto (frente)",
 "flor frente": "Flor (frente)", "padre nuestro frente": "Padre nuestro (frente)", "rezo del agua dorso": "Rezo del agua (dorso)",
 "sincretismo dorso": "Sincretismo (dorso)", "sincretismo frente": "Sincretismo (frente)",
 "Sincretismo Religioso-Catálogo digital": "Sincretismo religioso, catálogo digital",
 "agenda agosto 2015 web": "Agenda de agosto 2015", "Obra camino paz": "Un camino para la paz", "Obra trasnmutac": "Transmutación",
 "Obra zapatito": "Zapatito", "Revelac": "Revelaciones", "web agenda setiembre 2015": "Agenda de setiembre 2015",
 "agend set16": "Agenda de setiembre 2016", "agenda enero 2016web": "Agenda de enero 2016", "agenda EXPO DE ABRIL 3": "Agenda, expo de abril",
 "agenda febrero 2016web": "Agenda de febrero 2016", "artecontemporaneo.jpg": "Arte contemporáneo", "Azul de murano": "Azul de Murano",
 "Banderas terramall": "Banderas en Terra Mall", "Cali bebe": "Cali bebé", "Del corazon": "Del corazón",
 "Detalle del corazon": "Del corazón (detalle)", "Detalle hurto": "Hurto (detalle)", "Detalle larga vida": "Larga vida (detalle)",
 "Fot": "", "Page1 img": "", "Triptico%20nuevo": "Tríptico nuevo", "Versión 1.0 de nuestro sitio.": "Versión 1.0 de nuestro sitio",
 "Ver pdf del Libro Elementos, el manifiesto de Irazú": "Libro Elementos, el manifiesto de Irazú",
 "agenda Agosto2018 web": "Agenda de agosto 2018", "agenda Junio 2018web": "Agenda de junio 2018", "agenda mayo2018web": "Agenda de mayo 2018",
 "Ave maria cv": "Ave María", "detalle_bande2.jpg": "Bandera (detalle)", "Expo abril 16 expoabr 2 identi": "Expo de abril: Identidad",
 "madretierra.jpg": "Madre Tierra", "Madre tierra": "Madre Tierra", "Padre nuestro que estas en cielo": "Padre nuestro que estás en el cielo",
 "Angel portad": "Ángel (portada)", "Cali rivera fot": "Cali Rivera", "Ab18bfc1d51f": "",
 "Expocisión Detrás de la Ventana Museo José Figueres": "Exposición Detrás de la Ventana, Museo José Figueres",
 "Han derramado": "Han derramado sangre",
}
n = 0
for f in sorted(os.listdir(D)):
    if not f.endswith(".json"):
        continue
    p = os.path.join(D, f)
    raw = open(p, encoding="utf-8").read()
    d = json.loads(raw)
    old = d.get("title", "")
    m = re.fullmatch(r"Bandera(\d+)", old)
    new = f"Bandera {m.group(1)}" if m else MAP.get(old)
    if new is None or new == old:
        continue
    d["title"] = new
    img = d.get("image") or {}
    if img.get("alt") == old:
        img["alt"] = new or f"Memoria del taller, {d.get('year', '')}".strip(", ")
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(d, fh, ensure_ascii=False, indent=1)
        fh.write("\n" if raw.endswith("\n") else "")
    n += 1
print(n, "títulos de Memoria corregidos")
