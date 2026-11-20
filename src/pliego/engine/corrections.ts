// ¿Se aplicaron las correcciones? Lee los comentarios de la prueba marcada (tachar, reemplazar,
// insertar, resaltar con nota, notas adhesivas, dibujos) y verifica cada uno en la versión nueva,
// usando la alineación palabra por palabra entre las dos versiones.
import type { R } from "./text";

export type CorrKind = "replace" | "delete" | "insert" | "note";
export type CorrStatus = "applied" | "missing" | "different" | "manual" | "lost";
export interface Correction {
  kind: CorrKind; status: CorrStatus; prevPage: number; page: number | null; rect: R | null;
  marked: string; want: string; got?: string; comment?: string; hint?: string; author?: string;
}
export interface RawAnnot { page: number; type: string; contents: string; author: string; rect: R; quads: R[]; num: number; irt: number | null; rt: string | null }
export interface Tok { w: string; page: number; r: R; cr?: R[] }

const SKIP = /^(Popup|Link|Widget|PrinterMark|TrapNet|Watermark|3D|Sound|Movie|Screen|FileAttachment|RichMedia|Projection)$/;
const DELETE_WORDS = /^\s*(suprimir|suprímase|eliminar|elimin[aá]|quitar|quit[aá]|borrar|borr[aá]|sobra|fuera|tachar|delete|del)\s*[.!]?\s*$/i;
const INSTRUCTION = /^\s*(cursiva|it[aá]lica|negrita|redonda|versalitas?|may[uú]scula|min[uú]scula|subray|sangr|punto y aparte|aparte|¶|unir|juntar|separar|espacio|ver\b|ojo|revisar|consultar|verificar|chequear|comprobar|confirmar|duda|nota|¿|\?|cambiar orden|invertir|alinear|centrar|justificar|interlinea|cuerpo|tama[nñ]o|fuente|tipograf)/i;
const QUOTED = /[«"“']\s*(.+?)\s*[»"”']\s*(?:por|→|->|=>|>)\s*[«"“']\s*(.*?)\s*[»"”']/;

const norm = (s: string) => s.normalize("NFC").replace(/([a-záéíóúüñ])-\s+([a-záéíóúüñ])/g, "$1$2").replace(/[\s­]+/g, "");
const cut = (s: string, n = 48) => s.length > n ? s.slice(0, n - 1) + "…" : s;
const inside = (r: R, q: R, pad = 1) => { const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2; return cx >= q[0] - pad && cx <= q[2] + pad && cy >= q[1] - pad && cy <= q[3] + pad; };
const overlap = (a: R, b: R) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

// Lee los comentarios de una página antes de quitarlos (se quitan para que no ensucien el texto).
export function readAnnots(page: any, index: number): RawAnnot[] {
  const out: RawAnnot[] = [];
  let list: any[] = [];
  try { list = page.getAnnotations(); } catch { return out; }
  for (const a of list) {
    let type = ""; try { type = String(a.getType()); } catch { continue; }
    if (SKIP.test(type)) continue;
    let contents = "", author = ""; try { contents = a.getContents() ?? ""; } catch { /* */ } try { author = a.getAuthor() ?? ""; } catch { /* */ }
    let rect: R = [0, 0, 0, 0]; try { rect = a.getRect() as R; } catch { try { rect = a.getBounds() as R; } catch { /* */ } }
    const quads: R[] = [];
    try { if (a.hasQuadPoints()) for (const q of a.getQuadPoints()) { const xs = [q[0], q[2], q[4], q[6]], ys = [q[1], q[3], q[5], q[7]]; quads.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]); } } catch { /* */ }
    let num = -1, irt: number | null = null, rt: string | null = null;
    try {
      const o = a.getObject(); num = o.isIndirect() ? o.asIndirect() : -1;
      const i = o.get("IRT"); if (i && i.isIndirect()) irt = i.asIndirect();
      const r = o.get("RT"); if (r && r.isName()) rt = r.asName();
    } catch { /* */ }
    out.push({ page: index, type, contents: contents.replace(/\r/g, "\n").trim() ? contents.replace(/\r/g, "\n") : "", author, rect, quads, num, irt, rt });
  }
  return out;
}

