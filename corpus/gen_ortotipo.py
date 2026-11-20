"""Libro de prueba para ortotipografía, composición y aparato: diálogos con guion, comillas rectas y
mezcladas, signos de apertura que faltan, espacios mal puestos, marcas de trabajo, notas al pie con
saltos y sin llamada, referencias cruzadas imposibles, figuras mal numeradas, líneas abiertas y una
página corta."""
import os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_libro as g
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(11)
TW, TH, B, ML, MR, MT, MB, SIZE, LEAD = g.TW, g.TH, g.B, g.ML, g.MR, g.MT, g.MB, g.SIZE, g.LEAD
paras = g.paragraphs(60)
# errores a propósito, repartidos en el texto
paras[1] = "- Ya voy, dijo el maquinista. " + paras[1]
paras[2] = "— Esperá un momento, que falta la plancha. " + paras[2]
paras[3] = paras[3] + ' El aprendiz dijo "otra vez" y siguió con los tipos.'
paras[4] = paras[4] + " Quién había dejado la puerta abierta? Nadie contestó."
paras[5] = paras[5] + " La tinta , espesa y negra , caía sobre el papel.Nadie miraba."
paras[6] = paras[6] + " Como se ve en la pág. 00, el taller era antiguo."
paras[7] = paras[7] + " ¡Error! Marcador no definido. Seguía la tirada."
paras[8] = paras[8] + " Véase la página 245 para el detalle del inventario."
paras[9] = "Los cajistas^1 trabajaban de pie^2 toda la tarde. " + paras[9]
paras[16] = "El regente^4 anotaba las tiradas. " + paras[16]
paras[10] = paras[10] + " Lo explica la figura 5 con detalle. «Las prensas eran “viejas” y ruidosas»."
paras[11] = paras[11] + " Dijo: “nadie lo sabía” y se fue.. Volvió más tarde...."
NOTES = {9: ["1 Los cajistas componían el texto letra por letra.", "2 Las jornadas eran de diez horas."], 16: ["4 El regente era el jefe del taller."], 22: ["5 Nota sin llamada en el texto de la página."]}
FIG = {9: "Figura 1. La prensa del fondo", 11: "Figura 3. Un pliego recién impreso"}

c = canvas.Canvas(os.path.join(OUT, "libro-ortotipografia.pdf"), pagesize=(TW + 2 * B, TH + 2 * B))
o = B
def word(c, x, y, w, size=SIZE):
    if "^" in w:
        base, sup = w.split("^")
        c.setFont("Serif", size); c.drawString(x, y, base); x2 = x + pdfmetrics.stringWidth(base, "Serif", size)
        c.setFont("Serif", size * 0.6); c.drawString(x2, y + size * 0.35, sup); c.setFont("Serif", size)
    else: c.drawString(x, y, w)
def draw(c, x, y, width, ln):
    ws = ln["words"]
    if not ws: return
    x += ln["indent"]; width -= ln["indent"]; c.setFont("Serif", SIZE)
    wid = lambda w: pdfmetrics.stringWidth(w.replace("^", ""), "Serif", SIZE)
    if ln["last"] or len(ws) == 1:
        for w in ws: word(c, x, y, w); x += wid(w) + pdfmetrics.stringWidth(" ", "Serif", SIZE)
        return
    gap = (width - sum(wid(w) for w in ws)) / (len(ws) - 1)
    for w in ws: word(c, x, y, w); x += wid(w) + gap
lines = g.layout(list(paras), TW - ML - MR)
lines[150]["words"] = lines[150]["words"][:4]   # línea muy abierta
lines[151]["words"] = lines[151]["words"][:4]
page = 1; y = o + TH - MT - SIZE; para_idx = 0
note_for_page, fig_for_page = {}, {}
c.setFont("Serif", 12); c.drawString(o + ML, o + TH - 55 * mm, "Capítulo Uno"); c.setFont("SerifB", 20); c.drawString(o + ML, o + TH - 66 * mm, "El taller"); y = o + TH - 85 * mm
pi = 0
def footer():
    c.setFont("Serif", 9); c.drawCentredString(o + TW / 2, o + 12 * mm, str(page))
bottom_for = lambda pg: o + MB + (3 * LEAD if pg == 8 else 0) + (len(note_for_page[pg]) * 10 + 6 if pg in note_for_page else 0)
for k, ln in enumerate(lines):
    if ln["indent"]: pi += 1
    if y < bottom_for(page):
        for j, nt in enumerate(note_for_page.get(page, [])):
            c.setFont("Serif", 8); c.drawString(o + ML, o + MB + (len(note_for_page[page]) - 1 - j) * 10, nt)
        footer(); c.showPage(); page += 1; y = o + TH - MT - SIZE
        if page in FIG:
            c.setFont("Serif", 8.5); c.drawString(o + ML, o + TH - MT - 2, FIG[page]); y -= 2 * LEAD
    if pi - 1 in NOTES and pi not in [x for v in note_for_page.values() for x in v]:
        note_for_page.setdefault(page, []); [note_for_page[page].append(n) for n in NOTES.pop(pi - 1)]
    draw(c, o + ML, y, TW - ML - MR, ln); y -= LEAD
footer(); c.showPage(); c.save()
print("páginas", page)
