// Referencias: la huella técnica y de diseño de un PDF que ya salió bien, para revisar los siguientes
// contra ella. Hay dos clases:
//  · de imprenta: cómo pide los archivos esa imprenta (sangrado, PDF/X, perfil de salida, tinta, imágenes,
//    papel real según el lomo);
//  · de colección: cómo se ve la serie (formato, tipografías, cuerpo, interlineado, márgenes, folios,
//    color, solapas y tipo de cubierta).
// Solo se guardan medidas y nombres de fuentes: nunca el PDF, su texto, sus imágenes ni su ISBN.
import type { Finding } from "./analyze";
import type { PageText, Line } from "./text";
import type { Sev } from "./profiles";

export type RefKind = "imprenta" | "coleccion";

export interface Layout {
  bodyFont: string | null; bodySize: number; leading: number | null;
  /** márgenes de la caja de texto en mm (mediana de las páginas de texto corrido) */
  margins: { top: number; bottom: number; inner: number; outer: number } | null;
  /** dónde va el folio: «abajo-centro», «arriba-afuera», etc. */
  folio: string | null;
  /** los capítulos abren siempre en página impar (null si hay menos de tres capítulos) */
  chaptersOdd: boolean | null;
}

export interface Measure {
  v: 1; piece: "interior" | "cubierta";
  trimW: number; trimH: number; pages: number;
  bleedMm: number | null; pdfVersion: string; pdfx: string | null; outputIntent: string | null;
  colorShare: number; tacMax: number; ppiMin: number | null; rgb: boolean;
  spots: string[]; fonts: string[];
  layout?: Layout;
  cover?: { bookW: number | null; bookH: number | null; spineMm: number | null; interiorPages: number | null; mmPerLeaf: number | null; flapMm: number | null; coverType: string; barcode: boolean };
}

const PT = 25.4 / 72;
const half = (v: number) => Math.round(v * 2) / 2;
const r1 = (v: number) => Math.round(v * 10) / 10;
const median = (xs: number[]) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
export const fmtN = (v: number) => String(r1(v)).replace(".", ",");

/** Familia tipográfica sin prefijo de subconjunto ni estilo: «ABCDEF+MinionPro-Regular» → «MinionPro». */
export function family(name: string) {
  const base = name.replace(/^[A-Z]{6}\+/, "").split(/[-,]/)[0].trim();
  // variantes de un mismo diseño: «HelveticaNeueLTStd» y «HelveticaNeueLTPro», «TimesNewRomanPS» y «TimesNewRomanMT»
  let f = base, prev = "";
  while (f !== prev) { prev = f; f = f.replace(/(LT)?(Std|Pro|Com|W\d+)$/, "").replace(/(MT|PS)$/, "").replace(/(BoldItalic|Bold|Italic|Regular)$/, "").trim(); }
  return f || base || name;
}

