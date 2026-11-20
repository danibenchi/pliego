import fs from "fs"; import { analyze } from "../src/pliego/engine/analyze";
const r = analyze(new Uint8Array(fs.readFileSync("corpus/interior-con-errores.pdf")), "x", { systemId: "offset-obra", contentId: "narrativa", piece: "interior", colorMode: "mono", country: "es" } as any, () => {});
for (const f of r.findings) if (f.pages.includes(9)) console.log(f.check, f.sev, f.pages);
