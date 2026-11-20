"""Libro de prueba para los controles editoriales: índice, capítulos, cabeceras, folios, viudas,
huérfanas, guiones, créditos, erratas, código de barras y dos versiones para comparar."""
import os, random
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.graphics.barcode import eanbc
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF
import pikepdf

OUT = os.path.dirname(os.path.abspath(__file__))
pdfmetrics.registerFont(TTFont("Serif", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont("SerifB", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"))
TW, TH, B = 140 * mm, 210 * mm, 3 * mm
ML, MR, MT, MB = 18 * mm, 16 * mm, 20 * mm, 22 * mm
SIZE, LEAD = 10.5, 14
TITLE = "La mesa larga"
ISBN = "9788417151003"

WORDS = ("el taller abría temprano cuando la calle todavía olía a papel mojado y los pliegos esperaban sobre la mesa "
         "con una paciencia que solo tienen las cosas impresas nadie hablaba de prisa en ese lugar porque cada error se pagaba "
         "con una tirada entera y todos lo sabían el maquinista revisaba las planchas mientras el aprendiz ordenaba los tipos "
         "en sus cajas de madera la luz entraba por las ventanas altas y caía sobre las resmas como una promesa de trabajo "
         "afuera pasaban los carros del mercado y los chicos que iban a la escuela gritaban nombres de calles que ya no existen "
         "la tinta tenía un olor espeso que se quedaba en la ropa durante días y en las manos durante semanas").split()
random.seed(7)


def sentence(n=None):
    n = n or random.randint(9, 18)
    ws = []
    while len(ws) < n:
        w = random.choice(WORDS)
        if not ws or ws[-1] != w: ws.append(w)
    s = " ".join(ws)
    return s[0].upper() + s[1:] + random.choice([".", ".", ".", ";", ","]) if False else s[0].upper() + s[1:] + "."


def paragraphs(k):
    return [" ".join(sentence() for _ in range(random.randint(2, 6))) for _ in range(k)]


CHAPTERS = [("Uno", "El olor de la tinta"), ("Dos", "Los pliegos del lunes"), ("Tres", "La máquina del fondo"), ("Cuatro", "Una tirada entera")]


def layout(paras, width, c=None):
    """Compone párrafos justificados con sangría y corte silábico simple. Devuelve líneas."""
    lines = []
    for p in paras:
        words = p.split()
        first = True
        cur, curw = [], 0
        indent = 6 * mm
        i = 0
        while i < len(words):
            w = words[i]
            avail = width - (indent if first else 0)
            ww = pdfmetrics.stringWidth(w, "Serif", SIZE)
            sp = pdfmetrics.stringWidth(" ", "Serif", SIZE)
            if curw + (sp if cur else 0) + ww <= avail:
                cur.append(w); curw += (sp if cur[:-1] else 0) + ww; i += 1; continue
            # corte silábico simple
            if len(w) > 7:
                for cut in range(len(w) - 3, 2, -1):
                    part = w[:cut] + "-"
                    pw = pdfmetrics.stringWidth(part, "Serif", SIZE)
                    if curw + sp + pw <= avail:
                        cur.append(part); words[i] = w[cut:]; break
            lines.append({"words": cur, "indent": indent if first else 0, "last": False})
            first = False; cur, curw = [], 0
        lines.append({"words": cur, "indent": indent if first else 0, "last": True})
    return lines


def draw_line(c, x, y, width, ln):
    words = ln["words"]
    if not words: return
    x += ln["indent"]; width -= ln["indent"]
    c.setFont("Serif", SIZE)
    if ln["last"] or len(words) == 1:
        c.drawString(x, y, " ".join(words)); return
    tw = sum(pdfmetrics.stringWidth(w, "Serif", SIZE) for w in words)
    gap = (width - tw) / (len(words) - 1)
    for w in words:
        c.drawString(x, y, w); x += pdfmetrics.stringWidth(w, "Serif", SIZE) + gap


def build(path, version=1):
    random.seed(7)
    chapters_text = [paragraphs(30) for _ in CHAPTERS]
    # erratas a propósito
    chapters_text[0][2] = chapters_text[0][2].replace("taller", "taler", 1) + " La inprenta era de de otro siglo."
    chapters_text[1][1] = "Los pliegoss esperaban. " + chapters_text[1][1]
    if version == 3:  # la versión corregida a partir de la prueba marcada (libro-v1-marcado.pdf)
        chapters_text[0][2] = chapters_text[0][2].replace("taler", "taller", 1).replace("inprenta", "imprenta", 1)
        chapters_text[1][1] = chapters_text[1][1].replace("pliegoss", "pligos", 1)
        chapters_text[0][5] = chapters_text[0][5].replace(" ", " ayer ", 1)
        w7 = chapters_text[0][7].split(" "); del w7[1]; chapters_text[0][7] = " ".join(w7)
    if version == 2:
        chapters_text[0][3] = chapters_text[0][3].replace("tinta", "pintura", 1)
        chapters_text[1].insert(4, " ".join(sentence() for _ in range(14)))  # párrafo nuevo: corre el texto
    c = canvas.Canvas(path, pagesize=(TW + 2 * B, TH + 2 * B))
    c.setTitle(TITLE)
    o = B
    page = [0]

    def new_page():
        if page[0]: c.showPage()
        page[0] += 1

    def folio(n, roman=False):
        c.setFont("Serif", 9); c.setFillColorCMYK(0, 0, 0, 1)
        txt = {1: "i", 2: "ii", 3: "iii", 4: "iv", 5: "v", 6: "vi", 7: "vii", 8: "viii"}[n] if roman else str(n)
        c.drawCentredString(o + TW / 2, o + 12 * mm, txt)

    def head(txt):
        c.setFont("Serif", 8.5); c.drawCentredString(o + TW / 2, o + TH - 12 * mm, txt)

    # preliminares
    new_page(); c.setFont("SerifB", 22); c.drawCentredString(o + TW / 2, o + TH * 0.62, TITLE)  # 1 portada
    new_page()  # 2 blanca
    new_page(); c.setFont("SerifB", 24); c.drawCentredString(o + TW / 2, o + TH * 0.65, TITLE)  # 3 portada
    c.setFont("Serif", 12); c.drawCentredString(o + TW / 2, o + TH * 0.58, "Autora de Prueba")
    new_page(); c.setFont("Serif", 8)  # 4 créditos
    for k, t in enumerate(["Primera edición: marzo de 2026", "© 2026, Autora de Prueba", "© de esta edición: Ediciones de Prueba, 2026",
                           f"ISBN: 978-84-17151-00-3", "Depósito legal: B 12345-2026", "Impreso en España"]):
        c.drawString(o + 20 * mm, o + 60 * mm - k * 11, t)
    # índice (5) con una página mal
    new_page(); c.setFont("SerifB", 14); c.drawString(o + ML, o + TH - 40 * mm, "Índice")
    toc_pos = page[0]
    new_page()  # 6 blanca
    starts = {}
    pnum = 7
    lines_per_page = int((TH - MT - MB) / LEAD)
    for ci, (num, name) in enumerate(CHAPTERS):
        if version == 1 and ci == 2:
            pass
        # capítulos en impar (salvo el 3, a propósito, empieza en par)
        if page[0] % 2 == 1 and not (ci == 2):
            new_page(); pnum += 1  # blanca para que el capítulo caiga en impar
        new_page(); pnum = page[0]
        starts[name] = page[0]
        c.setFont("Serif", 12); c.drawString(o + ML, o + TH - 55 * mm, f"Capítulo {num}")
        c.setFont("SerifB", 20); c.drawString(o + ML, o + TH - 66 * mm, name)
        lines = layout(list(chapters_text[ci]), TW - ML - MR)
        y = o + TH - 85 * mm
        first_page = True
        for ln in lines:
            if y < o + MB:
                folio(page[0])
                new_page()
                # cabeceras: par = título del libro, impar = capítulo (una mal a propósito)
                hd = TITLE if page[0] % 2 == 0 else (CHAPTERS[0][1] if (ci == 1 and page[0] == starts[name] + 2) else name)
                head(hd)
                y = o + TH - MT - SIZE
                first_page = False
            draw_line(c, o + ML, y, TW - ML - MR, ln)
            y -= LEAD
        folio(page[0])
    c.showPage()
    c.save()
    # índice: ahora que conocemos las páginas, lo escribimos (con el capítulo 4 mal)
    pdf = pikepdf.open(path, allow_overwriting_input=True)
    pg = pdf.pages[toc_pos - 1]
    font = list(pg.Resources.Font.keys())[0] if "/Font" in pg.Resources else None
    entries = []
    for k, (num, name) in enumerate(CHAPTERS):
        p = starts[name] + (2 if k == 3 else 0)
        entries.append((f"{num}. {name}", p))
    ops = b""
    y = (TH + 2 * B) - B - 55 * mm
    for t, p in entries:
        ops += f"BT {font} 10.5 Tf {o + ML:.1f} {y:.1f} Td ({t} . . . . . . . . . {p}) Tj ET\n".encode("latin-1", "replace")
        y -= 18
    pg.contents_add(pdf.make_stream(ops), prepend=False)
    for p in pdf.pages:
        mb = [float(v) for v in p.MediaBox]
        p.TrimBox = pikepdf.Array([mb[0] + B, mb[1] + B, mb[2] - B, mb[3] - B]); p.BleedBox = pikepdf.Array(mb)
    pdf.save(path)
    return page[0]


def cover(path, pages, digits, bars_cmyk=(0, 0, 0, 1), scale=1.0, title=TITLE):
    spine = (pages / 2) * 0.12 * mm
    flap = 70 * mm
    W, H = 2 * TW + spine + 2 * flap + 2 * B, TH + 2 * B
    c = canvas.Canvas(path, pagesize=(W, H))
    c.setFillColorCMYK(0.05, 0.1, 0.3, 0); c.rect(0, 0, W, H, fill=1, stroke=0)
    xb = B + flap; xf = B + flap + TW + spine
    c.setFillColorCMYK(0, 0, 0, 1); c.setFont("SerifB", 24); c.drawString(xf + 15 * mm, B + TH - 40 * mm, title)
    c.setFont("Serif", 12); c.drawString(xf + 15 * mm, B + TH - 50 * mm, "Autora de Prueba")
    # código de barras en la contratapa, sobre recuadro blanco
    c.setFillColorCMYK(0, 0, 0, 0); c.rect(xb + 15 * mm, B + 15 * mm, 45 * mm, 32 * mm, fill=1, stroke=0)
    w = eanbc.Ean13BarcodeWidget(digits[:12])
    from reportlab.lib.colors import CMYKColor
    w.barFillColor = CMYKColor(*bars_cmyk); w.textColor = CMYKColor(*bars_cmyk)
    bnd = w.getBounds(); d = Drawing(bnd[2] - bnd[0], bnd[3] - bnd[1]); d.add(w)
    d.scale(scale, scale)
    renderPDF.draw(d, c, xb + 18 * mm, B + 18 * mm)
    c.setFont("Serif", 7); c.drawString(xb + 18 * mm, B + 46 * mm, f"ISBN 978-84-17151-00-3")
    c.showPage(); c.save()
    pdf = pikepdf.open(path, allow_overwriting_input=True)
    for p in pdf.pages:
        mb = [float(v) for v in p.MediaBox]
        p.TrimBox = pikepdf.Array([mb[0] + B, mb[1] + B, mb[2] - B, mb[3] - B]); p.BleedBox = pikepdf.Array(mb)
    pdf.save(path)
    return spine / mm


if __name__ == "__main__":
    n1 = build(os.path.join(OUT, "libro-v1.pdf"), 1)
    n2 = build(os.path.join(OUT, "libro-v2.pdf"), 2)
    build(os.path.join(OUT, "libro-v3-corregido.pdf"), 3)
    s = cover(os.path.join(OUT, "libro-cubierta.pdf"), n1, ISBN)
    cover(os.path.join(OUT, "libro-cubierta-mal.pdf"), n1, "9788412345672", bars_cmyk=(0, 1, 1, 0), scale=0.7, title="La mesa ancha")
    print("páginas", n1, n2, "lomo", round(s, 1))