// ---------- maqueta: cuerpo, interlineado, caja de texto, folios ----------
export function measureLayout(texts: PageText[], bodySize: number, chapterPages: number[]): Layout {
  const isBody = (l: Line) => Math.abs(l.size - bodySize) <= Math.max(0.6, bodySize * 0.06) && l.text.length > 2;
  const fontChars = new Map<string, number>();
  const gaps: number[] = [];
  const m = { top: [] as number[], bottom: [] as number[], inner: [] as number[], outer: [] as number[] };
  const folios = new Map<string, number>();
  for (const p of texts) {
    if (!p) continue;
    const [x0, y0, x1, y1] = p.trim, w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) continue;
    const body = p.lines.filter(l => isBody(l) && (l.r[1] + l.r[3]) / 2 > y0 + h * 0.08 && (l.r[1] + l.r[3]) / 2 < y1 - h * 0.08);
    for (const l of body) if (l.font) { const f = family(l.font); fontChars.set(f, (fontChars.get(f) ?? 0) + l.text.length); }
    // interlineado: distancia entre líneas seguidas de la misma columna
    const sorted = [...body].sort((a, b) => a.r[3] - b.r[3]);
    for (let i = 1; i < sorted.length; i++) {
      const a = sorted[i - 1], b = sorted[i];
      const overlap = Math.min(a.r[2], b.r[2]) - Math.max(a.r[0], b.r[0]);
      const d = b.r[3] - a.r[3];
      if (overlap > Math.min(a.r[2] - a.r[0], b.r[2] - b.r[0]) * 0.5 && d > bodySize * 0.9 && d < bodySize * 2.2) gaps.push(d);
    }
    // caja de texto: solo páginas de texto corrido
    if (body.length >= 12) {
      const bx0 = Math.min(...body.map(l => l.r[0])), bx1 = Math.max(...body.map(l => l.r[2]));
      const by0 = Math.min(...body.map(l => l.r[1])), by1 = Math.max(...body.map(l => l.r[3]));
      const recto = p.index % 2 === 0;
      m.top.push((by0 - y0) * PT); m.bottom.push((y1 - by1) * PT);
      m.inner.push(((recto ? bx0 - x0 : x1 - bx1)) * PT); m.outer.push(((recto ? x1 - bx1 : bx0 - x0)) * PT);
    }
    // folio: número solo en la banda de arriba o de abajo
    for (const l of p.lines) {
      if (!/^\d{1,4}$/.test(l.text.trim()) || l.size > bodySize * 1.3) continue;
      const cy = (l.r[1] + l.r[3]) / 2, cx = (l.r[0] + l.r[2]) / 2;
      const v = cy < y0 + h * 0.12 ? "arriba" : cy > y1 - h * 0.12 ? "abajo" : null;
      if (!v) continue;
      const recto = p.index % 2 === 0;
      const hz = Math.abs(cx - (x0 + x1) / 2) < w * 0.12 ? "centro" : (cx > (x0 + x1) / 2) === recto ? "afuera" : "adentro";
      const k = `${v}-${hz}`; folios.set(k, (folios.get(k) ?? 0) + 1);
    }
  }
  const font = [...fontChars.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const folioTop = [...folios.entries()].sort((a, b) => b[1] - a[1])[0];
  const lead = gaps.length >= 20 ? r1(median(gaps)) : null;
  // arriba y abajo cuentan las páginas llenas: una apertura de capítulo baja el texto y las notas al pie
  // lo suben, así que se toma el valor bajo (percentil 20) en lugar de la mediana
  const low = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length * 0.2)]; };
  const margins = m.top.length >= 4 ? { top: half(low(m.top)), bottom: half(low(m.bottom)), inner: half(median(m.inner)), outer: half(median(m.outer)) } : null;
  const odd = chapterPages.length >= 3 ? chapterPages.filter(pg => pg % 2 === 0).length / chapterPages.length >= 0.85 : null;
  return { bodyFont: font, bodySize, leading: lead, margins, folio: folioTop && folioTop[1] >= 3 ? folioTop[0] : null, chaptersOdd: odd };
}

// ---------- comparación ----------
interface Diff { sev: Sev; text: string; pages?: number[] }

const FOLIO_NAME: Record<string, string> = {
  "abajo-centro": "abajo, al centro", "abajo-afuera": "abajo, hacia el corte", "abajo-adentro": "abajo, hacia el lomo",
  "arriba-centro": "arriba, al centro", "arriba-afuera": "arriba, hacia el corte", "arriba-adentro": "arriba, hacia el lomo",
};
const sameFonts = (a: string | null, b: string | null) => !a || !b || a.toLowerCase() === b.toLowerCase();

