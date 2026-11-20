// Calibración con los PDF reales de Daniel: simula soltar interior + cubierta en Pliego, aceptar el
// aviso previo, revisar las dos piezas y cruzarlas. Escribe un JSON por libro y un resumen.
import fs from "fs";
import { loadModule } from "hunspell-asm";
import { analyze, inspect } from "../src/pliego/engine/analyze";
import { crossCheck } from "../src/pliego/engine/cross";
import { compareProfile } from "../src/pliego/ui/Precheck";
const D = "/mnt/user-data/uploads/Downloads/PDFs Dani prueba/";
const OUT = "/home/claude/calib2/";
const fb = new Uint8Array(fs.readFileSync("src/pliego/assets/FOGRA39L_coated.bin"));
const hf = await loadModule();
const mk = (pkg: string) => { const h = hf.create(hf.mountBuffer(fs.readFileSync(`/home/claude/preflight/node_modules/${pkg}/index.aff`), pkg + ".aff"), hf.mountBuffer(fs.readFileSync(`/home/claude/preflight/node_modules/${pkg}/index.dic`), pkg + ".dic")); return { correct: (w: string) => h.spell(w) }; };
let es: any, en: any; try { es = mk("dictionary-es"); en = mk("dictionary-en"); } catch (e) { console.log("sin diccionarios", e); }
const BOOKS: [string, string, string][] = [
  ["america_victoriana", "america_victoriana_interior_10-2026.pdf", "America_victoriana_cubierta_10-2026_ok.pdf"],
  ["manual_emprendedoras", "INT FINAL MOTOLO y MOTOLO Manual de emprendedoras.pdf", "C_ Manual para emprendedoras.pdf"],
  ["arena", "INT FINAL LE BELLOT Arena va a la plaza.pdf", "C_Arena va a la plaza.pdf"],
  ["comunidad", "Comunidad_interior_05-2026.pdf", "Comunidad_cubierta_spain_05-2025.pdf"],
  ["comunidad_imaginada", "La_comunidad_imaginada_08-2026.pdf", "La comunidad imaginada_cubiertas_08-2026.pdf"],
  ["espera_amorosa", "La_espera_amorosa_interior_10-2026.pdf", "LA_ESPERA_AMOROSA_cubiertas_10-2026.pdf"],
  ["medawar", "Medawar INTERIOR 03.pdf", "Medawar TAPA 02.pdf"],
  ["podemos", "Podemos_ interior_10-2026.pdf", "Podemos_cubiertas_10-2026.pdf"],
  ["berger", "john_berger_interior_09-2026.pdf", "john_berger_cubiertas_09-2026_ok.pdf"],
  ["monstruos", "tiempo_de_monstruos_interior_09-2026.pdf", "tiempo_de_monstruos_cubierta_09-2026.pdf"],
];
const only = process.argv[2];
const base: any = { press: "offset", inks: "1", binding: "fresada", paperId: "ahuesado80", systemId: "offset-obra", contentId: "narrativa", colorMode: "mono", country: "es", chaptersOdd: "auto", spell: true, flapMm: 0, coverType: "rustica" };
const summary: string[] = [];
for (const [id, fi, fc] of BOOKS) {
  if (only && id !== only) continue;
  const di = new Uint8Array(fs.readFileSync(D + fi)), dc = new Uint8Array(fs.readFileSync(D + fc));
  const ii = inspect(di), ic = inspect(dc);
  const items = compareProfile(base, [{ piece: "interior", insp: ii }, { piece: "cubierta", insp: ic }]);
  let prof = { ...base }; for (const it of items) prof = { ...prof, ...it.patch };
  const t = Date.now();
  const R = analyze(di, fi, { ...prof, piece: "interior" }, () => {}, { icc: null, iccName: null, fallback: fb, spellers: { es, en } as any, key: "int", light: di.length > 150e6 });
  const C = analyze(dc, fc, { ...prof, piece: "cubierta", interiorPages: R.file.pages, trimW: Math.round(R.pages[0].wMm * 10) / 10, trimH: Math.round(R.pages[0].hMm * 10) / 10 }, () => {}, { icc: null, iccName: null, fallback: fb, key: "cov" });
  const cross = crossCheck(R, C);
  const dump = (r: any) => r.findings.map((x: any) => ({ sev: x.sev, check: x.check, title: x.title, detail: x.detail, items: x.items?.slice(0, 12), n: x.marks.length, pages: x.pages.slice(0, 30), marks: x.marks.slice(0, 8) }));
  fs.writeFileSync(OUT + id + ".json", JSON.stringify({ pre: { ii: { ...ii, langs: ii.langs.slice(0, 3) }, ic: { ...ic, langs: [] }, items: items.map(i => i.title + ": " + i.text) }, prof, interior: { pages: R.file.pages, verdict: R.verdict, counts: R.counts, findings: dump(R), passed: R.passed.map((p: any) => p.check), book: { title: R.book?.title, chapters: R.book?.chapters?.length, credits: R.book?.credits, spelling: R.book?.spelling && { langs: R.book.spelling.langs, words: R.book.spelling.words } } }, cover: { verdict: C.verdict, counts: C.counts, findings: dump(C), spine: (C as any).spine, title: C.coverTitle }, cross: cross.map(f => ({ sev: f.sev, title: f.title, detail: f.detail, items: f.items })) }, null, 1));
  const line = `${id.padEnd(22)} ${R.file.pages}p ${Math.round((Date.now() - t) / 1000)}s pre:[${items.map(i => i.id).join(",")}] INT ${R.verdict} ${JSON.stringify(R.counts)} | COV ${C.verdict} ${JSON.stringify(C.counts)} | cruce ${cross.length}`;
  console.log(line); summary.push(line);
}
fs.writeFileSync(OUT + "resumen.txt", summary.join("\n"));
