// Perfiles de revisión: sistema de impresión × tipo de libro × pieza.
// Los valores son referencias habituales del sector; cada imprenta puede pedir otros.

export type Sev = "error" | "warn" | "info" | "ok";

export interface PrintSystem {
  id: string;
  name: string;
  short: string;
  tac: number;          // cobertura de tinta máxima (%)
  bleedMm: number;      // sangrado mínimo
  minPpi: number;       // por debajo: revisar
  hardPpi: number;      // por debajo: bloqueante
  lineArtPpi: number;   // imágenes de 1 bit
  minLinePt: number;    // filete más fino aceptable
  signature: number;    // múltiplo de páginas (pliego)
  minPages?: number;
  wantsOutputIntent: boolean;
  note: string;
}

export const SYSTEMS: PrintSystem[] = [
  { id: "offset-estucado", name: "Offset · papel estucado", short: "Offset estucado", tac: 320, bleedMm: 3, minPpi: 300, hardPpi: 200, lineArtPpi: 1200, minLinePt: 0.25, signature: 16, wantsOutputIntent: true,
    note: "Papeles con capa (brillo, mate, seda). Perfil de salida habitual: FOGRA51 o FOGRA39." },
  { id: "offset-obra", name: "Offset · papel obra / ahuesado", short: "Offset obra", tac: 280, bleedMm: 3, minPpi: 300, hardPpi: 200, lineArtPpi: 1200, minLinePt: 0.25, signature: 16, wantsOutputIntent: true,
    note: "Papeles sin capa: absorben más tinta, por eso el límite de cobertura es menor. Perfil habitual: FOGRA52." },
  { id: "digital", name: "Digital (tirada corta)", short: "Digital", tac: 300, bleedMm: 3, minPpi: 300, hardPpi: 200, lineArtPpi: 600, minLinePt: 0.25, signature: 2, wantsOutputIntent: false,
    note: "Impresión digital de tirada corta. Se arma por hojas, no por pliegos." },
  { id: "pod-kdp", name: "Bajo demanda · Amazon KDP", short: "KDP", tac: 300, bleedMm: 3.2, minPpi: 300, hardPpi: 200, lineArtPpi: 600, minLinePt: 0.25, signature: 2, minPages: 24, wantsOutputIntent: false,
    note: "Sangrado de 0,125 pulgadas (3,2 mm). Número de páginas par." },
  { id: "pod-ingram", name: "Bajo demanda · IngramSpark", short: "IngramSpark", tac: 240, bleedMm: 3.2, minPpi: 300, hardPpi: 200, lineArtPpi: 600, minLinePt: 0.25, signature: 2, minPages: 18, wantsOutputIntent: false,
    note: "Límite de cobertura total de 240 %. Sangrado de 0,125 pulgadas." },
];

export type ColorMode = "mono" | "cmyk";

export interface ContentType {
  id: string;
  name: string;
  colorMode: ColorMode;     // interior a 1 tinta o a 4 colores
  safetyMm: number;         // zona segura respecto del corte
  gutterMm: number;         // distancia mínima del texto al lomo
  ppiBoost?: number;        // exige más resolución
  hint: string;
}

export const CONTENTS: ContentType[] = [
  { id: "narrativa", name: "Narrativa", colorMode: "mono", safetyMm: 5, gutterMm: 10, hint: "Interior a una tinta: todo debería salir solo en la plancha de negro." },
  { id: "ensayo", name: "Ensayo / no ficción", colorMode: "mono", safetyMm: 5, gutterMm: 10, hint: "Notas, tablas y gráficos: atención a los cuerpos chicos y a los grises." },
  { id: "poesia", name: "Poesía", colorMode: "mono", safetyMm: 5, gutterMm: 10, hint: "Mucho blanco y versos largos: revisá que nada se acerque al lomo." },
  { id: "infantil", name: "Infantil / álbum ilustrado", colorMode: "cmyk", safetyMm: 8, gutterMm: 15, hint: "Dobles páginas a sangre: el texto nunca debe caer en el pliegue." },
  { id: "comic", name: "Cómic / novela gráfica", colorMode: "cmyk", safetyMm: 6, gutterMm: 12, hint: "Negros intensos y globos de texto: cuidado con el negro compuesto en letra chica." },
  { id: "arte", name: "Arte / fotografía", colorMode: "cmyk", safetyMm: 6, gutterMm: 15, ppiBoost: 1, hint: "La reproducción manda: resolución y cobertura de tinta al límite." },
  { id: "escolar", name: "Escolar / texto", colorMode: "cmyk", safetyMm: 6, gutterMm: 12, hint: "Muchos colores planos, tablas y cuerpos chicos: el registro es clave." },
  { id: "cocina", name: "Cocina / práctico", colorMode: "cmyk", safetyMm: 6, gutterMm: 12, hint: "Fotografía a sangre y fondos de color en papel estucado." },
];

