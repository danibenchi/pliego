"""Genera PDFs de prueba para el preflight: uno correcto, uno con errores y una cubierta."""
import io, os, random
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
import pikepdf

OUT = os.path.dirname(os.path.abspath(__file__))
pdfmetrics.registerFont(TTFont("Serif", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont("SerifB", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"))

TW, TH = 150 * mm, 225 * mm
BLEED = 3 * mm
PARRAFO = ("El taller abría temprano, cuando la calle todavía olía a papel mojado. "
           "Los pliegos esperaban sobre la mesa larga, apilados con una paciencia que "
           "solo tienen las cosas impresas. Nadie hablaba de prisa en ese lugar: cada "
           "error se pagaba con una tirada entera, y todos lo sabían. ")


def isbn13(base12):
    s = sum((1 if i % 2 == 0 else 3) * int(d) for i, d in enumerate(base12))
    return base12 + str((10 - s % 10) % 10)


def img(w, h, mode, seed=1):
    random.seed(seed)
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = (int(255 * x / w), int(120 + 100 * (y / h)), (x * y) % 255)
    if mode == "CMYK":
        im = im.convert("CMYK")
    elif mode == "L":
        im = im.convert("L")
    b = io.BytesIO()
    im.save(b, "JPEG", quality=85)
    b.seek(0)
    return ImageReader(b)


def texto(c, font, size, x, y, w, lineas, color=(0, 0, 0, 1)):
    c.setFillColorCMYK(*color)
    c.setFont(font, size)
    words = (PARRAFO * 6).split()
    line, yy, n = "", y, 0
    for wd in words:
        t = (line + " " + wd).strip()
        if c.stringWidth(t, font, size) > w:
            c.drawString(x, yy, line)
            yy -= size * 1.45
            line, n = wd, n + 1
            if n >= lineas:
                return
        else:
            line = t


def folio(c, n, ox, oy, font="Serif"):
    c.setFillColorCMYK(0, 0, 0, 1)
    c.setFont(font, 9)
    c.drawCentredString(ox + TW / 2, oy + 12 * mm, str(n))


def set_boxes(path, bleed):
    pdf = pikepdf.open(path, allow_overwriting_input=True)
    for p in pdf.pages:
        mb = [float(v) for v in p.MediaBox]
        p.TrimBox = pikepdf.Array([mb[0] + bleed, mb[1] + bleed, mb[2] - bleed, mb[3] - bleed])
        p.BleedBox = pikepdf.Array(mb)
    pdf.save(path)


# ---------- 1. Interior correcto: 16 págs, sangrado, fuentes incrustadas, todo en negro ----------
def correcto():
    path = os.path.join(OUT, "interior-correcto.pdf")
    c = canvas.Canvas(path, pagesize=(TW + 2 * BLEED, TH + 2 * BLEED))
    c.setTitle("La mesa larga")
    o = BLEED
    isbn = isbn13("978841715100")
    for n in range(1, 17):
        if n == 1:
            c.setFillColorCMYK(0, 0, 0, 1); c.setFont("SerifB", 20)
            c.drawCentredString(o + TW / 2, o + TH * 0.62, "La mesa larga")
        elif n == 4:
            c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 8)
            for i, t in enumerate(["© 2026, Ediciones de Prueba", f"ISBN: {isbn[:3]}-{isbn[3:5]}-{isbn[5:10]}-{isbn[10:12]}-{isbn[12]}",
                                   "Depósito legal: B 12345-2026", "Impreso en España"]):
                c.drawString(o + 20 * mm, o + 60 * mm - i * 11, t)
        elif n in (5, 11):
            c.setFillColorCMYK(0, 0, 0, 1); c.setFont("SerifB", 16)
            c.drawString(o + 20 * mm, o + TH - 60 * mm, "1" if n == 5 else "2")
            texto(c, "Serif", 10.5, o + 20 * mm, o + TH - 80 * mm, TW - 40 * mm, 22)
            folio(c, n, o, o)
        elif n == 8:
            c.drawImage(img(1772, 1181, "L"), o + 20 * mm, o + 100 * mm, TW - 40 * mm, (TW - 40 * mm) * 2 / 3)
            folio(c, n, o, o)
        elif n in (2, 3, 16):
            pass
        else:
            texto(c, "Serif", 10.5, o + 20 * mm, o + TH - 25 * mm, TW - 40 * mm, 34)
            folio(c, n, o, o)
        c.showPage()
    c.save()
    set_boxes(path, BLEED)


# ---------- 2. Interior con errores ----------
def con_errores():
    path = os.path.join(OUT, "interior-con-errores.pdf")
    c = canvas.Canvas(path, pagesize=(TW, TH))  # sin sangrado
    c.setTitle("Prueba con errores")
    bad_isbn = "978-84-1234-567-0"  # dígito de control inválido
    for n in range(1, 11):
        if n == 1:  # Helvetica sin incrustar
            c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Helvetica-Bold", 20)
            c.drawCentredString(TW / 2, TH * 0.62, "Prueba con errores")
        elif n == 2:
            c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 8)
            c.drawString(20 * mm, 60 * mm, "© 2026, Ediciones de Prueba")
            c.drawString(20 * mm, 60 * mm - 11, f"ISBN: {bad_isbn}")
        elif n == 3:  # texto chico en negro compuesto
            c.setFont("SerifB", 16); c.setFillColorCMYK(0, 0, 0, 1)
            c.drawString(20 * mm, TH - 50 * mm, "1")
            texto(c, "Serif", 6.5, 20 * mm, TH - 70 * mm, TW - 40 * mm, 30, color=(0.6, 0.5, 0.5, 1))
            folio(c, 3, 0, 0)
        elif n == 4:  # imagen RGB de baja resolución
            c.drawImage(img(300, 200, "RGB"), 20 * mm, 90 * mm, TW - 40 * mm, (TW - 40 * mm) * 2 / 3)
            folio(c, 4, 0, 0)
        elif n == 5:  # mancha de 400 % que toca el corte sin sangrado
            c.setFillColorCMYK(1, 1, 1, 1); c.rect(0, TH - 80 * mm, TW, 80 * mm, fill=1, stroke=0)
            c.setFillColorCMYK(0.3, 0.9, 0.9, 0.2); c.rect(0, 0, TW * 0.5, 60 * mm, fill=1, stroke=0)
            folio(c, 5, 0, 0)
        elif n == 6:  # filetes finos + folio salteado
            c.setStrokeColorCMYK(0, 0, 0, 1)
            for i, w in enumerate([0.05, 0.1, 0.5]):
                c.setLineWidth(w); c.line(20 * mm, (120 + i * 15) * mm, TW - 20 * mm, (120 + i * 15) * mm)
            folio(c, 8, 0, 0)
        elif n == 7:  # se dibuja aparte el blanco en sobreimpresión
            texto(c, "Serif", 10.5, 20 * mm, TH - 25 * mm, TW - 40 * mm, 30)
            folio(c, 9, 0, 0)
        elif n == 8:  # texto pegado al corte
            c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 10.5)
            c.drawString(1.5 * mm, TH / 2, "Esta línea está casi sobre el corte y se va a perder")
            texto(c, "Serif", 10.5, 20 * mm, TH - 25 * mm, TW - 40 * mm, 20)
            folio(c, 10, 0, 0)
        elif n == 9:  # tinta plana en un interior a una tinta
            c.setFillColorCMYK(0, 0, 0, 1)
            texto(c, "Serif", 10.5, 20 * mm, TH - 25 * mm, TW - 40 * mm, 10)
            c.setFillColorRGB(0.85, 0.1, 0.2); c.rect(20 * mm, 60 * mm, 40 * mm, 20 * mm, fill=1, stroke=0)
            folio(c, 11, 0, 0)
        c.showPage()
    c.save()

    pdf = pikepdf.open(path, allow_overwriting_input=True)
    # Página 7: blanco en sobreimpresión (desaparece en imprenta)
    p = pdf.pages[6]
    gs = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.ExtGState, OP=True, op=True, OPM=1))
    res = p.Resources
    if "/ExtGState" not in res:
        res.ExtGState = pikepdf.Dictionary()
    res.ExtGState.GSop = gs
    extra = b"q /GSop gs 0 0 0 0 k 60 300 300 40 re f BT /F1 14 Tf 0 0 0 0 k 70 315 Td (TEXTO EN BLANCO) Tj ET Q\n"
    p.contents_add(pdf.make_stream(extra), prepend=False)
    # Página 9: tinta plana (Separation PANTONE)
    p9 = pdf.pages[8]
    sep = pikepdf.Array([pikepdf.Name.Separation, pikepdf.Name("/PANTONE 185 C"), pikepdf.Name.DeviceCMYK,
                         pdf.make_indirect(pikepdf.Dictionary(FunctionType=2, Domain=[0, 1], C0=[0, 0, 0, 0], C1=[0, 0.91, 0.76, 0], N=1))])
    if "/ColorSpace" not in p9.Resources:
        p9.Resources.ColorSpace = pikepdf.Dictionary()
    p9.Resources.ColorSpace.CS185 = sep
    p9.contents_add(pdf.make_stream(b"q /CS185 cs 1 scn 80 80 120 30 re f Q\n"), prepend=False)
    pdf.save(path)


