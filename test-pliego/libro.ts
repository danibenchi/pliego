import fs from "fs";
import { loadModule } from "hunspell-asm";
import { analyze, compareWith } from "../src/pliego/engine/analyze";
import { crossCheck } from "../src/pliego/engine/cross";
const fb = new Uint8Array(fs.readFileSync("src/pliego/assets/FOGRA39L_coated.bin"));
const hf = await loadModule(); const hh = hf.create(hf.mountBuffer(fs.readFileSync("node_modules/dictionary-es/index.aff"), "es.aff"), hf.mountBuffer(fs.readFileSync("node_modules/dictionary-es/index.dic"), "es.dic")); const sp = { correct: (w: string) => hh.spell(w) };
const prof: any = { systemId: "offset-obra", contentId: "narrativa", piece: "interior", colorMode: "mono", country: "es", chaptersOdd: true, spell: true };
const r = analyze(new Uint8Array(fs.readFileSync("corpus/libro-v2.pdf")), "v2", prof, () => {}, { icc: null, iccName: null, fallback: fb, spellers: { es: sp } as any });
const show = (r: any) => { console.log(`=== ${r.file.name} ${r.verdict} ${r.ms}ms`); for (const x of r.findings) console.log(`  [${x.sev}] ${x.title}: ${x.detail} ${x.items?.length ? "| " + x.items.slice(0, 6).join(" / ") : ""} (marks ${x.marks.length})`); };
show(r);
console.log("book:", JSON.stringify({ body: r.book?.bodySize, off: r.book?.folioOffset, ch: r.book?.chapters.map(c => [c.page + 1, c.title]), toc: r.book?.toc, cred: r.book?.credits, sp: r.book?.spelling, title: r.book?.title }));
const cmp = compareWith(new Uint8Array(fs.readFileSync("corpus/libro-v1.pdf")));
console.log("compare:", cmp.edits, cmp.changedPages, cmp.findings.slice(0, 8).map(f => f.check + ": " + (f.item ?? f.label)));
for (const cf of ["corpus/libro-cubierta.pdf", "corpus/libro-cubierta-mal.pdf"]) {
  const c = analyze(new Uint8Array(fs.readFileSync(cf)), cf, { systemId: "offset-estucado", contentId: "narrativa", piece: "cubierta", colorMode: "cmyk", country: "es", trimW: 140, trimH: 210, interiorPages: r.file.pages, paperId: "ahuesado80", flapMm: 70, coverType: "rustica" } as any, () => {}, { icc: null, iccName: null, fallback: fb, key: "cover" });
  show(c); console.log("  barcode:", JSON.stringify(c.barcode && { ...c.barcode, bars: c.barcode.bars.map(v => +v.toFixed(2)), space: c.barcode.space.map(v => +v.toFixed(2)) }), "title:", c.coverTitle);
  console.log("  cross:", JSON.stringify(crossCheck(r, c).map(f => [f.detail, f.items])));
}
