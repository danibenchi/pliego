"""PDFs de prueba para los diez controles técnicos nuevos."""
import io, os, zlib
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from fontTools.ttLib import TTFont as FTFont
from fontTools.pens.basePen import BasePen


class CanvasPen(BasePen):
    def __init__(self, gs, path):
        super().__init__(gs); self.p = path; self.cur = (0, 0)
    def _moveTo(self, pt): self.p.moveTo(*pt); self.cur = pt
    def _lineTo(self, pt): self.p.lineTo(*pt); self.cur = pt
    def _curveToOne(self, a, b, c): self.p.curveTo(*a, *b, *c); self.cur = c
    def _qCurveToOne(self, q, e):
        s0 = self.cur
        c1 = (s0[0] + 2 / 3 * (q[0] - s0[0]), s0[1] + 2 / 3 * (q[1] - s0[1]))
        c2 = (e[0] + 2 / 3 * (q[0] - e[0]), e[1] + 2 / 3 * (q[1] - e[1]))
        self.p.curveTo(*c1, *c2, *e); self.cur = e
    def _closePath(self): self.p.close()
import pikepdf

OUT = os.path.dirname(os.path.abspath(__file__))
SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
pdfmetrics.registerFont(TTFont("Serif", SERIF))
TW, TH, B = 150 * mm, 225 * mm, 3 * mm
ICC = open("/usr/share/texlive/texmf-dist/tex/generic/colorprofiles/FOGRA39L_coated.icc", "rb").read()


def jpeg(w, h, q, mode="CMYK"):
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = ((x * 7) % 255, (y * 5) % 255, ((x + y) * 3) % 255)
    im = im.convert(mode)
    b = io.BytesIO(); im.save(b, "JPEG", quality=q); b.seek(0)
    return ImageReader(b)


def outlined_text(c, text, x, y, size):
    """Dibuja texto como trazados (contornos) a partir de los glifos de la fuente."""
    ft = FTFont(SERIF); gs = ft.getGlyphSet(); cmap = ft.getBestCmap(); upm = ft["head"].unitsPerEm
    s = size / upm
    for ch in text:
        g = cmap.get(ord(ch))
        if not g:
            continue
        if ch != " ":
            c.saveState(); c.translate(x, y); c.scale(s, s)
            path = c.beginPath(); gs[g].draw(CanvasPen(gs, path))
            c.drawPath(path, stroke=0, fill=1)
            c.restoreState()
        x += gs[g].width * s