function printerDiffs(cur: Measure, ref: Measure): Diff[] {
  const out: Diff[] = [];
  if (ref.bleedMm != null && cur.bleedMm != null && cur.bleedMm < ref.bleedMm - 0.4)
    out.push({ sev: "warn", text: `Sangrado de ${fmtN(cur.bleedMm)} mm; la referencia trae ${fmtN(ref.bleedMm)} mm` });
  if (ref.pdfx && cur.pdfx !== ref.pdfx)
    out.push({ sev: "warn", text: cur.pdfx ? `Exportado como ${cur.pdfx}; la referencia es ${ref.pdfx}` : `No declara PDF/X; la referencia es ${ref.pdfx}` });
  if (ref.outputIntent && cur.outputIntent !== ref.outputIntent)
    out.push({ sev: "warn", text: cur.outputIntent ? `Perfil de salida «${cur.outputIntent}»; la referencia usa «${ref.outputIntent}»` : `No declara perfil de salida; la referencia usa «${ref.outputIntent}»` });
  // la tinta máxima depende de las imágenes de cada libro: solo es una nota, el límite lo controla «Tinta total»
  if (cur.tacMax > Math.max(ref.tacMax + 40, 280))
    out.push({ sev: "info", text: `Tinta total máxima de ${cur.tacMax} %; en la referencia no pasaba de ${ref.tacMax} %` });
  if (ref.ppiMin != null && cur.ppiMin != null && cur.ppiMin < ref.ppiMin - 30)
    out.push({ sev: "warn", text: `La imagen de menor resolución tiene ${cur.ppiMin} ppi; en la referencia ninguna bajaba de ${ref.ppiMin} ppi` });
  if (cur.rgb && !ref.rgb) out.push({ sev: "warn", text: `Trae imágenes o colores en RGB; la referencia era toda CMYK o gris` });
  const newSpots = cur.spots.filter(s => !ref.spots.includes(s));
  if (newSpots.length) out.push({ sev: "warn", text: `Tintas planas que la referencia no tenía: ${newSpots.join(", ")}` });
  if (cur.pdfVersion !== ref.pdfVersion) out.push({ sev: "info", text: `${cur.pdfVersion}; la referencia es ${ref.pdfVersion}` });
  const cc = cur.cover, rc = ref.cover;
  if (cc && rc && rc.mmPerLeaf && cc.mmPerLeaf && Math.abs(cc.mmPerLeaf - rc.mmPerLeaf) / rc.mmPerLeaf > 0.08)
    out.push({ sev: "warn", text: `El lomo equivale a ${fmtN(cc.mmPerLeaf * 100) } mm cada 100 hojas; en la referencia, con el papel de esta imprenta, ${fmtN(rc.mmPerLeaf * 100)} mm. Puede ser otro papel o un lomo mal calculado` });
  return out;
}

