import fs from "fs"; import { analyze } from "../src/pliego/engine/analyze";
const fb = new Uint8Array(fs.readFileSync("src/pliego/assets/FOGRA39L_coated.bin"));
const f = process.argv[2], light = process.argv[3] === "light";
const t = Date.now(); let peak = 0;
const iv = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 200);
const r = analyze(new Uint8Array(fs.readFileSync(f)), "pesado", { press: "offset", inks: "4", binding: "fresada", paperId: "estucado135", systemId: "offset-estucado", contentId: "ilustrado", piece: "interior", colorMode: "cmyk", country: "es", spell: false } as any,
  p => { if (p.page && p.page % 40 === 0) { (globalThis as any).gc?.(); const mu = process.memoryUsage(); console.log("heap", Math.round(mu.heapUsed/1e6), "ab", Math.round(mu.arrayBuffers/1e6), "ext", Math.round(mu.external/1e6)); peak = Math.max(peak, process.memoryUsage().rss); console.log(p.page, Date.now() - t, "ms", Math.round(process.memoryUsage().rss / 1e6), "MB"); } },
  { icc: null, iccName: null, fallback: fb, light } as any);
clearInterval(iv); peak = Math.max(peak, process.memoryUsage().rss);
console.log(r.file.pages, "págs", Date.now() - t, "ms · pico", Math.round(peak / 1e6), "MB ·", r.verdict, r.findings.map(f => f.check).join(","));
