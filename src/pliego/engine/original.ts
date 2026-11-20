// Cotejo contra el original aprobado (Word): detecta texto perdido en el armado, texto agregado,
// cambios y notas que faltan. El .docx se lee en el navegador (es un zip con XML).
import { unzipSync, strFromU8 } from "fflate";
import type { PageText, R, Line } from "./text";
import { diffPairs } from "./compare";

export interface OrigDoc { body: string[]; notes: { id: string; text: string }[]; tracked: boolean; paragraphs: number }
export interface OrigFinding { check: "origMissing" | "origExtra" | "origChanged" | "origNotes"; page?: number; rect?: R | null; label?: string; item?: string; sev?: "error" | "warn" | "info" }
export interface OrigResult { findings: OrigFinding[]; words: number; pdfWords: number; matched: number; missing: number; extra: number; changed: number; notes: number; notesMissing: number; tracked: boolean; skippedFront: number; skippedBack: number }

const ent = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, "&");

// Texto de los párrafos de un XML de Word, con los cambios propuestos aceptados.
function paras(xml: string): { text: string; notes: string[] }[] {
  xml = xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, "").replace(/<w:del\b[\s\S]*?<\/w:del>/g, "").replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, "");
  const out: { text: string; notes: string[] }[] = [];
  const pRe = /<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g;
  let m: RegExpExecArray | null;
  while ((m = pRe.exec(xml))) {
    const inner = m[1] ?? "";
    let text = ""; const notes: string[] = [];
    const tRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>|<w:footnoteReference\b[^>]*w:id="(-?\d+)"[^>]*\/>/g;
    let r: RegExpExecArray | null;
    while ((r = tRe.exec(inner))) {
      const run = r[1] ?? "";
      if (/<w:vanish\/>/.test(run.split("</w:rPr>")[0] ?? "") && /<w:rPr>/.test(run)) continue;
      const fn = run.match(/<w:footnoteReference\b[^>]*w:id="(-?\d+)"/); if (fn) notes.push(fn[1]);
      run.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\b[^>]*\/>|<w:noBreakHyphen\/>|<w:softHyphen\/>|<w:sym\b[^>]*w:char="([0-9A-F]+)"[^>]*\/>/gi, (all, t, sym) => {
        if (t !== undefined) text += ent(t);
        else if (/noBreakHyphen/.test(all)) text += "-";
        else if (/softHyphen/.test(all)) text += "";
        else if (sym) text += "";
        else text += " ";
        return "";
      });
    }
    out.push({ text, notes });
  }
  return out;
}

export function parseDocx(bytes: Uint8Array): OrigDoc {
  const z = unzipSync(bytes, { filter: f => /^word\/(document|footnotes|endnotes)\.xml$/.test(f.name) });
  const doc = z["word/document.xml"]; if (!doc) throw new Error("No es un archivo de Word (.docx)");
  const xml = strFromU8(doc);
  const tracked = /<w:(ins|del)\b/.test(xml);
  const ps = paras(xml.replace(/<w:txbxContent>[\s\S]*?<\/w:txbxContent>/g, m => m)).map(p => p.text).filter(t => t.trim());
  const notes: { id: string; text: string }[] = [];
  for (const f of ["word/footnotes.xml", "word/endnotes.xml"]) {
    const x = z[f]; if (!x) continue;
    const s = strFromU8(x);
    const re = /<w:(footnote|endnote)\b([^>]*)>([\s\S]*?)<\/w:\1>/g; let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      if (/w:type="(separator|continuationSeparator|continuationNotice)"/.test(m[2])) continue;
      const id = (m[2].match(/w:id="(-?\d+)"/) ?? [])[1] ?? "";
      const t = paras(m[3]).map(p => p.text).join(" ").trim();
      if (t) notes.push({ id, text: t });
    }
  }
  return { body: ps, notes, tracked, paragraphs: ps.length };
}

export function parsePlain(text: string): OrigDoc {
  const ps = text.replace(/\r/g, "").split(/\n{1,}/).map(s => s.trim()).filter(Boolean);
  return { body: ps, notes: [], tracked: false, paragraphs: ps.length };
}