function collectionDiffs(cur: Measure, ref: Measure, chapterPages: number[]): Diff[] {
  const out: Diff[] = [];
  const bw = cur.cover ? cur.cover.bookW : cur.trimW, bh = cur.cover ? cur.cover.bookH : cur.trimH;
  const rw = ref.cover ? ref.cover.bookW : ref.trimW, rh = ref.cover ? ref.cover.bookH : ref.trimH;
  if (bw && bh && rw && rh && (Math.abs(bw - rw) > 0.6 || Math.abs(bh - rh) > 0.6))
    out.push({ sev: "warn", text: `Formato de ${fmtN(bw)} × ${fmtN(bh)} mm; la colección es de ${fmtN(rw)} × ${fmtN(rh)} mm` });
  if (cur.piece === "interior") {
    if (ref.colorShare < 0.05 && cur.colorShare >= 0.1) out.push({ sev: "warn", text: `Tiene color en ${Math.round(cur.colorShare * 100)} % de las páginas; la colección es a una tinta` });
    else if (ref.colorShare >= 0.3 && cur.colorShare < 0.05) out.push({ sev: "info", text: `Es a una tinta; la colección lleva color` });
    const L = cur.layout, R = ref.layout;
    if (L && R) {
      if (!sameFonts(L.bodyFont, R.bodyFont)) out.push({ sev: "warn", text: `El texto va en ${L.bodyFont}; la colección usa ${R.bodyFont}` });
      if (Math.abs(L.bodySize - R.bodySize) > 0.25) out.push({ sev: "warn", text: `Cuerpo de ${fmtN(L.bodySize)} pt; la colección usa ${fmtN(R.bodySize)} pt` });
      if (L.leading && R.leading && Math.abs(L.leading - R.leading) > 0.35) out.push({ sev: "warn", text: `Interlineado de ${fmtN(L.leading)} pt; la colección usa ${fmtN(R.leading)} pt` });
      if (L.margins && R.margins) {
        const names = { top: "superior", bottom: "inferior", inner: "hacia el lomo", outer: "hacia el corte" } as const;
        const off = (Object.keys(names) as (keyof typeof names)[]).filter(k => Math.abs(L.margins![k] - R.margins![k]) > 1.2);
        if (off.length) out.push({ sev: "warn", text: `Márgenes distintos: ${off.map(k => `${names[k]} ${fmtN(L.margins![k])} mm (colección ${fmtN(R.margins![k])} mm)`).join(", ")}` });
      }
      if (L.folio && R.folio && L.folio !== R.folio) out.push({ sev: "warn", text: `Folios ${FOLIO_NAME[L.folio] ?? L.folio}; en la colección van ${FOLIO_NAME[R.folio] ?? R.folio}` });
      if (R.chaptersOdd === true) {
        const even = chapterPages.filter(p => p % 2 === 1);
        if (chapterPages.length >= 3 && even.length / chapterPages.length > 0.15) out.push({ sev: "warn", text: `En la colección los capítulos abren en página impar; acá ${even.length === 1 ? "uno abre" : `${even.length} abren`} en par`, pages: even });
      }
    }
    const extra = cur.fonts.filter(f => !ref.fonts.some(g => g.toLowerCase() === f.toLowerCase()));
    if (extra.length && extra.length <= 12) out.push({ sev: "info", text: `Tipografías que la colección no usaba: ${extra.join(", ")}` });
  } else if (cur.cover && ref.cover) {
    const c = cur.cover, r = ref.cover;
    if (c.coverType !== r.coverType) out.push({ sev: "warn", text: `Cubierta ${c.coverType === "tapadura" ? "de tapa dura" : c.coverType === "sobrecubierta" ? "con sobrecubierta" : "rústica"}; en la colección es ${r.coverType === "tapadura" ? "de tapa dura" : r.coverType === "sobrecubierta" ? "con sobrecubierta" : "rústica"}` });
    if ((c.flapMm ?? 0) !== (r.flapMm ?? 0) && Math.abs((c.flapMm ?? 0) - (r.flapMm ?? 0)) > 2)
      out.push({ sev: "warn", text: r.flapMm ? `Solapas de ${fmtN(c.flapMm ?? 0)} mm; en la colección son de ${fmtN(r.flapMm)} mm` : `Lleva solapas de ${fmtN(c.flapMm ?? 0)} mm; la colección no tiene` });
    if (r.barcode && !c.barcode) out.push({ sev: "info", text: `No encontré el código de barras, que en la colección va en la cubierta` });
  }
  return out;
}

const COPYREF = {
  imprenta: {
    title: (n: string) => `Distinto de la referencia de ${n}`,
    impact: "La imprenta ya recibió de vos archivos que funcionaron. Lo que cambia respecto de esa referencia es lo primero que conviene confirmar: puede ser intencional, pero también es la causa más común de sorpresas en la máquina.",
    fix: "Si el cambio no es intencional, exportá con el mismo ajuste preestablecido que usaste para el archivo de referencia. Si es intencional (otro papel, otro perfil), avisale a la imprenta.",
  },
  coleccion: {
    title: (n: string) => `Distinto de la colección ${n}`,
    impact: "Los libros de una colección comparten formato, tipografía, caja y folios: en la mesa de novedades y en el estante se ven juntos. Una diferencia que no se ve en pantalla se nota al poner los libros uno al lado del otro.",
    fix: "Partí de la plantilla o del documento del título de referencia, o copiá sus estilos de párrafo y páginas maestras. Si el cambio es una decisión editorial, ignoralo.",
  },
};

