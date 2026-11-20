// Regenera los recursos incrustados en el código (forma preferida para modificarlos: los originales).
//  - src/pliego/assets/dict/*.ts  ← diccionarios Hunspell de los paquetes dictionary-* (gzip + base64)
//  - src/pliego/assets/fonts.ts   ← Geist y Geist Mono del paquete geist (OFL), para el informe en PDF
//  - src/pliego/assets/fogra39.ts ← src/pliego/assets/FOGRA39L_coated.bin (perfil de referencia FOGRA39L)
// Uso: npm install && npm run assets
import fs from "node:fs";
import zlib from "node:zlib";
const pkgDir = name => `node_modules/${name}/`;

const DICTS = ["es", "es-ar", "es-mx", "es-co", "es-cl", "es-uy", "es-pe", "es-ve", "ca", "ca-valencia", "gl", "eu", "pt", "pt-pt", "en", "en-gb", "fr", "it", "de"];
fs.mkdirSync("src/pliego/assets/dict", { recursive: true });
const lic = ["Diccionarios ortográficos libres usados por Pliego (paquetes dictionary-* de wooorm/dictionaries, basados en LibreOffice/Hunspell).", "Se distribuyen como datos independientes, cada uno con su propia licencia:", ""];
for (const id of DICTS) {
  const dir = pkgDir("dictionary-" + id), license = JSON.parse(fs.readFileSync(dir + "package.json", "utf8")).license;
  const gz = f => zlib.gzipSync(fs.readFileSync(dir + f), { level: 9 }).toString("base64");
  fs.writeFileSync(`src/pliego/assets/dict/${id}.ts`, `// Diccionario ${id} (gzip + base64). Licencia: ${license}\nexport const AFF = "${gz("index.aff")}";\nexport const DIC = "${gz("index.dic")}";\n`);
  lic.push(`- dictionary-${id}: ${license}`);
}
fs.writeFileSync("src/pliego/assets/dict/LICENSE.txt", lic.join("\n") + "\n");

const g = pkgDir("geist") + "dist/fonts/";
const b64 = f => fs.readFileSync(f).toString("base64");
fs.writeFileSync("src/pliego/assets/fonts.ts", ["// Geist y Geist Mono (Vercel, SIL Open Font License 1.1), para el informe en PDF. Se cargan solo al exportar.",
  `export const REGULAR = "${b64(g + "geist-sans/Geist-Regular.ttf")}";`, `export const MEDIUM = "${b64(g + "geist-sans/Geist-Medium.ttf")}";`,
  `export const SEMIBOLD = "${b64(g + "geist-sans/Geist-SemiBold.ttf")}";`, `export const MONO = "${b64(g + "geist-mono/GeistMono-Regular.ttf")}";`, ""].join("\n"));

fs.writeFileSync("src/pliego/assets/fogra39.ts", `// FOGRA39L Coated (perfil libre de restricciones de copyright, distribuido con TeX Live).\nexport const FOGRA39_B64 = "${b64("src/pliego/assets/FOGRA39L_coated.bin")}";\n`);
console.log("Recursos regenerados");
