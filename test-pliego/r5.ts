import fs from "fs"; import { analyze, render } from "../src/pliego/engine/analyze";
const fb = new Uint8Array(fs.readFileSync("src/pliego/assets/FOGRA39L_coated.bin"));
analyze(new Uint8Array(fs.readFileSync("corpus/casos-tecnicos-color.pdf")), "c", { systemId: "offset-estucado", contentId: "infantil", piece: "interior", colorMode: "cmyk", country: "es" } as any, () => {}, { icc: null, iccName: null, fallback: fb });
const probe = (out: any) => { const s = out.w / 443; const o = (Math.round(420 * s) * out.w + Math.round(300 * s)) * 4; return [...out.rgba.slice(o, o + 3)]; };
console.log("first main", probe(render(4, 0.93, true, false)));
for (let i = 0; i < 8; i++) render(i, 0.23, false);
console.log("after thumbs", probe(render(4, 0.93, true, false)));
console.log("thumb 4", probe(render(4, 0.23, false)));