// ---------- normalización: lo que la maquetación cambia sin que sea un cambio de texto ----------
const LIG: Record<string, string> = { "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st" };
export const key = (w: string) => w.normalize("NFC").replace(/[ﬀ-ﬆ]/g, c => LIG[c] ?? c).replace(/…/g, "...").replace(/[«»“”„"‘’‚'`´]/g, "").replace(/[‐‑‒–—―−-]/g, "-")
  .replace(/[\u00ad\u200b\u2009\u200a\u202f\u00a0]/g, "").replace(/(\p{L}[.,;:!?)\]]?)[\d¹²³⁰-⁹]{1,3}$/u, "$1").toLowerCase();

type T = { w: string; k: string; page: number; r: R };
function pdfTokens(texts: PageText[], small: (l: Line) => boolean) {
  const body: T[] = [], notes: T[] = [];
  for (const p of texts) {
    const h = p.trim[3] - p.trim[1];
    for (let li = 0; li < p.lines.length; li++) {
      const l = p.lines[li], cy = (l.r[1] + l.r[3]) / 2;
      if ((cy < p.trim[1] + h * 0.08 || cy > p.trim[3] - h * 0.08) && l.text.length < 90) continue; // cabeceras y folios
      const dest = small(l) && cy > p.trim[1] + h * 0.45 ? notes : body;
      for (const wd of l.words) {
        const w = wd.t.replace(/\u00ad/g, "");
        if (!w) continue;
        const last = dest[dest.length - 1];
        // palabra cortada a fin de línea: se une con la siguiente
        if (last && /\p{L}-$/u.test(last.w) && (last as any).eol && /^\p{Ll}/u.test(w)) { last.w = last.w.slice(0, -1) + w; last.k = key(last.w); (last as any).eol = false; continue; }
        dest.push({ w, k: key(w), page: p.index, r: wd.r });
      }
      if (dest.length) (dest[dest.length - 1] as any).eol = true;
    }
  }
  return { body: body.filter(t => t.k), notes: notes.filter(t => t.k) };
}