export interface Paper { id: string; name: string; mmPerLeaf: number; coated: boolean; tac: number; icc: string }
// Papeles habituales del libro: espesor por hoja (para el lomo), si es estucado, tinta máxima y condición de impresión de referencia
export const PAPERS: Paper[] = [
  { id: "offset80", name: "Obra blanco 80 g", mmPerLeaf: 0.1, coated: false, tac: 280, icc: "FOGRA52 (PSO Uncoated)" },
  { id: "offset90", name: "Obra blanco 90 g", mmPerLeaf: 0.11, coated: false, tac: 280, icc: "FOGRA52 (PSO Uncoated)" },
  { id: "ahuesado80", name: "Ahuesado / crema 80 g (vol. 1,5)", mmPerLeaf: 0.12, coated: false, tac: 280, icc: "FOGRA52 (PSO Uncoated)" },
  { id: "ahuesado90", name: "Ahuesado / crema 90 g", mmPerLeaf: 0.135, coated: false, tac: 280, icc: "FOGRA52 (PSO Uncoated)" },
  { id: "bulky70", name: "Bulky / editorial 70 g (vol. 2)", mmPerLeaf: 0.14, coated: false, tac: 260, icc: "FOGRA52 (PSO Uncoated)" },
  { id: "biblia40", name: "Biblia / fino 40 g", mmPerLeaf: 0.05, coated: false, tac: 240, icc: "FOGRA52 (PSO Uncoated)" },
  { id: "estucado115", name: "Estucado mate 115 g", mmPerLeaf: 0.1, coated: true, tac: 320, icc: "FOGRA51 (PSO Coated v3)" },
  { id: "estucado135", name: "Estucado brillo o seda 135 g", mmPerLeaf: 0.115, coated: true, tac: 320, icc: "FOGRA51 (PSO Coated v3)" },
  { id: "estucado150", name: "Estucado 150 g", mmPerLeaf: 0.13, coated: true, tac: 320, icc: "FOGRA51 (PSO Coated v3)" },
];
export type Press = "offset" | "digital" | "pod-kdp" | "pod-ingram";
export const PRESSES: { id: Press; name: string; note: string }[] = [
  { id: "offset", name: "Offset", note: "Imprenta tradicional, tiradas medianas y largas. Se arma en pliegos." },
  { id: "digital", name: "Digital", note: "Tiradas cortas en imprenta digital. Se arma por hojas." },
  { id: "pod-kdp", name: "Amazon KDP", note: "Impresión bajo demanda de Amazon." },
  { id: "pod-ingram", name: "IngramSpark", note: "Impresión bajo demanda de Ingram (Lightning Source)." },
];
export type Inks = "1" | "2" | "4" | "4+";
export const INKS: { id: Inks; name: string }[] = [
  { id: "1", name: "Una tinta (negro)" }, { id: "2", name: "Negro + una plana" }, { id: "4", name: "Cuatro colores" }, { id: "4+", name: "Cuatro + planas" },
];
export type Binding = "fresada" | "cosida" | "tapadura" | "grapa" | "espiral";
// distancia del texto al lomo por debajo de la cual se empieza a perder en la encuadernación, y múltiplo de páginas
export const BINDINGS: { id: Binding; name: string; gutterMm: number; signature?: number }[] = [
  { id: "fresada", name: "Rústica fresada (pegada)", gutterMm: 12 },
  { id: "cosida", name: "Rústica cosida", gutterMm: 10 },
  { id: "tapadura", name: "Tapa dura", gutterMm: 12 },
  { id: "grapa", name: "Grapa (cuadernillo)", gutterMm: 6, signature: 4 },
  { id: "espiral", name: "Espiral o anillado", gutterMm: 15, signature: 2 },
];
// Valores de una imprenta concreta: pisan los típicos del sistema y del papel
export interface PrinterSpec { bleedMm?: number; tac?: number; minPpi?: number; signature?: number; safetyMm?: number; gutterMm?: number }
export function systemIdFor(press: Press, paperId?: string): string {
  if (press === "offset") return PAPERS.find(p => p.id === paperId)?.coated ? "offset-estucado" : "offset-obra";
  return press;
}