# ---------- 3. Cubierta rústica con solapas (sin perfil de salida, RGB en la foto) ----------
def cubierta():
    path = os.path.join(OUT, "cubierta-rustica.pdf")
    lomo = 14 * mm
    solapa = 80 * mm
    W = 2 * TW + lomo + 2 * solapa + 2 * BLEED
    H = TH + 2 * BLEED
    c = canvas.Canvas(path, pagesize=(W, H))
    c.setFillColorCMYK(0.9, 0.3, 0.1, 0.1); c.rect(0, 0, W, H, fill=1, stroke=0)
    x_tapa = BLEED + solapa + TW + lomo
    c.drawImage(img(900, 900, "RGB", 3), x_tapa + 15 * mm, BLEED + 70 * mm, TW - 30 * mm, TW - 30 * mm)
    c.setFillColorCMYK(0, 0, 0, 0); c.setFont("SerifB", 22)
    c.drawString(x_tapa + 15 * mm, BLEED + TH - 35 * mm, "La mesa larga")
    c.saveState(); c.translate(BLEED + solapa + TW + lomo / 2 + 3, BLEED + 20 * mm); c.rotate(90)
    c.setFont("SerifB", 10); c.drawString(0, 0, "La mesa larga · Autora de Prueba"); c.restoreState()
    c.setFillColorCMYK(0.4, 0.3, 0.3, 1); c.setFont("Serif", 7)
    c.drawString(BLEED + solapa + 15 * mm, BLEED + 20 * mm, "ISBN 978-84-17151-00-3")
    c.showPage(); c.save()
    set_boxes(path, BLEED)


if __name__ == "__main__":
    correcto(); con_errores(); cubierta()
    print("ok", isbn13("978841715100"))
