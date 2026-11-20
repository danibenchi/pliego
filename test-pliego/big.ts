import fs from "fs"; import { analyze } from "../src/pliego/engine/analyze";
const fb = new Uint8Array(fs.readFileSync("src/pliego/assets/FOGRA39L_coated.bin"));
for (const f of ["/tmp/big.pdf"]) { const t = Date.now();
const r = analyze(new Uint8Array(fs.readFileSync(f)), "big", { systemId: "offset-obra", contentId: "narrativa", piece: "interior", colorMode: "mono", country: "es" } as any, () => {}, { icc: null, iccName: null, fallback: fb });
console.log(r.file.pages, "págs", Date.now() - t, "ms", r.verdict); }