def casos():
    path = os.path.join(OUT, "casos-tecnicos-color.pdf")
    c = canvas.Canvas(path, pagesize=(TW + 2 * B, TH + 2 * B))
    o = B
    # pág. 1: texto de color en sobreimpresión (se marca en pikepdf) + negro chico calado sobre cian
    c.setFillColorCMYK(1, 0, 0, 0); c.rect(o + 20 * mm, o + 120 * mm, TW - 40 * mm, 60 * mm, fill=1, stroke=0)
    c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 8); c.drawString(o + 25 * mm, o + 150 * mm, "Texto negro de 8 pt que perfora el fondo cian")
    c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 10); c.drawCentredString(o + TW / 2, o + 12 * mm, "1")
    c.showPage()
    # pág. 2: texto blanco chico sobre fondo de cuatro tintas
    c.setFillColorCMYK(0.6, 0.6, 0.6, 0.3); c.rect(o + 20 * mm, o + 100 * mm, TW - 40 * mm, 50 * mm, fill=1, stroke=0)
    c.setFillColorCMYK(0, 0, 0, 0); c.setFont("Serif", 6); c.drawString(o + 25 * mm, o + 125 * mm, "Texto calado de 6 pt sobre un fondo de cuatro tintas")
    c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 10); c.drawCentredString(o + TW / 2, o + 12 * mm, "2")
    c.showPage()
    # pág. 3: imagen JPEG muy comprimida (CMYK, buena resolución)
    c.drawImage(jpeg(1300, 870, 18), o + 20 * mm, o + 100 * mm, 110 * mm, 73.6 * mm)
    c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 10); c.drawCentredString(o + TW / 2, o + 12 * mm, "3")
    c.showPage()
    # pág. 4: texto en contornos
    c.setFillColorCMYK(0, 0, 0, 1)
    outlined_text(c, "Este titulo esta convertido a contornos", o + 18 * mm, o + 160 * mm, 13)
    outlined_text(c, "y esta segunda linea tambien", o + 18 * mm, o + 150 * mm, 13)
    c.setFont("Serif", 10); c.drawCentredString(o + TW / 2, o + 12 * mm, "4")
    c.showPage()
    # pág. 5: tintas planas duplicadas, troquel y barniz, degradado RGB (se agregan en pikepdf)
    c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 10); c.drawCentredString(o + TW / 2, o + 12 * mm, "5")
    c.showPage()
    # pág. 6: rotada 180°, con marcas de corte dentro del sangrado
    c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 10); c.drawString(o + 20 * mm, o + TH - 30 * mm, "Página rotada 180 grados")
    c.setStrokeColorCMYK(1, 1, 1, 1); c.setLineWidth(0.3)
    for (x, y, dx, dy) in [(o, o, -1, -1), (o + TW, o, 1, -1), (o, o + TH, -1, 1), (o + TW, o + TH, 1, 1)]:
        c.line(x + dx * 0.8 * mm, y, x + dx * 3 * mm, y)
        c.line(x, y + dy * 0.8 * mm, x, y + dy * 3 * mm)
    c.drawCentredString(o + TW / 2, o + 12 * mm, "6")
    c.showPage()
    # pág. 7: imagen de 1 bit de baja resolución y 16 bits (se agregan en pikepdf)
    c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 10); c.drawCentredString(o + TW / 2, o + 12 * mm, "7")
    c.showPage()
    # pág. 8: zona de 340 % pequeña (3 × 3 mm, no debería marcarse) y otra grande
    c.setFillColorCMYK(0.85, 0.85, 0.85, 0.85); c.rect(o + 30 * mm, o + 150 * mm, 1.5 * mm, 1.5 * mm, fill=1, stroke=0)
    c.rect(o + 30 * mm, o + 60 * mm, 40 * mm, 30 * mm, fill=1, stroke=0)
    c.setFillColorCMYK(0, 0, 0, 1); c.setFont("Serif", 10); c.drawCentredString(o + TW / 2, o + 12 * mm, "8")
    c.showPage()
    c.save()

    pdf = pikepdf.open(path, allow_overwriting_input=True)
    for p in pdf.pages:
        mb = [float(v) for v in p.MediaBox]
        p.TrimBox = pikepdf.Array([mb[0] + B, mb[1] + B, mb[2] - B, mb[3] - B]); p.BleedBox = pikepdf.Array(mb)
    def res(p, key):
        if key not in p.Resources: p.Resources[key] = pikepdf.Dictionary()
        return p.Resources[key]
    gsop = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.ExtGState, OP=True, op=True, OPM=1))
    # 1: texto magenta en sobreimpresión
    p1 = pdf.pages[0]; res(p1, "/ExtGState").GSop = gsop
    f1 = list(p1.Resources.Font.keys())[0]
    p1.contents_add(pdf.make_stream(f"q /GSop gs 0 1 0 0 k BT {f1} 12 Tf 80 330 Td (MAGENTA EN SOBREIMPRESION) Tj ET Q\n".encode()), prepend=False)
    # 5: tintas planas
    p5 = pdf.pages[4]
    def sep(name, cmyk):
        return pikepdf.Array([pikepdf.Name.Separation, pikepdf.Name("/" + name), pikepdf.Name.DeviceCMYK,
                              pdf.make_indirect(pikepdf.Dictionary(FunctionType=2, Domain=[0, 1], C0=[0, 0, 0, 0], C1=cmyk, N=1))])
    cs = res(p5, "/ColorSpace")
    cs.CSa = sep("PANTONE 185 C", [0, 0.91, 0.76, 0]); cs.CSb = sep("PANTONE 185 CV", [0, 0.91, 0.76, 0])
    cs.TRQ = sep("Troquel", [0, 1, 0, 0]); cs.BAR = sep("Barniz UV", [0, 0, 0, 0.2])
    res(p5, "/ExtGState").GSop = gsop
    sh = pdf.make_indirect(pikepdf.Dictionary(ShadingType=2, ColorSpace=pikepdf.Name.DeviceRGB, Coords=[60, 200, 360, 200],
        Function=pdf.make_indirect(pikepdf.Dictionary(FunctionType=2, Domain=[0, 1], C0=[0.1, 0.2, 0.9], C1=[0.95, 0.3, 0.1], N=1)), Extend=[True, True]))
    res(p5, "/Shading").SHrgb = sh
    p5.contents_add(pdf.make_stream(
        b"q /CSa cs 1 scn 60 500 100 40 re f /CSb cs 1 scn 200 500 100 40 re f Q\n"
        b"q /TRQ CS 1 SCN 0.5 w 50 420 320 50 re S Q\n"
        b"q /GSop gs /BAR cs 1 scn 60 300 200 60 re f Q\n"
        b"q 60 180 300 80 re W n /SHrgb sh Q\n"), prepend=False)
    # 6: rotada
    pdf.pages[5].Rotate = 180
    # 7: imagen 1 bit sin máscara (baja resolución) e imagen de 16 bits
    w1, h1 = 120, 80
    bits = bytes((0xAA if (y // 4) % 2 else 0x55) for y in range(h1) for _ in range((w1 + 7) // 8))
    im1 = pdf.make_stream(zlib.compress(bits), Type=pikepdf.Name.XObject, Subtype=pikepdf.Name.Image, Width=w1, Height=h1,
                          ColorSpace=pikepdf.Name.DeviceGray, BitsPerComponent=1, Filter=pikepdf.Name.FlateDecode)
    w2, h2 = 1200, 800
    raw16 = bytearray()
    for y in range(h2):
        for x in range(w2):
            v = (x * 54) & 0xFFFF
            raw16 += bytes([v >> 8, v & 255, (y * 80) >> 8 & 255, 0, 40, 0, 0, 0])
    im2 = pdf.make_stream(zlib.compress(bytes(raw16)), Type=pikepdf.Name.XObject, Subtype=pikepdf.Name.Image, Width=w2, Height=h2,
                          ColorSpace=pikepdf.Name.DeviceCMYK, BitsPerComponent=16, Filter=pikepdf.Name.FlateDecode)
    p7 = pdf.pages[6]; xo = res(p7, "/XObject"); xo.Im1 = im1; xo.Im16 = im2
    p7.contents_add(pdf.make_stream(b"q 200 0 0 133 60 450 cm /Im1 Do Q q 288 0 0 192 60 200 cm /Im16 Do Q\n"), prepend=False)
    # capa oculta
    ocg = pdf.make_indirect(pikepdf.Dictionary(Type=pikepdf.Name.OCG, Name="Notas internas"))
    pdf.Root.OCProperties = pikepdf.Dictionary(OCGs=[ocg], D=pikepdf.Dictionary(OFF=[ocg], Order=[ocg]))
    pdf.save(path)


def pdfx(src, dst, declare, break_fonts=False):
    pdf = pikepdf.open(os.path.join(OUT, src))
    st = pdf.make_stream(ICC); st.N = 4
    pdf.Root.OutputIntents = pikepdf.Array([pikepdf.Dictionary(Type=pikepdf.Name.OutputIntent, S=pikepdf.Name.GTS_PDFX,
        OutputConditionIdentifier="FOGRA39", RegistryName="http://www.color.org", DestOutputProfile=st)])
    pdf.docinfo["/GTS_PDFXVersion"] = declare
    if not break_fonts:
        pdf.docinfo["/Title"] = "Prueba PDF/X-4"
        pdf.docinfo["/CreationDate"] = "D:20261101100000+01'00'"
        pdf.docinfo["/ModDate"] = "D:20261101100000+01'00'"
        with pdf.open_metadata(set_pikepdf_as_editor=False) as m:
            m["dc:title"] = "Prueba PDF/X-4"
            m["xmp:CreateDate"] = "2026-11-01T10:00:00+01:00"
            m["xmp:ModifyDate"] = "2026-11-01T10:00:00+01:00"
            m["pdfxid:GTS_PDFXVersion"] = declare
    pdf.docinfo["/Trapped"] = pikepdf.Name("/False")
    if break_fonts:
        del pdf.docinfo["/Trapped"]
    pdf.save(os.path.join(OUT, dst))


if __name__ == "__main__":
    casos()
    pdfx("interior-correcto.pdf", "pdfx4-correcto.pdf", "PDF/X-4")
    pdfx("interior-con-errores.pdf", "pdfx-declarado-roto.pdf", "PDF/X-1a:2003", break_fonts=True)
    print("ok")
