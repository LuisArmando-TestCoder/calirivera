#!/usr/bin/env python3
"""
Firma de Cali (assets/_site/logo.png) → SVG.
 - contorno exacto (lo que se ve): cv2.findContours sobre el alfa, a resolución completa
 - trazos (el camino de la pluma): esqueleto de la firma, unido en trazos continuos y ordenado como se escribe.
   Sirven de máscara: al animarlos, la firma exacta aparece como si se estuviera firmando.
Salida: web/src/components/brand/signature-data.ts  (+ legacy/_firma_debug.png para revisar el orden)
"""
import json, math, os, sys
import cv2, numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
im = Image.open(os.path.join(ROOT, "assets/_site/logo.png")).convert("RGBA")
alpha = np.array(im)[..., 3]
x0, y0, x1, y1 = im.getbbox()
pad = 30
x0, y0, x1, y1 = x0 - pad, y0 - pad, x1 + pad, y1 + pad
alpha = alpha[y0:y1, x0:x1]
H, W = alpha.shape
mask = (alpha > 127).astype(np.uint8)

# ---------- contorno exacto ----------
cs, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
def smooth(c, k=7):
    p = c[:, 0, :].astype(np.float64)
    ker = np.ones(k) / k
    px = np.convolve(np.r_[p[-k:, 0], p[:, 0], p[:k, 0]], ker, "same")[k:-k]
    py = np.convolve(np.r_[p[-k:, 1], p[:, 1], p[:k, 1]], ker, "same")[k:-k]
    return np.stack([px, py], 1)
outline = []
for c in cs:
    if cv2.contourArea(c) < 30: continue
    p = smooth(c)
    a = cv2.approxPolyDP(p.astype(np.float32).reshape(-1, 1, 2), 0.9, True)[:, 0, :]
    outline.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in a) + "Z")
OUTLINE = "".join(outline)

