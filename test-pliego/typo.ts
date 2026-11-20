import fs from "fs";
import { analyze } from "../src/pliego/engine/analyze";
const fb = new Uint8Array(fs.readFileSync("src/pliego/assets/FOGRA39L_coated.bin"));
const prof: any = { systemId: "offset-obra", contentId: "narrativa", piece: "interior", colorMode: "mono", country: "es", spell: false };
const r = analyze(new Uint8Array(fs.readFileSync(process.argv[2] ?? "corpus/libro-ortotipografia.pdf")), "x", prof, () => {}, { icc: null, iccName: null, fallback: fb });
for (const x of r.findings) console.log(`[${x.sev}] ${x.title}: ${x.detail}\n    ${(x.items ?? []).slice(0, 8).join("\n    ")}`);
