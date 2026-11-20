// Idiomas: detección por palabras frecuentes y diccionarios libres (LibreOffice / wooorm/dictionaries).
export type Family = "es" | "ca" | "gl" | "eu" | "pt" | "en" | "fr" | "it" | "de";
export const DICTS: { id: string; name: string; family: Family }[] = [
  { id: "es", name: "Español (general)", family: "es" }, { id: "es-ar", name: "Español de Argentina", family: "es" },
  { id: "es-mx", name: "Español de México", family: "es" }, { id: "es-co", name: "Español de Colombia", family: "es" },
  { id: "es-cl", name: "Español de Chile", family: "es" }, { id: "es-uy", name: "Español de Uruguay", family: "es" },
  { id: "es-pe", name: "Español de Perú", family: "es" }, { id: "es-ve", name: "Español de Venezuela", family: "es" },
  { id: "ca", name: "Català", family: "ca" }, { id: "ca-valencia", name: "Català (valencià)", family: "ca" },
  { id: "gl", name: "Galego", family: "gl" }, { id: "eu", name: "Euskara", family: "eu" },
  { id: "pt", name: "Português (Brasil)", family: "pt" }, { id: "pt-pt", name: "Português (Portugal)", family: "pt" },
  { id: "en", name: "English (US)", family: "en" }, { id: "en-gb", name: "English (UK)", family: "en" },
  { id: "fr", name: "Français", family: "fr" }, { id: "it", name: "Italiano", family: "it" }, { id: "de", name: "Deutsch", family: "de" },
];
export const FAMILY_NAME: Record<Family, string> = { es: "español", ca: "catalán", gl: "gallego", eu: "euskera", pt: "portugués", en: "inglés", fr: "francés", it: "italiano", de: "alemán" };

// palabras muy frecuentes y propias de cada lengua (se evitan las compartidas como «de», «la», «que»)
const MARKERS: Record<Family, string[]> = {
  es: "el los las del al y con pero más este esta muy también porque yo él hay había fue está estaba cuando como sus le se lo una uno".split(" "),
  ca: "els les amb però més aquest aquesta molt també perquè jo ell hi ho va van pel dels als és era són una un seu seva".split(" "),
  gl: "o os as do da dos das non co coa unha un máis tamén porque eu el hai foi está estaba cando como seu súa ao".split(" "),
  eu: "eta da ez bat du zen ere baina hori beste dira zuen izan dute dago egin behar gabe oso bere hau".split(" "),
  pt: "o os as do da dos das não com uma um mais também porque eu ele há foi está estava quando como seu sua ao em".split(" "),
  en: "the and of to is was that with for his her it you he she they be have had this not are".split(" "),
  fr: "le les des et est une pas avec pour qui dans sur au du ne je il elle nous vous mais très".split(" "),
  it: "il che di e la le non una per con gli del della sono è anche più ma questo questa lo".split(" "),
  de: "der die und das ist nicht mit ein eine zu den von auch ich sie es dem sich wir auf".split(" "),
};
const SETS = Object.fromEntries(Object.entries(MARKERS).map(([k, v]) => [k, new Set(v)])) as Record<Family, Set<string>>;

export function detect(text: string): Family | null {
  const ws = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  if (ws.length < 6) return null;
  let best: Family | null = null, bestScore = 0, second = 0;
  for (const f of Object.keys(SETS) as Family[]) {
    let s = 0; for (const w of ws) if (SETS[f].has(w)) s++;
    if (s > bestScore) { second = bestScore; bestScore = s; best = f; } else if (s > second) second = s;
  }
  if (bestScore < Math.max(2, ws.length * 0.08) || bestScore < second * 1.2) return null;
  return best;
}

// Idiomas de un conjunto de párrafos: la lengua principal y las que ocupan al menos un 8 % del texto.
export function detectMany(paragraphs: string[]): { family: Family; share: number }[] {
  const tally = new Map<Family, number>(); let total = 0;
  for (const p of paragraphs) { const f = detect(p); const n = p.split(/\s+/).length; total += n; if (f) tally.set(f, (tally.get(f) ?? 0) + n); }
  return [...tally.entries()].map(([family, n]) => ({ family, share: n / Math.max(1, total) })).filter(x => x.share >= 0.08).sort((a, b) => b.share - a.share);
}

// Variante del diccionario para cada lengua, según el país de edición o la elección del perfil
export function dictFor(f: Family, country: string, choice?: string): string {
  if (choice && choice !== "auto") { const d = DICTS.find(x => x.id === choice); if (d && d.family === f) return d.id; }
  if (f === "es") return ({ ar: "es-ar", mx: "es-mx", co: "es-co", cl: "es-cl", uy: "es-uy", pe: "es-pe", ve: "es-ve" } as Record<string, string>)[country] ?? "es";
  if (f === "pt") return country === "pt" ? "pt-pt" : "pt";
  return f;
}
