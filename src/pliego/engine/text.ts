// Texto de cada página con su geometría: líneas, palabras, cuerpo y fuente.
// Es la base de todos los controles del libro (folios, capítulos, índice, viudas, ortografía).
import type * as mupdf from "mupdf";

export type R = [number, number, number, number];
export interface Word { t: string; r: R; cr?: R[] }
export interface Line { text: string; r: R; size: number; font: string; bold: boolean; words: Word[]; block: number }
export interface PageText { index: number; trim: R; lines: Line[] }

const union = (a: R | null, b: R): R => a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : [...b] as R;

export function pageText(page: mupdf.Page, index: number, trim: R, withChars = false): PageText {
  const lines: Line[] = [];
  let block = -1;
  let cur: { chars: string[]; r: R | null; size: number; font: string; words: Word[]; w: string; wr: R | null; wc: R[]; sz: Map<number, number> } | null = null;
  const flushWord = () => { if (cur && cur.w.trim()) cur.words.push(withChars ? { t: cur.w, r: cur.wr!, cr: cur.wc } : { t: cur.w, r: cur.wr! }); if (cur) { cur.w = ""; cur.wr = null; cur.wc = []; } };
  const st = page.toStructuredText("preserve-whitespace,preserve-ligatures");
  st.walk({
    beginTextBlock() { block++; },
    beginLine() { cur = { chars: [], r: null, size: 0, font: "", words: [], w: "", wr: null, wc: [], sz: new Map() }; },
    onChar(c: string, _o: any, font: any, size: number, quad: number[]) {
      if (!cur) return;
      const xs = [quad[0], quad[2], quad[4], quad[6]], ys = [quad[1], quad[3], quad[5], quad[7]];
      const r: R = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      cur.chars.push(c);
      if (/[\p{L}\d]/u.test(c)) { const k = Math.round(size * 10) / 10; cur.sz.set(k, (cur.sz.get(k) ?? 0) + 1); }
      if (c.trim()) { cur.r = union(cur.r, r); if (size > cur.size) cur.size = size; if (!cur.font) { try { cur.font = font.getName(); } catch { /* */ } } }
      if (/\s/.test(c)) flushWord(); else { cur.w += c; cur.wr = union(cur.wr, r); if (withChars) for (let k = 0; k < c.length; k++) cur.wc.push(r); }
    },
    endLine() {
      if (!cur) return;
      flushWord();
      // cuerpo de la línea: el tamaño de la mayoría de sus letras (una raya o una capitular de otro cuerpo
      // no cambian el de la línea)
      if (cur.sz.size) { const [mode, cnt] = [...cur.sz.entries()].sort((a, b) => b[1] - a[1])[0]; const tot = [...cur.sz.values()].reduce((a, b) => a + b, 0); if (cnt / tot >= 0.6) cur.size = mode; }
      // guion de corte separado por un espacio de justificación («feli -»): se pega a la palabra
      const ws = cur.words, lw = ws[ws.length - 1];
      if (ws.length > 1 && lw.t.trim() === "-" && /\p{L}$/u.test(ws[ws.length - 2].t)) {
        const pw = ws[ws.length - 2]; ws.pop();
        ws[ws.length - 1] = { ...pw, t: pw.t + "-", ...(pw.cr ? { cr: [...pw.cr, ...(lw.cr ?? [])] } : {}), r: [Math.min(pw.r[0], lw.r[0]), Math.min(pw.r[1], lw.r[1]), Math.max(pw.r[2], lw.r[2]), Math.max(pw.r[3], lw.r[3])] };
      }
      const text = cur.chars.join("").replace(/\s+/g, " ").trim().replace(/(\p{L})\s+-$/u, "$1-");
      if (text && cur.r) lines.push({ text, r: cur.r, size: Math.round(cur.size * 10) / 10, font: cur.font.replace(/^[A-Z]{6}\+/, ""), bold: /bold|black|heavy|semibold|demi/i.test(cur.font), words: cur.words, block });
      cur = null;
    },
  });
  try { (st as any).destroy?.(); } catch { /* */ }
  lines.sort((a, b) => a.r[1] - b.r[1] || a.r[0] - b.r[0]);
  return { index, trim, lines };
}

export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

// Semejanza entre dos títulos: tolera mayúsculas, acentos, puntuación y versiones abreviadas.
export function sameTitle(a: string, b: string) {
  const x = norm(a).replace(/^(capitulo|parte|libro|cap)\s+[0-9ivxlc]+\s*/, ""), y = norm(b).replace(/^(capitulo|parte|libro|cap)\s+[0-9ivxlc]+\s*/, "");
  if (!x || !y) return false;
  if (x === y) return true;
  // «Registro IV» no es «Registro I» ni «Registro VI»: si los dos terminan en número, tienen que coincidir
  const num = (t: string) => t.match(/\s([0-9]+|[ivxlc]+)$/)?.[1] ?? null;
  const nx = num(x), ny = num(y);
  if (nx && ny && nx !== ny) return false;
  const [s, l] = x.length < y.length ? [x, y] : [y, x];
  if (s.length >= 6 && (" " + l + " ").includes(" " + s + " ") && s.length / l.length >= 0.45) return true;
  const A = new Set(x.split(" ").filter(w => w.length > 2)), B = new Set(y.split(" ").filter(w => w.length > 2));
  if (!A.size || !B.size) return false;
  let inter = 0; A.forEach(w => { if (B.has(w)) inter++; });
  return inter / Math.min(A.size, B.size) >= 0.8 && inter >= 2;
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
export function romanValue(s: string): number | null {
  const t = s.toLowerCase();
  if (!/^[ivxlcdm]{1,7}$/.test(t)) return null;
  let v = 0;
  for (let i = 0; i < t.length; i++) { const a = ROMAN[t[i]], b = ROMAN[t[i + 1]] ?? 0; v += a < b ? -a : a; }
  const back = toRoman(v);
  return back === t ? v : null;
}
function toRoman(n: number) {
  const m: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let s = ""; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s;
}
