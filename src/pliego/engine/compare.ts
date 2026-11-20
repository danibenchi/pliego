// Comparación entre la versión anterior y la actual del PDF: texto (diferencia palabra por
// palabra en todo el libro), texto corrido de página, páginas agregadas o quitadas y cambios gráficos.
import * as mupdf from "mupdf";
import { pageText, PageText, R } from "./text";
import { readAnnots, checkCorrections, Correction, RawAnnot } from "./corrections";

export interface DiffFinding { check: "diffText" | "diffVisual" | "diffReflow" | "diffPages"; page?: number; rect?: R | null; label?: string; item?: string }
export interface CompareResult { findings: DiffFinding[]; changedPages: number; edits: number; tooDifferent: boolean; prevPages: number; corrections: Correction[]; annots: number }

// Diferencia de Myers sobre secuencias de enteros; devuelve los pares coincidentes (índice A, índice B).
function myers(a: Int32Array, b: Int32Array, maxD: number): [number, number][] | null {
  const n = a.length, m = b.length, max = n + m, off = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= Math.min(max, maxD); d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) {
        // reconstruir
        const pairs: [number, number][] = [];
        let cx = n, cy = m;
        for (let dd = d; dd > 0; dd--) {
          const vv = trace[dd]; const kk = cx - cy;
          const prevK = (kk === -dd || (kk !== dd && vv[off + kk - 1] < vv[off + kk + 1])) ? kk + 1 : kk - 1;
          const px = vv[off + prevK], py = px - prevK;
          while (cx > px && cy > py) { cx--; cy--; pairs.push([cx, cy]); }
          cx = px; cy = py;
        }
        while (cx > 0 && cy > 0) { cx--; cy--; pairs.push([cx, cy]); }
        return pairs.reverse();
      }
    }
  }
  return null;
}

// Diferencia completa con memoria acotada: anclas únicas (como el «patience diff») y Myers
// solo en los tramos cortos entre anclas. Los tramos muy largos se toman como reescritos.
export function diffPairs(a: Int32Array, b: Int32Array): [number, number][] {
  const G = 6;
  const key = (arr: Int32Array, i: number) => { let h = ""; for (let k = 0; k < G; k++) h += arr[i + k] + ","; return h; };
  const ca = new Map<string, number>(), cb = new Map<string, number>();
  for (let i = 0; i + G <= a.length; i++) { const k = key(a, i); ca.set(k, ca.has(k) ? -1 : i); }
  for (let i = 0; i + G <= b.length; i++) { const k = key(b, i); cb.set(k, cb.has(k) ? -1 : i); }
  const cand: [number, number][] = [];
  for (const [k, ia] of ca) { if (ia < 0) continue; const ib = cb.get(k); if (ib !== undefined && ib >= 0) cand.push([ia, ib]); }
  cand.sort((x, y) => x[0] - y[0]);
  // subsecuencia creciente más larga sobre las posiciones en B
  const tails: number[] = [], prevIdx = new Int32Array(cand.length).fill(-1), tailIdx: number[] = [];
  for (let i = 0; i < cand.length; i++) {
    const v = cand[i][1]; let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < v) lo = mid + 1; else hi = mid; }
    tails[lo] = v; tailIdx[lo] = i; prevIdx[i] = lo > 0 ? tailIdx[lo - 1] : -1;
  }
  const chain: [number, number][] = [];
  for (let i = tailIdx[tails.length - 1] ?? -1; i >= 0; i = prevIdx[i]) chain.push(cand[i]);
  chain.reverse();
  const pairs: [number, number][] = [];
  let pa = 0, pb = 0;
  const gap = (a0: number, a1: number, b0: number, b1: number) => {
    // prefijo y sufijo comunes del tramo
    while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) pairs.push([a0++, b0++]);
    const tail: [number, number][] = [];
    while (a1 > a0 && b1 > b0 && a[a1 - 1] === b[b1 - 1]) tail.push([--a1, --b1]);
    if (a1 > a0 && b1 > b0 && (a1 - a0) + (b1 - b0) <= 1600) {
      const sub = myers(a.subarray(a0, a1), b.subarray(b0, b1), 800);
      if (sub) for (const [x, y] of sub) pairs.push([x + a0, y + b0]);
    }
    pairs.push(...tail.reverse());
  };
  for (const [ia, ib] of chain) {
    if (ia < pa || ib < pb) continue; // solapado con la anterior
    gap(pa, ia, pb, ib);
    for (let k = 0; k < G; k++) pairs.push([ia + k, ib + k]);
    pa = ia + G; pb = ib + G;
  }
  gap(pa, a.length, pb, b.length);
  return pairs;
}

