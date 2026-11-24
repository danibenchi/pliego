// Referencias guardadas en este navegador: la de cada imprenta va dentro de la imprenta (printers.ts);
// las colecciones se guardan aparte. Solo medidas y nombres de fuentes: nunca el PDF.
import type { Report, Finding } from "../engine/analyze";
import type { Measure } from "../engine/reference";
import { compareToReference } from "../engine/reference";
import type { Sev } from "../engine/profiles";
import { loadPrinters } from "./printers";

export interface RefMeasures { interior?: Measure; cubierta?: Measure }
export interface Collection { id: string; name: string; measures: RefMeasures; refDate: string }

const KEY = "pliego-colecciones";
export const newId = () => Math.random().toString(36).slice(2, 10);
export const today = () => new Date().toISOString().slice(0, 10);
/** «2026-11-24» → «24/11/2026» */
export const fmtDate = (d?: string) => d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split("-").reverse().join("/") : d ?? "";

const isMeasure = (m: any): m is Measure => !!m && m.v === 1 && (m.piece === "interior" || m.piece === "cubierta") && typeof m.trimW === "number";
export function cleanMeasures(v: any): RefMeasures | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: RefMeasures = {};
  if (isMeasure(v.interior) && v.interior.piece === "interior") out.interior = v.interior;
  if (isMeasure(v.cubierta) && v.cubierta.piece === "cubierta") out.cubierta = v.cubierta;
  return out.interior || out.cubierta ? out : undefined;
}

export function loadCollections(): Collection[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v.filter(c => c && c.id && c.name && cleanMeasures(c.measures)) : []; } catch { return []; }
}
export function saveCollections(list: Collection[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ } }

export function exportCollection(c: Collection): string {
  const { id, ...rest } = c;
  return JSON.stringify({ pliego: "coleccion", version: 1, ...rest }, null, 2);
}
export function importCollection(text: string): Collection | null {
  try {
    const v = JSON.parse(text);
    const measures = cleanMeasures(v?.measures);
    if (v?.pliego !== "coleccion" || !v.name || !measures) return null;
    return { id: newId(), name: String(v.name).slice(0, 60), measures, refDate: typeof v.refDate === "string" ? v.refDate : today() };
  } catch { return null; }
}

/** Qué piezas tiene una referencia, en palabras. */
export const piecesOf = (m?: RefMeasures) => !m ? "" : m.interior && m.cubierta ? "interior y cubierta" : m.interior ? "interior" : "cubierta";

/** Suma al informe lo que difiere de la imprenta y de la colección elegidas en el perfil. */
export function applyReferences(r: Report): Report {
  const p = r.profile;
  const piece = p.piece === "cubierta" ? "cubierta" : "interior";
  const extra: Finding[] = [];
  const passed: Report["passed"] = [];
  const chapterPages = (r.book?.chapters ?? []).map(c => c.page);
  const printer = p.printerId ? loadPrinters().find(x => x.id === p.printerId) : undefined;
  if (printer?.measures?.[piece]) {
    const res = compareToReference(r.measure, printer.measures[piece], "imprenta", printer.name, chapterPages);
    if (res.finding) extra.push(res.finding);
    if (res.passedTitle) passed.push({ check: "refPrinter", title: res.passedTitle, group: "referencia" });
  }
  const coll = p.collectionId ? loadCollections().find(x => x.id === p.collectionId) : undefined;
  if (coll?.measures[piece]) {
    const res = compareToReference(r.measure, coll.measures[piece], "coleccion", coll.name, chapterPages);
    if (res.finding) extra.push(res.finding);
    if (res.passedTitle) passed.push({ check: "refCollection", title: res.passedTitle, group: "referencia" });
  }
  if (!extra.length && !passed.length) return r;
  const order: Record<Sev, number> = { error: 0, warn: 1, info: 2, ok: 3 };
  const findings = [...r.findings.filter(f => f.group !== "referencia"), ...extra].sort((a, b) => order[a.sev] - order[b.sev]);
  const counts = { error: 0, warn: 0, info: 0 };
  findings.forEach(f => { if (f.sev !== "ok") counts[f.sev]++; });
  for (const f of extra) for (const pg of f.pages) { const pi = r.pages[pg]; if (pi && order[f.sev] < order[pi.status]) pi.status = f.sev; }
  return { ...r, findings, counts, verdict: counts.error ? "error" : counts.warn ? "warn" : "ok", passed: [...r.passed.filter(x => x.group !== "referencia"), ...passed] };
}