# ---------- esqueleto (Zhang–Suen) a 1/3 ----------
S = 3
small = cv2.resize(mask * 255, (W // S, H // S), interpolation=cv2.INTER_AREA) > 100
img = small.astype(np.uint8)
def thin(img):
    img = img.copy()
    while True:
        changed = False
        for step in (0, 1):
            P = np.pad(img, 1)
            p2, p3, p4, p5, p6, p7, p8, p9 = P[:-2,1:-1], P[:-2,2:], P[1:-1,2:], P[2:,2:], P[2:,1:-1], P[2:,:-2], P[1:-1,:-2], P[:-2,:-2]
            B = p2+p3+p4+p5+p6+p7+p8+p9
            seq = [p2,p3,p4,p5,p6,p7,p8,p9,p2]
            A = sum(((seq[i] == 0) & (seq[i+1] == 1)).astype(np.uint8) for i in range(8))
            if step == 0: c = (p2*p4*p6 == 0) & (p4*p6*p8 == 0)
            else: c = (p2*p4*p8 == 0) & (p2*p6*p8 == 0)
            rm = (img == 1) & (B >= 2) & (B <= 6) & (A == 1) & c
            if rm.any(): img[rm] = 0; changed = True
        if not changed: return img
import time; _t=time.time(); sk = thin(img); print('thin', round(time.time()-_t,1), 's', int(sk.sum()), 'px', flush=True)
pts = set(map(tuple, np.argwhere(sk == 1)))
N8 = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]
def nb(p):
    # vecinos en cruz siempre; en diagonal solo si no se llega por un vecino en cruz (evita falsos cruces en escalera)
    out = []
    for dy, dx in N8:
        q = (p[0]+dy, p[1]+dx)
        if q not in pts: continue
        if dy and dx and ((p[0]+dy, p[1]) in pts or (p[0], p[1]+dx) in pts): continue
        out.append(q)
    return out
deg = {p: len(nb(p)) for p in pts}
nodes = {p for p in pts if deg[p] != 2}
# cadenas entre nodos
seen = set(); chains = []
for n in nodes:
    for q in nb(n):
        if (n, q) in seen: continue
        chain = [n, q]; seen.add((n, q)); inchain = {n, q}
        prev, cur = n, q
        while cur not in nodes:
            nx = [r for r in nb(cur) if r not in inchain]
            if not nx: break
            prev, cur = cur, nx[0]; chain.append(cur); inchain.add(cur)
        seen.add((chain[-1], chain[-2]))
        chains.append(chain)
# lazos sin nodos (el punto de la i)
used = {p for c in chains for p in c}
for p in pts - used:
    if p in used: continue
    loop = [p]; used.add(p); cur = p
    while True:
        nx = [r for r in nb(cur) if r not in used]
        if not nx: break
        cur = nx[0]; loop.append(cur); used.add(cur)
    if len(loop) > 5: chains.append(loop + [loop[0]])
chains = [c for c in chains if len(c) >= 2]; print('cadenas', len(chains), 'nodos', len(nodes), flush=True)
# unir cadenas que siguen derecho a través de un cruce
def direction(c, at_end):
    k = min(8, len(c) - 1)
    a, b = (c[-1 - k], c[-1]) if at_end else (c[k], c[0])
    v = np.array([b[0]-a[0], b[1]-a[1]], float); n = np.linalg.norm(v)
    return v / n if n else v
def near(a, b): return abs(a[0]-b[0]) <= 4 and abs(a[1]-b[1]) <= 4
chains = [c for c in chains if len(c) > 6 or (c[0] in nodes and c[-1] in nodes)]
merged = True
while merged:
    merged = False
    best = None
    for i, a in enumerate(chains):
        for j, b in enumerate(chains):
            if i >= j: continue
            for ae in (True, False):
                for be in (True, False):
                    pa = a[-1] if ae else a[0]; pb = b[-1] if be else b[0]
                    if not near(pa, pb): continue
                    d = float(np.dot(direction(a, ae), -direction(b, be)))
                    if d > 0.82 and (best is None or d > best[0]): best = (d, i, j, ae, be)
    if best:
        _, i, j, ae, be = best
        a = chains[i] if ae else chains[i][::-1]
        b = chains[j][::-1] if be else chains[j]
        chains = [c for k, c in enumerate(chains) if k not in (i, j)] + [a + b]
        merged = True
strokes = [c for c in chains if len(c) >= 10]
def to_xy(c): return [(p[1] * S + S / 2, p[0] * S + S / 2) for p in c]
strokes = [to_xy(c) for c in strokes]

ORDER = json.loads(os.environ.get("ORDER", "null"))  # [[indice, invertir], …] tras mirar el debug
if ORDER:
    strokes = [strokes[i][::-1] if rev else strokes[i] for i, rev in ORDER]
def path(c):
    a = cv2.approxPolyDP(np.array(c, np.float32).reshape(-1, 1, 2), 1.2, False)[:, 0, :]
    return "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in a)
def length(c): return sum(math.dist(c[i], c[i+1]) for i in range(len(c) - 1))
dist = cv2.distanceTransform(mask, cv2.DIST_L2, 5)
width = float(np.median([dist[min(H-1, int(y)), min(W-1, int(x))] for c in strokes for x, y in c])) * 2

dbg = cv2.cvtColor(mask * 60, cv2.COLOR_GRAY2BGR)
rng = np.random.default_rng(3)
for i, c in enumerate(strokes):
    col = tuple(int(v) for v in rng.integers(90, 255, 3))
    cv2.polylines(dbg, [np.array(c, np.int32)], False, col, 5)
    cv2.circle(dbg, (int(c[0][0]), int(c[0][1])), 14, (255, 255, 255), -1)
    cv2.putText(dbg, str(i), (int(c[0][0]) + 16, int(c[0][1]) - 10), cv2.FONT_HERSHEY_SIMPLEX, 1.6, col, 4)
cv2.imwrite(os.path.join(ROOT, "legacy/_firma_debug.png"), cv2.resize(dbg, (W // 2, H // 2)))
print("trazos:", len(strokes), "ancho:", round(width, 1), "lienzo:", W, H, "contorno:", len(OUTLINE), "bytes")
for i, c in enumerate(strokes): print(i, round(length(c)), [round(v) for v in c[0]], "→", [round(v) for v in c[-1]])

if ORDER:
    out = os.path.join(ROOT, "web/src/components/brand/signature-data.ts")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    data = [{"d": path(c), "len": round(length(c))} for c in strokes]
    open(out, "w").write(
        "// Generado por tools/logo-trace.py a partir de la firma de Cali (assets/_site/logo.png). No editar a mano.\n"
        f"export const SIG_W = {W};\nexport const SIG_H = {H};\n"
        f"/** grosor de la pluma en unidades del lienzo */\nexport const SIG_PEN = {width:.1f};\n"
        f"/** contorno exacto de la firma (relleno, evenodd) */\nexport const SIG_OUTLINE =\n  {json.dumps(OUTLINE)};\n"
        f"/** trazos en el orden en que se firma: máscara que revela el contorno */\nexport const SIG_STROKES: {{ d: string; len: number }}[] = {json.dumps(data)};\n")
    print("escrito", out, os.path.getsize(out))