/** Hallazgos «Distinto de la referencia» para un informe, o la nota de que coincide. */
export function compareToReference(cur: Measure | undefined, ref: Measure | undefined, kind: RefKind, name: string, chapterPages: number[] = []): { finding: Finding | null; passedTitle: string | null } {
  if (!cur || !ref || cur.piece !== ref.piece) return { finding: null, passedTitle: null };
  const diffs = kind === "imprenta" ? printerDiffs(cur, ref) : collectionDiffs(cur, ref, chapterPages);
  const copy = COPYREF[kind];
  if (!diffs.length) return { finding: null, passedTitle: kind === "imprenta" ? `Igual a la referencia de ${name}` : `Igual a la colección ${name}` };
  const sev: Sev = diffs.some(d => d.sev === "warn") ? "warn" : "info";
  const pages = [...new Set(diffs.flatMap(d => d.pages ?? []))];
  return {
    finding: { id: `ref-${kind}`, check: kind === "imprenta" ? "refPrinter" : "refCollection", sev, group: "referencia", title: copy.title(name),
      detail: diffs[0].text, items: diffs.slice(1).map(d => d.text), pages, marks: [], impact: copy.impact, fix: copy.fix },
    passedTitle: null,
  };
}

/** Lo que se guarda, en palabras, para mostrar antes de guardar una referencia. */
export function describeMeasure(m: Measure, kind: RefKind): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null | undefined) => { if (value) rows.push({ label, value }); };
  if (kind === "imprenta") {
    add("Sangrado", m.bleedMm != null ? `${fmtN(m.bleedMm)} mm` : null);
    add("Estándar", m.pdfx ?? "Sin PDF/X declarado");
    add("Perfil de salida", m.outputIntent ?? "Sin perfil declarado");
    add("Versión", m.pdfVersion);
    add("Tinta total máxima", `${m.tacMax} %`);
    add("Resolución mínima de imágenes", m.ppiMin != null ? `${m.ppiMin} ppi` : null);
    add("Color", m.rgb ? "Tiene RGB" : "Todo CMYK o gris");
    add("Tintas planas", m.spots.length ? m.spots.join(", ") : "Ninguna");
    if (m.cover?.mmPerLeaf) add("Papel según el lomo", `${fmtN(m.cover.mmPerLeaf * 100)} mm cada 100 hojas (lomo de ${fmtN(m.cover.spineMm ?? 0)} mm para ${m.cover.interiorPages} páginas)`);
  } else {
    const w = m.cover ? m.cover.bookW : m.trimW, h = m.cover ? m.cover.bookH : m.trimH;
    add("Formato", w && h ? `${fmtN(w)} × ${fmtN(h)} mm` : null);
    if (m.piece === "interior") {
      add("Color", m.colorShare >= 0.3 ? "Con color" : m.colorShare < 0.05 ? "A una tinta" : `Color en ${Math.round(m.colorShare * 100)} % de las páginas`);
      const L = m.layout;
      if (L) {
        add("Tipografía del texto", L.bodyFont);
        add("Cuerpo e interlineado", `${fmtN(L.bodySize)} pt${L.leading ? ` / ${fmtN(L.leading)} pt` : ""}`);
        if (L.margins) add("Márgenes", `superior ${fmtN(L.margins.top)} · inferior ${fmtN(L.margins.bottom)} · lomo ${fmtN(L.margins.inner)} · corte ${fmtN(L.margins.outer)} mm`);
        add("Folios", L.folio ? FOLIO_NAME[L.folio] ?? L.folio : null);
        add("Capítulos", L.chaptersOdd === true ? "Abren en página impar" : L.chaptersOdd === false ? "Abren en par o impar" : null);
      }
      add("Tipografías", m.fonts.length ? m.fonts.slice(0, 8).join(", ") + (m.fonts.length > 8 ? "…" : "") : null);
    } else if (m.cover) {
      add("Cubierta", m.cover.coverType === "tapadura" ? "Tapa dura" : m.cover.coverType === "sobrecubierta" ? "Con sobrecubierta" : "Rústica");
      add("Solapas", m.cover.flapMm ? `${fmtN(m.cover.flapMm)} mm` : "Sin solapas");
      add("Código de barras", m.cover.barcode ? "En la cubierta" : "No tiene");
    }
  }
  return rows;
}
