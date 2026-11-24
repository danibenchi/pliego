// Referencias de cubierta: interior + cubierta de varios libros de la misma colección, comparados con el primero.
import fs from "fs";
import { analyze } from "../src/pliego/engine/analyze";
import { compareToReference, describeMeasure } from "../src/pliego/engine/reference";
const fb = new Uint8Array(fs.readFileSync("src/pliego/assets/FOGRA39L_coated.bin"));
const D = "/mnt/user-data/uploads/Downloads/PDFs Dani prueba/";
const pairs = [
  ["La_espera_amorosa_interior_10-2026.pdf", "LA_ESPERA_AMOROSA_cubiertas_10-2026.pdf"],
  ["La_comunidad_imaginada_08-2026.pdf", "La comunidad imaginada_cubiertas_08-2026.pdf"],
  ["john_berger_interior_09-2026.pdf", "john_berger_cubiertas_09-2026_ok.pdf"],
  ["tiempo_de_monstruos_interior_09-2026.pdf", "tiempo_de_monstruos_cubierta_09-2026.pdf"],
  ["Podemos_ interior_10-2026.pdf", "Podemos_cubiertas_10-2026.pdf"],
];
const base: any = { systemId: "offset-obra", contentId: "narrativa", piece: "interior", colorMode: "mono", country: "ar", press: "offset", inks: "1", paperId: "ahuesado80", binding: "fresada", spell: false, typo: false, coverType: "rustica" };
const out = pairs.map(([i, c]) => {
  const ri = analyze(new Uint8Array(fs.readFileSync(D + i)), i, base, () => {}, { icc: null, iccName: null, fallback: fb });
  const cp = { ...base, piece: "cubierta", trimW: Math.round(ri.pages[0].wMm * 10) / 10, trimH: Math.round(ri.pages[0].hMm * 10) / 10, interiorPages: ri.file.pages };
  const rc = analyze(new Uint8Array(fs.readFileSync(D + c)), c, cp, () => {}, { icc: null, iccName: null, fallback: fb });
  console.log(`\n### ${c}: ${rc.file.formatMm}, ${ri.file.pages} págs, lomo ${rc.spine?.actual} (esperado ${rc.spine?.expected})`);
  for (const k of ["imprenta", "coleccion"] as const) for (const row of describeMeasure(rc.measure!, k)) console.log(`  ${row.label}: ${row.value}`);
  return rc;
});
for (const r of out.slice(1)) {
  console.log(`\n=== ${r.file.name}`);
  for (const k of ["coleccion", "imprenta"] as const) {
    const c = compareToReference(r.measure, out[0].measure, k, "REF");
    if (c.passedTitle) console.log(`  ✓ ${c.passedTitle}`);
    if (c.finding) { console.log(`  [${c.finding.sev}] ${c.finding.title}: ${c.finding.detail}`); for (const i of c.finding.items ?? []) console.log(`     · ${i}`); }
  }
}
