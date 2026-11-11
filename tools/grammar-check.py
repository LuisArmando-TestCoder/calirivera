#!/usr/bin/env python3
"""
Revisión ortográfica y gramatical del contenido que se ve en el sitio (content/<colección>/*.json).
LanguageTool (api.languagetool.org, español) es solo el primer filtro: produce legacy/content/grammar-report.json
con cada posible error y su ruta JSON exacta. Las correcciones se revisan a mano (tools/grammar-fixes.json)
y se aplican con --apply, reemplazando el texto exacto en su lugar (sin reescribir: solo ortografía y gramática).
Uso: python3 tools/grammar-check.py            # revisar
     python3 tools/grammar-check.py --apply    # aplicar tools/grammar-fixes.json
"""
import json, os, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = os.path.join(ROOT, "content")
GROUPS = ["pages", "collections", "artworks", "catalogs", "programs", "people", "posts", "press", "memories"]
KEYS = {"text", "title", "subtitle", "statement", "caption", "excerpt", "summary", "detail", "label", "note", "description",
        "bio", "alt", "cite", "achievement", "supportGiven", "technique", "tagline", "name", "place"}
SKIP_RULES = {"WHITESPACE_RULE", "UPPERCASE_SENTENCE_START", "COMMA_PARENTHESIS_WHITESPACE", "ES_UNPAIRED_BRACKETS",
              "UNPAIRED_BRACKETS", "DOUBLE_PUNCTUATION", "ES_QUESTION_MARK", "PUNTO_EN_ABREVIATURAS"}


def strings():
    out = []
    def walk(o, path, f):
        if isinstance(o, dict):
            for k, v in o.items():
                p = f"{path}.{k}" if path else k
                if k in KEYS and isinstance(v, str) and len(v) > 3 and not v.startswith(("http", "/", "data:")):
                    out.append((f, p, v))
                elif k == "lines" and isinstance(v, list):
                    for i, x in enumerate(v):
                        if isinstance(x, str) and len(x) > 3:
                            out.append((f, f"{p}[{i}]", x))
                else:
                    walk(v, p, f)
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, f"{path}[{i}]", f)
    for g in GROUPS:
        d = os.path.join(C, g)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".json"):
                f = f"{g}/{fn}"
                walk(json.load(open(os.path.join(d, fn))), "", f)
    return out


def check(text):
    data = urllib.parse.urlencode({"text": text, "language": "es", "level": "default"}).encode()
    for i in range(5):
        try:
            with urllib.request.urlopen("https://api.languagetool.org/v2/check", data, timeout=90) as r:
                return json.load(r)["matches"]
        except Exception as e:
            time.sleep(6 * (i + 1))
    raise SystemExit("LanguageTool no respondió")


def review():
    items = strings()
    report, batch, size = [], [], 0
    def flush():
        nonlocal batch, size
        if not batch:
            return
        joined, spans, pos = "", [], 0
        for it in batch:
            spans.append((pos, pos + len(it[2]), it))
            joined += it[2] + "\n\n"
            pos = len(joined)
        for m in check(joined):
            if m["rule"]["id"] in SKIP_RULES:
                continue
            o = m["offset"]
            for a, b, it in spans:
                if a <= o < b:
                    s = it[2]
                    oo = o - a
                    report.append({
                        "file": it[0], "path": it[1], "rule": m["rule"]["id"], "cat": m["rule"]["category"]["id"],
                        "bad": s[oo:oo + m["length"]], "ctx": s[max(0, oo - 50):oo + m["length"] + 50],
                        "sug": [r["value"] for r in m["replacements"][:4]], "msg": m["message"],
                    })
                    break
        batch, size = [], 0
        time.sleep(3.2)  # límite de la API pública
    for it in items:
        if size + len(it[2]) > 15000:
            flush()
        batch.append(it)
        size += len(it[2]) + 2
    flush()
    json.dump(report, open(os.path.join(ROOT, "legacy/content/grammar-report.json"), "w"), ensure_ascii=False, indent=1)
    print(len(items), "textos,", len(report), "posibles errores")


def apply(dry=False):
    """tools/grammar-fixes.json: [{"file": "pages/x.json" | "*", "find": "...", "replace": "...", "word": true}]
    Solo toca textos visibles (KEYS y versos), nunca slugs, ids, rutas ni enlaces.
    word=true (por defecto) exige límite de palabra a ambos lados; la mayúscula importa."""
    import re
    fixes = json.load(open(os.path.join(ROOT, "tools/grammar-fixes.json")))
    for fx in fixes:
        pat = re.escape(fx["find"])
        if fx.get("word", True):
            pat = r"(?<![\w])" + pat + r"(?![\w])"
        fx["_re"] = re.compile(pat)
        fx["_n"] = 0
    files = sorted({f for _, _, f in [(0, 0, s[0]) for s in strings()]})
    done = 0
    for f in files:
        fl = [fx for fx in fixes if fx["file"] in ("*", f)]
        if not fl:
            continue
        p = os.path.join(C, f)
        raw = open(p, encoding="utf-8").read()
        d = json.loads(raw)
        changed = False
        def fix(v):
            nonlocal done, changed
            nv = v
            for fx in fl:
                nv, n = fx["_re"].subn(fx["replace"], nv)
                fx["_n"] += n
            if nv != v:
                done += 1
                changed = True
            return nv
        def walk(o):
            if isinstance(o, dict):
                for k, v in o.items():
                    if k in KEYS and isinstance(v, str) and not v.startswith(("http", "/", "data:")):
                        o[k] = fix(v)
                    elif k == "lines" and isinstance(v, list):
                        o[k] = [fix(x) if isinstance(x, str) else x for x in v]
                    else:
                        walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(d)
        if changed and not dry:
            with open(p, "w", encoding="utf-8") as fh:
                json.dump(d, fh, ensure_ascii=False, indent=1)
                fh.write("\n" if raw.endswith("\n") else "")
    for fx in fixes:
        if not fx["_n"]:
            print("sin coincidencia:", fx["file"], "|", fx["find"])
        elif dry:
            print(f'{fx["_n"]:4d}  {fx["find"]} → {fx["replace"]}')
    print(done, "textos", "a corregir" if dry else "corregidos")


if __name__ == "__main__":
    apply("--dry" in sys.argv) if "--apply" in sys.argv else review()