type Tok = { w: string; page: number; r: R; cr?: R[] };
export const tokens = (pages: PageText[]): Tok[] => {
  const out: Tok[] = [];
  for (const p of pages) for (const l of p.lines) {
    // fuera cabeceras y folios: se mueven con la paginación y no son cambios de texto
    const h = p.trim[3] - p.trim[1], cy = (l.r[1] + l.r[3]) / 2;
    if ((cy < p.trim[1] + h * 0.1 || cy > p.trim[3] - h * 0.1) && l.text.length < 90) continue;
    for (const wd of l.words) {
      let raw = "", rr: R[] = [];
      for (let i = 0; i < wd.t.length; i++) { if (wd.t[i] === "\u00ad") continue; raw += wd.t[i]; if (wd.cr) rr.push(wd.cr[i] ?? wd.r); }
      const w = raw.normalize("NFC");
      if (!w) continue;
      if (wd.cr && w.length !== raw.length) rr = Array.from({ length: w.length }, () => wd.r);
      out.push(wd.cr ? { w, page: p.index, r: wd.r, cr: rr } : { w, page: p.index, r: wd.r });
    }
  }
  return out;
};

export function compareVersions(prevData: Uint8Array, cur: { pdf: any; texts: PageText[] }, onProgress?: (pct: number) => void): CompareResult {
  const prev = mupdf.Document.openDocument(prevData, "application/pdf");
  const np = prev.countPages(), nc = cur.texts.length;
  const prevTexts: PageText[] = [];
  const annots: RawAnnot[] = [];
  for (let i = 0; i < np; i++) {
    const pg: any = prev.loadPage(i);
    // comentarios de la prueba marcada: se leen y se quitan (en memoria) para que no se mezclen con el texto
    const an = readAnnots(pg, i);
    if (an.length) { annots.push(...an); try { for (const a of pg.getAnnotations()) { const t = String(a.getType()); if (!/^(Link|Widget)$/.test(t)) pg.deleteAnnotation(a); } } catch { /* */ } }
    prevTexts.push(pageText(pg, i, pg.getBounds() as R, an.length > 0));
    onProgress?.(5 + (i / np) * 40);
  }
  const findings: DiffFinding[] = [];
  if (np !== nc) findings.push({ check: "diffPages", item: `La versión anterior tenía ${np} páginas; esta tiene ${nc} (${nc > np ? "+" : ""}${nc - np})` });

  const A = tokens(prevTexts), B = tokens(cur.texts);
  const dict = new Map<string, number>();
  const id = (w: string) => { let v = dict.get(w); if (v === undefined) { v = dict.size; dict.set(w, v); } return v; };
  const a = Int32Array.from(A, t => id(t.w)), b = Int32Array.from(B, t => id(t.w));
  onProgress?.(55);
  const pairs = diffPairs(a, b);
  if (pairs.length < Math.min(a.length, b.length) * 0.3 && Math.min(a.length, b.length) > 200) return { findings: [...findings, { check: "diffText", item: "Las dos versiones son demasiado distintas para compararlas palabra por palabra: ¿es el mismo libro?" }], changedPages: 0, edits: 0, tooDifferent: true, prevPages: np, corrections: [], annots: annots.length };
  const corrections = checkCorrections(annots, A, B, pairs);

  // ediciones: tramos entre coincidencias
  const changed = new Set<number>();
  let edits = 0, shown = 0;
  let ia = 0, ib = 0;
  const flushEdit = (a0: number, a1: number, b0: number, b1: number) => {
    if (a1 <= a0 && b1 <= b0) return;
    edits++;
    const del = A.slice(a0, a1).map(t => t.w).join(" "), ins = B.slice(b0, b1).map(t => t.w).join(" ");
    const anchor = b1 > b0 ? B[b0] : B[Math.min(b0, B.length - 1)];
    if (!anchor) return;
    const rs = (b1 > b0 ? B.slice(b0, b1) : [anchor]).filter(t => t.page === anchor.page).map(t => t.r);
    const rect = rs.reduce<R>((x, r) => [Math.min(x[0], r[0]), Math.min(x[1], r[1]), Math.max(x[2], r[2]), Math.max(x[3], r[3])], rs[0]);
    changed.add(anchor.page);
    const cut = (s: string) => s.length > 60 ? s.slice(0, 57) + "…" : s;
    const label = del && ins ? `«${cut(del)}» → «${cut(ins)}»` : del ? `Se quitó «${cut(del)}»` : `Se agregó «${cut(ins)}»`;
    if (shown++ < 300) findings.push({ check: "diffText", page: anchor.page, rect, label, item: `Pág. ${anchor.page + 1}: ${label}` });
  };
  for (const [pa, pb] of pairs) { flushEdit(ia, pa, ib, pb); ia = pa + 1; ib = pb + 1; }
  flushEdit(ia, A.length, ib, B.length);

  // texto corrido: para cada página actual, en qué página anterior estaba su primera palabra
  const mapBA = new Int32Array(B.length).fill(-1);
  for (const [pa, pb] of pairs) mapBA[pb] = pa;
  const firstTok = new Map<number, number>();
  B.forEach((t, k) => { if (!firstTok.has(t.page)) firstTok.set(t.page, k); });
  let lastShift = 0;
  const shifted = new Set<number>();
  for (let p = 0; p < nc; p++) {
    const k = firstTok.get(p); if (k === undefined) continue;
    let j = k; while (j < B.length && mapBA[j] < 0 && B[j].page === p) j++;
    if (j >= B.length || mapBA[j] < 0) continue;
    const shift = p - A[mapBA[j]].page;
    if (shift !== 0) shifted.add(p);
    if (shift !== lastShift) {
      const txt = shift === 0 ? `Desde la pág. ${p + 1} el texto vuelve a empezar en la misma página que antes`
        : `Desde la pág. ${p + 1} el texto está ${Math.abs(shift)} página${Math.abs(shift) > 1 ? "s" : ""} ${shift > 0 ? "más adelante" : "más atrás"} que en la versión anterior`;
      findings.push({ check: "diffReflow", page: p, rect: cur.texts[p].lines[0]?.r ?? null, label: txt, item: txt });
      lastShift = shift;
    }
  }

  // cambios gráficos en páginas que siguen en el mismo lugar y no tienen cambios de texto
  const s = 36 / 72;
  for (let p = 0; p < Math.min(np, nc); p++) {
    if (changed.has(p) || shifted.has(p)) continue;
    onProgress?.(60 + (p / nc) * 38);
    try {
      const pa = (prev.loadPage(p) as any).toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceGray, false, false);
      const pb = cur.pdf.loadPage(p).toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceGray, false, false);
      if (pa.getWidth() !== pb.getWidth() || pa.getHeight() !== pb.getHeight()) continue;
      const w = pa.getWidth(), h = pa.getHeight(), sa = pa.getStride(), sb = pb.getStride(), A1 = pa.getPixels(), B1 = pb.getPixels();
      let cnt = 0; let box: R | null = null;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (Math.abs(A1[y * sa + x] - B1[y * sb + x]) > 48) {
          cnt++;
          const X = x / s, Y = y / s;
          box = box ? [Math.min(box[0], X), Math.min(box[1], Y), Math.max(box[2], X + 2), Math.max(box[3], Y + 2)] : [X, Y, X + 2, Y + 2];
        }
      }
      if (cnt > w * h * 0.002 && box) { const b0 = pb.getBounds(); findings.push({ check: "diffVisual", page: p, rect: [box[0] + b0[0] / s, box[1] + b0[1] / s, box[2] + b0[0] / s, box[3] + b0[1] / s], label: "Cambio gráfico" }); changed.add(p); }
    } catch { /* página que no se pudo comparar */ }
  }
  onProgress?.(100);
  return { findings, changedPages: changed.size, edits, tooDifferent: false, prevPages: np, corrections, annots: annots.length };
}