export function compareOriginal(orig: OrigDoc, texts: PageText[]): OrigResult {
  // cuerpo del texto del PDF: el tamaño más usado; las notas al pie van en un tamaño menor, abajo
  const hist = new Map<number, number>();
  for (const p of texts) for (const l of p.lines) { const k = Math.round(l.size * 2) / 2; hist.set(k, (hist.get(k) ?? 0) + l.text.length); }
  const body = [...hist.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
  const pdf = pdfTokens(texts, l => l.size < body * 0.93);
  const O = orig.body.join(" ").split(/\s+/).filter(Boolean).map(w => ({ w, k: key(w) })).filter(t => t.k);
  const B = pdf.body;
  const dict = new Map<string, number>(); const id = (k: string) => { let v = dict.get(k); if (v === undefined) { v = dict.size; dict.set(k, v); } return v; };
  const a = Int32Array.from(O, t => id(t.k)), b = Int32Array.from(B, t => id(t.k));
  const pairs = diffPairs(a, b);
  const findings: OrigFinding[] = [];
  // dónde empieza y termina el texto del original en el PDF (lo de antes y después son preliminares y colofón)
  const firstRun = (() => { for (let i = 0; i + 8 < pairs.length; i++) if (pairs[i + 8][0] - pairs[i][0] === 8 && pairs[i + 8][1] - pairs[i][1] === 8) return i; return 0; })();
  const lastRun = (() => { for (let i = pairs.length - 1; i - 8 >= 0; i--) if (pairs[i][0] - pairs[i - 8][0] === 8 && pairs[i][1] - pairs[i - 8][1] === 8) return i; return pairs.length - 1; })();
  const frontLimit = pairs.length ? pairs[firstRun][1] : B.length, backLimit = pairs.length ? pairs[lastRun][1] : 0;
  let missing = 0, extra = 0, changed = 0, skippedFront = 0, skippedBack = 0;
  const cut = (ts: { w: string }[], n = 14) => { const s = ts.slice(0, n).map(t => t.w).join(" "); return ts.length > n ? s + "…" : s; };
  const ctx = (i: number) => O.slice(Math.max(0, i - 5), i).map(t => t.w).join(" ");
  const loc = (bi: number, len: number) => {
    const ts = B.slice(Math.max(0, bi), Math.max(0, bi) + Math.max(1, len)); const t0 = ts[0] ?? B[B.length - 1];
    if (!t0) return { page: undefined, rect: null };
    const rs = ts.filter(t => t.page === t0.page).map(t => t.r);
    return { page: t0.page, rect: rs.length ? rs.reduce<R>((x, r) => [Math.min(x[0], r[0]), Math.min(x[1], r[1]), Math.max(x[2], r[2]), Math.max(x[3], r[3])], rs[0]) : t0.r };
  };
  let shown = 0;
  const flush = (a0: number, a1: number, b0: number, b1: number) => {
    const na = a1 - a0, nb = b1 - b0;
    if (!na && !nb) return;
    // preliminares (portada, créditos, índice) y colofón: texto del PDF que el original no tiene
    if (na <= 3 && b1 <= frontLimit) { skippedFront += nb; return; }
    if (na <= 3 && b0 > backLimit) { skippedBack += nb; return; }
    const l = loc(nb ? b0 : b0 - 1, nb);
    const where = l.page !== undefined ? `Pág. ${l.page + 1}` : "";
    if (na && !nb) {
      missing += na;
      if (shown++ < 400) findings.push({ check: "origMissing", sev: na > 3 ? "error" : "warn", page: l.page, rect: l.rect, label: `Falta: «${cut(O.slice(a0, a1), 8)}»`, item: `${where}: ${a0 ? `después de «${ctx(a0)}» ` : "al comienzo "}falta «${cut(O.slice(a0, a1))}»${na > 14 ? ` (${na} palabras)` : ""}` });
    } else if (nb && !na) {
      extra += nb;
      if (shown++ < 400) findings.push({ check: "origExtra", sev: nb > 3 ? "warn" : "info", page: l.page, rect: l.rect, label: `Sobra: «${cut(B.slice(b0, b1), 8)}»`, item: `${where}: «${cut(B.slice(b0, b1))}»${nb > 14 ? ` (${nb} palabras)` : ""}` });
    } else {
      changed++;
      if (na > 40 || nb > 40) { missing += na; extra += nb; }
      if (shown++ < 400) findings.push({ check: "origChanged", sev: "warn", page: l.page, rect: l.rect, label: `«${cut(O.slice(a0, a1), 6)}» → «${cut(B.slice(b0, b1), 6)}»`, item: `${where}: el original dice «${cut(O.slice(a0, a1))}» y el PDF «${cut(B.slice(b0, b1))}»` });
    }
  };
  let ia = 0, ib = 0;
  for (const [pa, pb] of pairs) { flush(ia, pa, ib, pb); ia = pa + 1; ib = pb + 1; }
  flush(ia, O.length, ib, B.length);
  // notas: cada nota del original tiene que aparecer en el texto chico de las páginas
  const noteSpace = pdf.notes.map(t => t.k).join("") + "|" + B.map(t => t.k).join("");
  let notesMissing = 0;
  for (const n of orig.notes) {
    const k = n.text.split(/\s+/).map(key).join("");
    const probe = k.slice(0, Math.min(60, k.length));
    if (probe.length >= 8 && !noteSpace.includes(probe)) { notesMissing++; findings.push({ check: "origNotes", sev: "error", item: `Nota ${n.id}: «${n.text.length > 70 ? n.text.slice(0, 69) + "…" : n.text}» no aparece en el libro` }); }
  }
  const matched = pairs.length;
  return { findings, words: O.length, pdfWords: B.length, matched, missing, extra, changed, notes: orig.notes.length, notesMissing, tracked: orig.tracked, skippedFront, skippedBack };
}
