"""Prueba marcada: libro-v1 con correcciones como comentarios de Acrobat (reemplazar, tachar, insertar,
resaltar con nota y nota adhesiva), para probar «¿Se aplicaron las correcciones?» contra libro-v3-corregido."""
import os, re, subprocess, pikepdf
from html.parser import HTMLParser
OUT = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(OUT, "libro-v1.pdf")

class P(HTMLParser):
    def __init__(s): super().__init__(); s.pages = []; s.cur = None; s.w = None
    def handle_starttag(s, t, a):
        a = dict(a)
        if t == "page": s.pages.append({"h": float(a["height"]), "words": []})
        if t == "word": s.w = [float(a["xmin"]), float(a["ymin"]), float(a["xmax"]), float(a["ymax"]), ""]
    def handle_data(s, d):
        if s.w is not None: s.w[4] += d
    def handle_endtag(s, t):
        if t == "word" and s.w: s.pages[-1]["words"].append(s.w); s.w = None
p = P(); p.feed(subprocess.run(["pdftotext", "-bbox", src, "-"], capture_output=True, text=True).stdout)

def find(seq, nth=0, page=None):
    """Busca una secuencia de palabras; devuelve (página, [cajas])."""
    k = 0
    for pi, pg in enumerate(p.pages):
        if page is not None and pi != page: continue
        ws = pg["words"]
        for i in range(len(ws) - len(seq) + 1):
            if all(re.sub(r"[.,;]$", "", ws[i + j][4]) == seq[j] for j in range(len(seq))):
                if k == nth: return pi, ws[i:i + len(seq)]
                k += 1
    raise SystemExit(f"no encontré {seq}")

pdf = pikepdf.open(src)
def quad(pi, b):
    H = p.pages[pi]["h"]; x0, y0, x1, y1 = b[0], H - b[1], b[2], H - b[3]
    return [x0, y0, x1, y0, x0, y1, x1, y1]
def add(pi, d):
    pg = pdf.pages[pi]
    if "/Annots" not in pg: pg.Annots = pikepdf.Array()
    a = pdf.make_indirect(pikepdf.Dictionary(d)); pg.Annots.append(a); return a
def markup(pi, sub, boxes, contents=None, color=(1, 0, 0)):
    qp = sum((quad(pi, b) for b in boxes), [])
    xs, ys = qp[0::2], qp[1::2]
    d = {"/Type": pikepdf.Name("/Annot"), "/Subtype": pikepdf.Name(sub), "/Rect": [min(xs), min(ys), max(xs), max(ys)],
         "/QuadPoints": qp, "/C": list(color), "/T": "Correctora", "/F": 4}
    if contents is not None: d["/Contents"] = pikepdf.String(contents)
    return add(pi, d)
def caret(pi, x, b, contents):
    H = p.pages[pi]["h"]
    d = {"/Type": pikepdf.Name("/Annot"), "/Subtype": pikepdf.Name("/Caret"), "/Rect": [x - 3, H - b[3] - 2, x + 3, H - b[3] + 5],
         "/Contents": pikepdf.String(contents), "/C": [0, 0, 1], "/T": "Correctora", "/F": 4}
    return add(pi, d)
def replace(seq, new, nth=0):
    pi, ws = find(seq, nth); b = ws[-1]
    c = caret(pi, b[2], b, new)
    s = markup(pi, "/StrikeOut", [w[:4] for w in ws], new)
    s.IRT = c; s.RT = pikepdf.Name("/Group")

replace(["taler"], "taller")
replace(["inprenta"], "imprenta")
pi, ws = find(["de", "de", "otro"]); markup(pi, "/StrikeOut", [ws[1][:4]])           # tachar: «de de»
replace(["pliegoss"], "pliegos")
pi, ws = find(["Sus", "carros", "las"]); caret(pi, ws[0][2] + 1.5, ws[0], " ayer")      # insertar
pi, ws = find(["Mientras", "esperaban", "revisaba"]); markup(pi, "/StrikeOut", [ws[1][:4]])  # tachar palabra
pi, ws = find(["Carros", "hablaba"]); markup(pi, "/Highlight", [ws[0][:4]], "Los carros", (1, 1, 0))  # resaltado con reemplazo
pi, ws = find(["Revisaba", "y", "quedaba"]); markup(pi, "/Highlight", [w[:4] for w in ws], "cursiva", (1, 1, 0))
pi, ws = find(["Abría", "manos", "en"]); H = p.pages[pi]["h"]
add(pi, {"/Type": pikepdf.Name("/Annot"), "/Subtype": pikepdf.Name("/Text"), "/Rect": [ws[0][0] - 22, H - ws[0][1] - 16, ws[0][0] - 4, H - ws[0][1] + 2],
         "/Contents": pikepdf.String("¿Este párrafo no repite el anterior? Consultar con la autora."), "/T": "Correctora", "/F": 4, "/Name": pikepdf.Name("/Comment")})
pdf.save(os.path.join(OUT, "libro-v1-marcado.pdf"))
print("ok")
