"""Libro ilustrado pesado: 160 páginas con foto a sangre de 300 ppi, para probar el rendimiento."""
import io, sys, numpy as np
from PIL import Image, ImageFilter
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
N = int(sys.argv[1]) if len(sys.argv) > 1 else 160
W, H, B = 170, 240, 3
pw, ph = (W + 2 * B) * mm, (H + 2 * B) * mm
c = canvas.Canvas(f"corpus/pesado/ilustrado-{N}p.pdf", pagesize=(pw, ph))
px, py = int((W + 2 * B) / 25.4 * 300), int((H + 2 * B) / 25.4 * 300)
rng = np.random.default_rng(7)
for i in range(N):
    small = (rng.random((py // 40, px // 40, 3)) * 255).astype(np.uint8)
    img = Image.fromarray(small).resize((px, py), Image.BICUBIC)
    noise = (rng.normal(0, float(sys.argv[2]) if len(sys.argv) > 2 else 18, (py, px, 3))).astype(np.int16)
    arr = np.clip(np.asarray(img, dtype=np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    if i % 3 == 0: img = img.convert("CMYK")
    buf = io.BytesIO(); img.save(buf, "JPEG", quality=88); buf.seek(0)
    c.drawImage(ImageReader(buf), 0, 0, pw, ph)
    c.setFillGray(1); c.setFont("Helvetica-Bold", 22); c.drawString(B * mm + 20 * mm, ph - 30 * mm, f"Lámina {i + 1}")
    c.setTrimBox((B * mm, B * mm, pw - B * mm, ph - B * mm)); c.setBleedBox((0, 0, pw, ph))
    c.showPage()
c.save()
