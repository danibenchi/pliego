"""Original aprobado en Word (.docx) para probar el cotejo contra libro-v1.pdf: un párrafo que el PDF
perdió, una errata que agregó la maquetación («taler»), una nota al pie que no está y cambios propuestos."""
import os, random, zipfile, sys
from xml.sax.saxutils import escape
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_libro as g
OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(7)
ct = [g.paragraphs(30) for _ in g.CHAPTERS]
ct[0][2] = ct[0][2] + " La inprenta era de de otro siglo."   # igual que en el PDF (sin «taler»: el original estaba bien)
ct[1][1] = "Los pliegoss esperaban. " + ct[1][1]
LOST = "Este párrafo estaba en el original aprobado y se perdió al armar el libro: quedó desbordado en una caja de texto que nadie vio."
ct[1].insert(6, LOST)
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
def p(text, style=None, note=None, ins=None):
    ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
    runs = f'<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r>'
    if note: runs += f'<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="{note}"/></w:r>'
    if ins: runs += f'<w:ins w:id="90" w:author="Autora" w:date="2026-11-01T10:00:00Z"><w:r><w:t xml:space="preserve"> {escape(ins)}</w:t></w:r></w:ins>'
    return f"<w:p>{ppr}{runs}</w:p>"
body = [p(g.TITLE, "Title"), p("Autora de Prueba")]
for ci, (num, name) in enumerate(g.CHAPTERS):
    body.append(p(f"Capítulo {num}", "Heading1")); body.append(p(name, "Heading2"))
    for k, para in enumerate(ct[ci]):
        if ci == 0 and k == 4: body.append(p(para, note=1)); continue
        if ci == 2 and k == 3: body.append(p(para, note=2)); continue
        body.append(p(para))
doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {W}><w:body>{"".join(body)}<w:sectPr/></w:body></w:document>'
notes = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes {W}>
<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>
<w:footnote w:id="1"><w:p><w:r><w:t xml:space="preserve">Los talleres de la época trabajaban con tipos móviles de plomo y madera.</w:t></w:r></w:p></w:footnote>
<w:footnote w:id="2"><w:p><w:r><w:t xml:space="preserve">La máquina del fondo era una Minerva de pedal, según el inventario de 1932.</w:t></w:r></w:p></w:footnote>
</w:footnotes>'''
ct_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/></Types>'''
rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'''
drels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/></Relationships>'''
with zipfile.ZipFile(os.path.join(OUT, "libro-original.docx"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", ct_xml); z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", doc); z.writestr("word/footnotes.xml", notes); z.writestr("word/_rels/document.xml.rels", drels)
print("ok")