export function checkCorrections(annots: RawAnnot[], A: Tok[], B: Tok[], pairs: [number, number][]): Correction[] {
  if (!annots.length) return [];
  // cadena de la versión anterior y posición de cada palabra
  const start = new Int32Array(A.length); let pos = 0;
  A.forEach((t, i) => { start[i] = pos; pos += t.w.length + 1; });
  const P = A.map(t => t.w).join(" ");
  const tokOf = (off: number) => { let lo = 0, hi = A.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (start[m] <= off) lo = m; else hi = m - 1; } return lo; };
  const map = new Int32Array(A.length).fill(-1);
  for (const [a, b] of pairs) map[a] = b;
  const byPage = new Map<number, number[]>();
  A.forEach((t, i) => { const l = byPage.get(t.page); if (l) l.push(i); else byPage.set(t.page, [i]); });

  // respuestas y agrupaciones: el «reemplazar» de Acrobat es un tachado agrupado con un signo de intercalación
  const byNum = new Map<number, RawAnnot>(); annots.forEach(a => { if (a.num >= 0) byNum.set(a.num, a); });
  const used = new Set<RawAnnot>();
  const replies = annots.filter(a => a.irt !== null && a.rt !== "Group");
  replies.forEach(r => used.add(r));
  // intercalaciones que forman parte de un «reemplazar» (agrupadas con un tachado)
  const groupedCaret = new Map<RawAnnot, RawAnnot>();
  for (const a of annots) {
    if (a.type !== "StrikeOut") continue;
    const g = a.irt !== null ? byNum.get(a.irt) : undefined;
    const c = g && g.type === "Caret" ? g : annots.find(x => x.type === "Caret" && x.irt === a.num && x.rt === "Group");
    if (c) { groupedCaret.set(a, c); used.add(c); }
  }

  type Job = { kind: CorrKind; s: number; e: number; repl: string; a: RawAnnot; comment?: string };
  const jobs: Job[] = [];
  const notes: { a: RawAnnot; toks: number[]; comment: string; marked: string; why?: string }[] = [];

  const markedSpan = (a: RawAnnot): [number, number] | null => {
    const ids = byPage.get(a.page) ?? [];
    let s = -1, e = -1;
    const boxes = a.quads.length ? a.quads : [a.rect];
    for (const i of ids) {
      const t = A[i], cr = t.cr ?? [];
      for (let c = 0; c < t.w.length; c++) {
        const r = cr[c] ?? t.r;
        if (boxes.some(q => inside(r, q))) { const off = start[i] + c; if (s < 0 || off < s) s = off; if (off + 1 > e) e = off + 1; }
      }
    }
    return s < 0 ? null : [s, e];
  };
  const caretPoint = (a: RawAnnot): number | null => {
    const ids = byPage.get(a.page) ?? [];
    const cx = (a.rect[0] + a.rect[2]) / 2, cy = (a.rect[1] + a.rect[3]) / 2;
    let best: number | null = null, bestX = -1e9, first: { off: number; x: number } | null = null;
    for (const i of ids) {
      const t = A[i]; if (!(t.r[1] - 1 <= cy && t.r[3] + 1 >= cy)) continue;
      const cr = t.cr ?? [];
      for (let c = 0; c < t.w.length; c++) {
        const r = cr[c] ?? t.r, mid = (r[0] + r[2]) / 2;
        if (mid <= cx && r[2] > bestX) { bestX = r[2]; best = start[i] + c + 1; }
        if (!first || r[0] < first.x) first = { off: start[i] + c, x: r[0] };
      }
    }
    if (best === null && first) return first.off;
    // si cae en el espacio después de una palabra, la inserción va después del espacio
    if (best !== null && P[best] === " " && cx > bestX + 1.2) return best + 1;
    return best;
  };
  const tokensIn = (a: RawAnnot) => {
    const ids = byPage.get(a.page) ?? [];
    if (a.type === "Text") {
      // nota adhesiva: la línea más cercana al icono
      const cy = a.rect[1] + Math.min(5, (a.rect[3] - a.rect[1]) / 3); // el clic queda arriba a la izquierda del icono
      let bestD = 1e9, line: number[] = [];
      for (const i of ids) { const t = A[i]; const d = Math.abs((t.r[1] + t.r[3]) / 2 - cy) * 3 + Math.max(0, t.r[0] - a.rect[2]) * 0.2; if (d < bestD - 0.5) { bestD = d; line = [i]; } else if (Math.abs(d - bestD) < 6) line.push(i); }
      const y = line.length ? A[line[0]].r : null;
      return y ? ids.filter(i => Math.abs(A[i].r[1] - y[1]) < 3) : [];
    }
    const boxes = a.quads.length ? a.quads : [a.rect];
    return ids.filter(i => boxes.some(q => overlap(A[i].r, q)));
  };

  for (const a of annots) {
    if (used.has(a)) continue;
    const content = a.contents.trim();
    if (a.type === "StrikeOut") {
      const sp = markedSpan(a); if (!sp) { notes.push({ a, toks: tokensIn(a), comment: content || "Tachado", marked: "" }); continue; }
      let repl = groupedCaret.get(a)?.contents ?? "";
      if (!repl && content && !DELETE_WORDS.test(content)) repl = a.contents;
      jobs.push({ kind: repl ? "replace" : "delete", s: sp[0], e: sp[1], repl, a });
    } else if (a.type === "Caret") {
      if (!content || /^(¶|aparte|punto y aparte)$/i.test(content)) { notes.push({ a, toks: tokensIn(a), comment: content || "Intercalación sin texto", marked: "" }); continue; }
      const pt = caretPoint(a); if (pt === null) { notes.push({ a, toks: [], comment: content, marked: "", why: "lost" }); continue; }
      jobs.push({ kind: "insert", s: pt, e: pt, repl: a.contents.replace(/\n/g, " "), a });
    } else if (/^(Highlight|Underline|Squiggly)$/.test(a.type)) {
      const sp = markedSpan(a);
      const marked = sp ? P.slice(sp[0], sp[1]) : "";
      const q = content.match(QUOTED);
      if (sp && q) jobs.push({ kind: q[2] ? "replace" : "delete", s: sp[0], e: sp[1], repl: q[2], a, comment: content });
      else if (sp && DELETE_WORDS.test(content)) jobs.push({ kind: "delete", s: sp[0], e: sp[1], repl: "", a, comment: content });
      else if (sp && content && !INSTRUCTION.test(content) && content.length <= 40 && content.split(/\s+/).length <= 5 && !/[?¿]/.test(content) && norm(content) !== norm(marked))
        jobs.push({ kind: "replace", s: sp[0], e: sp[1], repl: content, a, comment: content });
      else notes.push({ a, toks: tokensIn(a), comment: content || (a.type === "Highlight" ? "Resaltado sin comentario" : "Subrayado sin comentario"), marked });
    } else {
      notes.push({ a, toks: tokensIn(a), comment: content || ({ Text: "Nota sin texto", FreeText: "Texto sobre la página", Ink: "Marca a mano alzada", Square: "Recuadro", Circle: "Círculo", Line: "Línea", Polygon: "Polígono", PolyLine: "Trazo" } as Record<string, string>)[a.type] || a.type, marked: "" });
    }
  }

  // contexto en la versión nueva: anclas confiables a cada lado
  const anchor = (from: number, dir: -1 | 1, need = 3) => {
    let found = 0, last = -1;
    for (let i = from, steps = 0; i >= 0 && i < A.length && steps < 80; i += dir, steps++) if (map[i] >= 0) { found++; last = i; if (found >= need) break; }
    return last;
  };
  const near = (from: number, dir: -1 | 1) => { for (let i = from, k = 0; i >= 0 && i < A.length && k < 80; i += dir, k++) if (map[i] >= 0) return i; return -1; };
  const where = (bs: number, be: number, fallback: number): { page: number | null; rect: R | null } => {
    const toks = B.slice(bs, be);
    const pick = toks.length ? toks : (B[fallback] ? [B[fallback]] : []);
    if (!pick.length) return { page: null, rect: null };
    const pg = pick[0].page, rs = pick.filter(t => t.page === pg).map(t => t.r);
    return { page: pg, rect: rs.reduce<R>((x, r) => [Math.min(x[0], r[0]), Math.min(x[1], r[1]), Math.max(x[2], r[2]), Math.max(x[3], r[3])], rs[0]) };
  };

  jobs.sort((x, y) => x.s - y.s);
  const out: Correction[] = [];
  jobs.forEach((j, k) => {
    const ts = tokOf(Math.max(0, j.kind === "insert" ? j.s - 1 : j.s)), te = tokOf(Math.max(0, (j.kind === "insert" ? j.s : j.e) - 1));
    const aB = anchor(ts - 1, -1), aA = anchor(te + 1, 1);
    const marked = P.slice(j.s, j.e);
    const base: Correction = { kind: j.kind, status: "lost", prevPage: j.a.page, page: null, rect: null, marked, want: j.repl, comment: j.comment, author: j.a.author || undefined };
    if (aB < 0 && aA < 0) { out.push(base); return; }
    const pS = aB >= 0 ? start[aB] : 0, pE = aA >= 0 ? start[aA] + A[aA].w.length : P.length;
    const nS = aB >= 0 ? map[aB] : Math.max(0, map[aA] - (aA - 0)), nE = aA >= 0 ? map[aA] + 1 : B.length;
    if (nE - nS > 400 || nE <= nS) { out.push(base); return; }
    const prevR = P.slice(pS, pE), newR = B.slice(nS, nE).map(t => t.w).join(" ");
    // ventana de contexto que no se mete en la corrección vecina
    const lo = Math.max(pS, k > 0 ? jobs[k - 1].e : pS), hi = Math.min(pE, k + 1 < jobs.length ? jobs[k + 1].s : pE);
    const W = 16;
    const L = P.slice(Math.max(lo, j.s - W), j.s), Rr = P.slice(j.e, Math.min(hi, j.e + W));
    const want = norm(L + j.repl + Rr), old = norm(L + marked + Rr), nn = norm(newR);
    const bN = near(ts - 1, -1), aN = near(te + 1, 1);
    const gs = bN >= 0 ? map[bN] + 1 : nS, ge = aN >= 0 ? map[aN] : nE;
    const got = B.slice(gs, Math.max(gs, ge)).map(t => t.w).join(" ");
    const loc = where(gs, Math.max(gs, ge), bN >= 0 ? map[bN] : nS);
    let status: CorrStatus;
    if (want !== old && nn.includes(want) && !(marked && nn.includes(old))) status = "applied";
    else if (nn.includes(old) && want !== old) status = "missing";
    else if (prevR && norm(prevR) === nn) status = "missing";
    else status = "different";
    out.push({ ...base, status, page: loc.page, rect: loc.rect, got });
  });

  for (const n of notes) {
    const base: Correction = { kind: "note", status: n.why === "lost" ? "lost" : "manual", prevPage: n.a.page, page: null, rect: null, marked: n.marked || n.toks.map(i => A[i].w).join(" "), want: "", comment: n.comment, author: n.a.author || undefined };
    if (!n.toks.length) { out.push(base); continue; }
    const t0 = Math.min(...n.toks), t1 = Math.max(...n.toks);
    const bN = near(t0 - 1, -1), aN = near(t1 + 1, 1);
    if (bN < 0 && aN < 0) { out.push(base); continue; }
    const gs = bN >= 0 ? map[bN] + 1 : 0, ge = aN >= 0 ? map[aN] : B.length;
    if (ge - gs > 200) { out.push(base); continue; }
    const prevTxt = A.slice(t0, t1 + 1).map(t => t.w).join(" "), newTxt = B.slice(gs, Math.max(gs, ge)).map(t => t.w).join(" ");
    const loc = where(gs, Math.max(gs, ge), bN >= 0 ? map[bN] : 0);
    out.push({ ...base, page: loc.page, rect: loc.rect, got: newTxt, hint: norm(prevTxt) === norm(newTxt) ? "el texto de esa zona sigue igual" : "el texto de esa zona cambió" });
  }
  return out.sort((x, y) => x.prevPage - y.prevPage);
}

export function describe(c: Correction): string {
  const pg = `Pág. ${c.page !== null ? c.page + 1 : "?"}${c.page !== c.prevPage ? ` (en la prueba, ${c.prevPage + 1})` : ""}`;
  const m = cut(c.marked), w = cut(c.want), g = cut(c.got ?? "");
  const ask = c.kind === "delete" ? `quitar «${m}»` : c.kind === "insert" ? `agregar «${w.trim()}»` : c.kind === "replace" ? `cambiar «${m}» por «${w}»` : `«${cut(c.comment ?? "", 70)}»${m ? ` sobre «${m}»` : ""}`;
  if (c.status === "missing") return `${pg}: pedía ${ask}; sigue igual`;
  if (c.status === "different") return `${pg}: pedía ${ask}; quedó «${g || "(nada)"}»`;
  if (c.status === "lost") return `Pág. ${c.prevPage + 1} de la prueba: ${ask}`;
  if (c.status === "manual") return `${pg}: ${ask}${c.hint ? ` · ${c.hint}` : ""}`;
  return `${pg}: ${ask}`;
}
