// Funciones sin MuPDF, para usar también en la interfaz: cruces interior–cubierta
// y conversión de la comparación de versiones en hallazgos.
import type { Report, Finding } from "./analyze";
import type { CompareResult } from "./compare";
import type { Sev } from "./profiles";
import { COPY } from "./copy";
import { sameTitle } from "./text";
import { describe, Correction } from "./corrections";
import type { OrigResult } from "./original";

const fmtMm = (v: number) => (Math.round(v * 10) / 10).toLocaleString("es", { maximumFractionDigits: 1 });

export function crossCheck(interior: Report, cover: Report): Finding[] {
  const out: { sev: Sev; text: string }[] = [];
  const iIsbn = interior.isbns.filter(s => s.valid && s.value.length === 13).map(s => s.value);
  const cIsbn = [...cover.isbns.filter(s => s.valid && s.value.length === 13).map(s => s.value), ...(cover.barcode ? [cover.barcode.digits] : [])];
  if (cover.barcode && iIsbn.length && !iIsbn.includes(cover.barcode.digits)) out.push({ sev: "error", text: `El código de barras de la cubierta (${cover.barcode.digits}) no coincide con el ISBN del interior (${iIsbn.join(", ")})` });
  else if (iIsbn.length && cIsbn.length && !cIsbn.some(v => iIsbn.includes(v))) out.push({ sev: "error", text: `El ISBN de la cubierta (${[...new Set(cIsbn)].join(", ")}) no coincide con el del interior (${iIsbn.join(", ")})` });
  const it = interior.book?.title, ct = cover.coverTitle;
  if (it && ct && !sameTitle(it, ct)) out.push({ sev: "warn", text: `El título de la tapa («${ct}») no coincide con el de la portada interior («${it}»)` });
  const ip = interior.pages[0], cp = cover.pages[0];
  if ((cover.profile.coverType ?? "rustica") === "rustica" && Math.abs(cp.hMm - ip.hMm) > 1) out.push({ sev: "error", text: `La cubierta mide ${fmtMm(cp.hMm)} mm de alto y el interior ${fmtMm(ip.hMm)} mm` });
  if (!out.length) return [];
  const c = COPY.coverMatch;
  return [{ id: "coverMatch", check: "coverMatch", sev: out.some(o => o.sev === "error") ? "error" : "warn", group: "cubierta", title: c.title,
    detail: out.length > 1 ? `${out.length} diferencias entre interior y cubierta:` : out[0].text, pages: [], marks: [], impact: c.impact, fix: c.fix,
    items: out.length > 1 ? out.map(o => o.text) : [] }];
}

export function diffFindings(res: CompareResult): Finding[] {
  const map = new Map<string, Finding>();
  for (const d of res.findings) {
    let f = map.get(d.check);
    if (!f) { const c = COPY[d.check]; f = { id: d.check, check: d.check, sev: "info", group: "versiones", title: c.title, detail: "", pages: [], marks: [], impact: c.impact, fix: c.fix, items: [] }; map.set(d.check, f); }
    if (d.page !== undefined && !f.pages.includes(d.page)) f.pages.push(d.page);
    if (d.page !== undefined && d.rect) f.marks.push({ page: d.page, rect: d.rect, label: d.label ?? f.title });
    if (d.item) f.items!.push(d.item);
  }
  for (const f of map.values()) {
    f.pages.sort((a, b) => a - b);
    if (f.check === "diffText") { f.detail = res.tooDifferent ? f.items![0] : `${res.edits} cambio${res.edits !== 1 ? "s" : ""} de texto en ${f.pages.length} página${f.pages.length !== 1 ? "s" : ""}:`; if (res.tooDifferent) f.items = []; }
    else if (f.check === "diffVisual") f.detail = `${f.pages.length} página${f.pages.length !== 1 ? "s" : ""} con cambios gráficos y el mismo texto.`;
    else { f.detail = f.items![0] ?? ""; f.items = f.items!.slice(1); }
    if (f.check === "diffReflow" || f.check === "diffPages") f.sev = "warn";
  }
  return [...map.values()];
}

export interface CorrSummary { total: number; applied: number; missing: number; different: number; manual: number; lost: number }
export function corrSummary(cs: Correction[]): CorrSummary {
  const n = (st: string) => cs.filter(c => c.status === st).length;
  return { total: cs.length, applied: n("applied"), missing: n("missing"), different: n("different"), manual: n("manual"), lost: n("lost") };
}
export function corrFindings(cs: Correction[]): Finding[] {
  const spec: [string, Correction["status"], Finding["sev"]][] = [["corrMissing", "missing", "error"], ["corrDifferent", "different", "warn"], ["corrLost", "lost", "warn"], ["corrManual", "manual", "info"]];
  const out: Finding[] = [];
  for (const [check, st, sev] of spec) {
    const list = cs.filter(c => c.status === st);
    if (!list.length) continue;
    const c = COPY[check];
    const pages = [...new Set(list.map(x => x.page).filter((p): p is number => p !== null))].sort((a, b) => a - b);
    out.push({ id: check, check, sev, group: "correcciones", title: c.title, impact: c.impact, fix: c.fix,
      detail: `${list.length} ${list.length === 1 ? "corrección" : "correcciones"}${st === "manual" ? " (comentarios)" : ""}:`, pages,
      marks: list.filter(x => x.page !== null && x.rect).map(x => ({ page: x.page!, rect: x.rect!, label: describe(x).replace(/^Pág\. [^:]+: /, "") })),
      items: list.map(describe) });
  }
  return out;
}

export function origFindings(r: OrigResult): Finding[] {
  const out: Finding[] = [];
  for (const check of ["origMissing", "origNotes", "origChanged", "origExtra"] as const) {
    const list = r.findings.filter(f => f.check === check);
    if (!list.length) continue;
    const c = COPY[check];
    const sev = list.some(f => f.sev === "error") ? "error" : list.some(f => f.sev === "warn") ? "warn" : "info";
    const pages = [...new Set(list.map(f => f.page).filter((p): p is number => p !== undefined))].sort((a, b) => a - b);
    const n = check === "origMissing" ? r.missing : check === "origExtra" ? r.extra : list.length;
    const detail = check === "origMissing" ? `Faltan ${n} palabra${n !== 1 ? "s" : ""} del original, en ${list.length} lugar${list.length !== 1 ? "es" : ""}:`
      : check === "origExtra" ? `${n} palabra${n !== 1 ? "s" : ""} que el original no tiene, en ${list.length} lugar${list.length !== 1 ? "es" : ""}:`
      : check === "origNotes" ? `${list.length} de ${r.notes} notas del original no aparecen en el libro:`
      : `${list.length} cambio${list.length !== 1 ? "s" : ""} respecto del original:`;
    out.push({ id: check, check, sev, group: "original", title: c.title, impact: c.impact, fix: c.fix, detail, pages,
      marks: list.filter(f => f.page !== undefined && f.rect).map(f => ({ page: f.page!, rect: f.rect!, label: f.label ?? c.title })), items: list.map(f => f.item!).filter(Boolean) });
  }
  return out;
}