export type Piece = "interior" | "cubierta";

export interface Profile {
  systemId: string;
  contentId: string;
  piece: Piece;
  colorMode: ColorMode;
  trimW?: number;   // formato esperado en mm
  trimH?: number;
  country: "es" | "ar" | "mx" | "co" | "cl" | "uy" | "pe" | "ve" | "otro";
  // cubierta
  interiorPages?: number;
  paperId?: string;
  mmPerLeaf?: number;
  flapMm?: number;
  coverType?: "rustica" | "tapadura" | "sobrecubierta";
  boardMm?: number; cejaMm?: number; turnInMm?: number; hingeMm?: number;
  chaptersOdd?: boolean | "auto"; typo?: boolean; language?: string;
  press?: Press; inks?: Inks; binding?: Binding; spec?: PrinterSpec; spineMm?: number; finishes?: string[]; printerId?: string; printerName?: string;
  spell?: boolean;
}

export function resolve(p: Profile) {
  const base = SYSTEMS.find(s => s.id === p.systemId) ?? SYSTEMS[0];
  const baseContent = CONTENTS.find(c => c.id === p.contentId) ?? CONTENTS[0];
  const paper = PAPERS.find(x => x.id === p.paperId);
  const binding = BINDINGS.find(b => b.id === p.binding);
  const sp = p.spec ?? {};
  // offset: la tinta máxima depende del papel; la imprenta puede pedir otros valores
  const tac = sp.tac ?? (base.id.startsWith("offset") && paper ? paper.tac : base.tac);
  const signature = sp.signature ?? (binding?.signature && base.signature > 2 ? binding.signature : base.signature);
  const system: PrintSystem = { ...base, tac, signature, bleedMm: sp.bleedMm ?? base.bleedMm, minPpi: sp.minPpi ?? base.minPpi, hardPpi: Math.min(sp.minPpi ? sp.minPpi * 0.67 : base.hardPpi, sp.minPpi ?? base.hardPpi) };
  const content: ContentType = { ...baseContent, safetyMm: sp.safetyMm ?? baseContent.safetyMm, gutterMm: sp.gutterMm ?? Math.max(baseContent.gutterMm, binding?.gutterMm ?? 0) };
  const minPpi = content.ppiBoost ? Math.max(system.minPpi, 300) : system.minPpi;
  const hardPpi = content.ppiBoost ? Math.max(system.hardPpi, 250) : system.hardPpi;
  return { system, content, minPpi, hardPpi, paper, binding };
}

export const FORMATS = [
  { name: "13 × 20 cm", w: 130, h: 200 }, { name: "13,5 × 21 cm", w: 135, h: 210 },
  { name: "14 × 21 cm", w: 140, h: 210 }, { name: "15 × 22,5 cm", w: 150, h: 225 },
  { name: "15 × 23 cm", w: 150, h: 230 }, { name: "16 × 24 cm", w: 160, h: 240 },
  { name: "17 × 24 cm", w: 170, h: 240 }, { name: "A5", w: 148, h: 210 },
  { name: "A4", w: 210, h: 297 }, { name: "21 × 28 cm", w: 210, h: 280 },
  { name: "24 × 30 cm", w: 240, h: 300 }, { name: "Bolsillo 11 × 18 cm", w: 110, h: 180 },
  { name: "6 × 9 in", w: 152.4, h: 228.6 }, { name: "5,5 × 8,5 in", w: 139.7, h: 215.9 },
];
