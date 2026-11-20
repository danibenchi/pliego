// Marcas del editor sobre los hallazgos: «revisado» o «falsa alarma».
// Se guardan en este navegador por documento (el nombre sin la versión), así que al revisar
// la versión siguiente del mismo libro solo aparece lo nuevo.
import type { Report, Finding } from "../engine/analyze";
import type { Sev } from "../engine/profiles";

export type RevMark = "ok" | "fa";
export interface Review { f: Record<string, RevMark>; i: Record<string, RevMark> }
export const REV_LABEL: Record<RevMark, string> = { ok: "Revisado", fa: "Falsa alarma" };

const VERSION_TAIL = /[\s_.\-]*(v(ersi[oó]n)?\s*\d+|final(es)?|def(initivo|initiva)?|ok|correg(ido|ida)s?|rev\s*\d*|prueba\s*\d*|\(\d+\)|copia|copy|\d{6,8})$/i;
export function docKey(name: string, piece: string) {
  let s = name.toLowerCase().replace(/\.pdf$/i, "").trim();
  for (let k = 0; k < 6; k++) { const t = s.replace(VERSION_TAIL, ""); if (t === s || !t) break; s = t; }
  return `pliego-rev:${piece}:${s}`;
}
export function loadReview(key: string): Review {
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); if (v && v.f && v.i) return v; } catch { /* */ }
  return { f: {}, i: {} };
}
export function saveReview(key: string, r: Review) {
  try { if (!Object.keys(r.f).length && !Object.keys(r.i).length) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(r)); } catch { /* */ }
}
const itemKey = (f: Finding, item: string) => f.check + "|" + item;

export interface Applied {
  findings: Finding[];                       // lo que queda por resolver (con los ítems marcados quitados)
  marked: { f: Finding; mark: RevMark; items?: { text: string; mark: RevMark }[] }[];
  counts: { error: number; warn: number; info: number }; verdict: Sev; markedCount: number;
}

export function applyReview(findings: Finding[], rev: Review): Applied {
  const out: Finding[] = [], marked: Applied["marked"] = [];
  let markedCount = 0;
  for (const f of findings) {
    const fm = rev.f[f.check];
    if (fm) { marked.push({ f, mark: fm }); markedCount++; continue; }
    const items = f.items ?? [];
    const mItems = items.filter(i => rev.i[itemKey(f, i)]);
    if (!mItems.length) { out.push(f); continue; }
    markedCount += mItems.length;
    const rest = items.filter(i => !rev.i[itemKey(f, i)]);
    marked.push({ f, mark: "ok", items: mItems.map(t => ({ text: t, mark: rev.i[itemKey(f, t)] })) });
    if (rest.length) out.push({ ...f, items: rest });
  }
  const counts = { error: 0, warn: 0, info: 0 };
  out.forEach(f => { if (f.sev !== "ok") counts[f.sev]++; });
  return { findings: out, marked, counts, verdict: counts.error ? "error" : counts.warn ? "warn" : "ok", markedCount };
}

export function setMark(rev: Review, f: Finding, mark: RevMark | null, item?: string): Review {
  const n: Review = { f: { ...rev.f }, i: { ...rev.i } };
  if (item !== undefined) { const k = itemKey(f, item); if (mark) n.i[k] = mark; else delete n.i[k]; }
  else if (mark) n.f[f.check] = mark;
  else { delete n.f[f.check]; for (const k of Object.keys(n.i)) if (k.startsWith(f.check + "|")) delete n.i[k]; }
  return n;
}

export async function sha256(buf: ArrayBuffer) {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export type { Report };
