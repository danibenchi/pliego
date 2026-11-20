import fs from "fs";
import { analyze } from "../src/pliego/engine/analyze";
const fb = new Uint8Array(fs.readFileSync("src/pliego/assets/FOGRA39L_coated.bin"));
const base = { systemId: "offset-obra", contentId: "narrativa", piece: "interior", colorMode: "mono", country: "es", trimW: 150, trimH: 225 };
const cases: [string, any][] = (process.argv.slice(2).length ? process.argv.slice(2).map(f => [f, f.includes("cubierta") ? { systemId: "offset-estucado", contentId: "narrativa", piece: "cubierta", colorMode: "cmyk", country: "es", trimW: 150, trimH: 225, interiorPages: 240, paperId: "ahuesado80", flapMm: 80 } : f.includes("color") ? { ...base, systemId: "offset-estucado", contentId: "infantil", colorMode: "cmyk" } : base]) : [
  ["corpus/interior-correcto.pdf", base], ["corpus/interior-con-errores.pdf", base],
  ["corpus/cubierta-rustica.pdf", { systemId: "offset-estucado", contentId: "narrativa", piece: "cubierta", colorMode: "cmyk", country: "es", trimW: 150, trimH: 225, interiorPages: 240, paperId: "ahuesado80", flapMm: 80 }],
]) as any;
for (const [f, prof] of cases) {
  const r = analyze(new Uint8Array(fs.readFileSync(f)), f, prof, () => {}, { icc: null, iccName: null, fallback: fb });
  console.log(`\n=== ${f} → ${r.verdict} ${JSON.stringify(r.counts)} ${r.ms}ms  ${r.file.formatMm} | color: ${r.color.name}`);
  for (const x of r.findings) console.log(`  [${x.sev}] ${x.title}: ${x.detail} ${x.items?.length ? "| " + x.items.join(" / ") : ""} (marks ${x.marks.length})`);
  console.log("  OK:", r.passed.map(p => p.title).join(" · "));
  console.log("  pdfx:", r.pdfxCheck.target, r.pdfxCheck.rules.map(x => (x.ok ? "✓" : "✗") + x.label).join(" | "));
  console.log("  spots:", r.spots, "tech:", r.technical, "layers:", JSON.stringify(r.layers));
}
