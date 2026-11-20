import fs from "fs"; import { inspect } from "../src/pliego/engine/analyze";
for (const f of process.argv.slice(2)) { const t = Date.now(); const r = inspect(new Uint8Array(fs.readFileSync(f))); console.log(f.split("/").pop(), Date.now() - t, "ms", JSON.stringify({ ...r, langs: r.langs.slice(0, 2) })); }
