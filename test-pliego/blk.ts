import fs from "fs"; import * as mupdf from "mupdf"; import { pageText } from "../src/pliego/engine/text";
const doc = mupdf.Document.openDocument(fs.readFileSync("/home/claude/calib/libro.pdf"), "application/pdf");
for (const [pn, re] of [[31, /producto|precio de mercado/], [191, /madas|lidad\?|lla-|posibi/], [129, /Egipto/]] as [number, RegExp][]) {
  const pg = doc.loadPage(pn - 1); const t = pageText(pg as any, pn - 1, [0, 0, 700, 900]);
  for (const l of t.lines) if (re.test(l.text) || /¿/.test(l.text) && Math.random() < 0) console.log(pn, "b" + l.block, l.r.map(Math.round).join(","), l.size, JSON.stringify(l.text.slice(0, 70)));
}
