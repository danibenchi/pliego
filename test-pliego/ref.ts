// Referencias: mide varios interiores reales y compara cada uno contra el primero (colección e imprenta).
import fs from "fs";
import { analyze } from "../src/pliego/engine/analyze";
import { compareToReference, describeMeasure } from "../src/pliego/engine/reference";
const fb = new Uint8Array(fs.readFileSync("src/pliego/assets/FOGRA39L_coated.bin"));
const D = "/mnt/user-data/uploads/Downloads/PDFs Dani prueba/";
const files = process.argv.slice(2);
const prof: any = { systemId: "offset-obra", contentId: "narrativa", piece: "interior", colorMode: "mono", country: "ar", press: "offset", inks: "1", paperId: "ahuesado80", binding: "fresada", spell: false, typo: false };
const res = files.map(f => {
  const t = Date.now();
  const r = analyze(new Uint8Array(fs.readFileSync(f.startsWith("/") ? f : D + f)), f, prof, () => {}, { icc: null, iccName: null, fallback: fb });
  console.log(`\n### ${f} (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  for (const row of describeMeasure(r.measure!, "coleccion")) console.log(`  ${row.label}: ${row.value}`);
  for (const row of describeMeasure(r.measure!, "imprenta")) console.log(`  ${row.label}: ${row.value}`);
  return r;
});
const ref = res[0];
for (const r of res.slice(1)) {
  console.log(`\n=== ${r.file.name} contra ${ref.file.name}`);
  for (const kind of ["coleccion", "imprenta"] as const) {
    const c = compareToReference(r.measure, ref.measure, kind, "REF", (r.book?.chapters ?? []).map(c => c.page));
    if (c.passedTitle) console.log(`  ✓ ${c.passedTitle}`);
    if (c.finding) { console.log(`  [${c.finding.sev}] ${c.finding.title}: ${c.finding.detail}`); for (const i of c.finding.items ?? []) console.log(`     · ${i}`); }
  }
}
