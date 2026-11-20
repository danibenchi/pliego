import { VERSION } from "../version";
// Informe en PDF, generado en el navegador con pdf-lib (MIT) y Geist (OFL). No sale nada del equipo.
import { PDFDocument, PDFFont, PDFPage, rgb, RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Report, Finding } from "../engine/analyze";
import { resolve, Sev } from "../engine/profiles";
import { GROUPS } from "../engine/copy";
import { COUNTRY_NAME } from "../engine/book";
import type { Applied } from "./review";
import { REV_LABEL } from "./review";
import { SCOPE } from "./bits";
import { appFix, AppId } from "../engine/fixes";

export interface Thumb { page: number; jpg: Uint8Array; w: number; h: number; labels: string[] }
export interface PdfInput { report: Report; applied: Applied; diff?: { name: string; findings: Finding[]; corr?: { total: number; applied: number; missing: number; different: number; manual: number; lost: number } } | null; thumbs: Thumb[]; costs?: string[]; app?: { id: AppId; name: string } | null; orig?: { name: string; words: number; matched: number; missing: number; extra: number; changed: number; notes: number; notesMissing: number } | null }
export interface BatchRow { name: string; pages: number; format: string; verdict: Sev; counts: { error: number; warn: number; info: number } }

const A4: [number, number] = [595.28, 841.89];
const M = 48, W = A4[0] - 2 * M;
const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const C = {
  ink: hex("#121416"), muted: hex("#5d646d"), faint: hex("#8a9099"), line: hex("#e4e5e2"), panel: hex("#f6f6f4"),
  error: hex("#e11d48"), warn: hex("#e89a00"), info: hex("#64748b"), ok: hex("#0d9a6b"),
  errBg: hex("#fff1f3"), warnBg: hex("#fff8e8"), okBg: hex("#ecfaf3"), cy: hex("#00a3e0"), mg: hex("#e5007d"), ye: hex("#ffd400"),
};
const SEVC: Record<Sev, RGB> = { error: C.error, warn: C.warn, info: C.info, ok: C.ok };
const SEVBG: Record<Sev, RGB> = { error: C.errBg, warn: C.warnBg, info: C.panel, ok: C.okBg };
const SEVL: Record<Sev, string> = { error: "Bloqueante", warn: "Revisar", info: "Para saber", ok: "Correcto" };
const VERDICT: Record<Sev, [string, string]> = {
  error: ["No está listo para imprenta", "Hay problemas que la imprenta va a rechazar o que se van a ver en el papel."],
  warn: ["Listo, con observaciones", "Nada impide imprimir, pero conviene revisar estos puntos antes de mandar el archivo."],
  info: ["Listo para imprenta", "No encontré problemas. Quedan algunas notas."],
  ok: ["Listo para imprenta", "Pasó todos los controles del perfil elegido."],
};
const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("es", { maximumFractionDigits: 1 });
const clean = (s: string) => s.replace(/✓/g, "(ok)").replace(/[\u200b\u00ad\ufffd]/g, "");

class Writer {
  doc: PDFDocument; f: { r: PDFFont; m: PDFFont; b: PDFFont; mono: PDFFont };
  page!: PDFPage; y = 0; title: string;
  constructor(doc: PDFDocument, f: Writer["f"], title: string) { this.doc = doc; this.f = f; this.title = title; this.newPage(); }
  newPage() { this.page = this.doc.addPage(A4); this.y = M; }
  ensure(h: number) { if (this.y + h > A4[1] - M - 18) { this.newPage(); return true; } return false; }
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const word of para.split(/ +/)) {
        const cand = line ? line + " " + word : word;
        if (font.widthOfTextAtSize(cand, size) <= width) { line = cand; continue; }
        if (line) out.push(line);
        if (font.widthOfTextAtSize(word, size) > width) {
          let chunk = "";
          for (const ch of word) { if (font.widthOfTextAtSize(chunk + ch, size) > width) { out.push(chunk); chunk = ch; } else chunk += ch; }
          line = chunk;
        } else line = word;
      }
      out.push(line);
    }
    return out;
  }
  text(s: string, o: { font?: PDFFont; size?: number; color?: RGB; x?: number; width?: number; lh?: number; bar?: RGB; after?: number } = {}) {
    const font = o.font ?? this.f.r, size = o.size ?? 10, x = o.x ?? M, width = o.width ?? (M + W - x), lh = o.lh ?? size * 1.38;
    for (const ln of this.wrap(s, font, size, width)) {
      this.ensure(lh);
      if (o.bar) this.page.drawRectangle({ x: M, y: A4[1] - this.y - lh, width: 2.5, height: lh, color: o.bar });
      this.page.drawText(ln, { x, y: A4[1] - this.y - size * 1.02, size, font, color: o.color ?? C.ink });
      this.y += lh;
    }
    this.y += o.after ?? 0;
  }
  rule(gap = 10) { this.ensure(gap * 2); this.y += gap; this.page.drawLine({ start: { x: M, y: A4[1] - this.y }, end: { x: M + W, y: A4[1] - this.y }, thickness: 0.6, color: C.line }); this.y += gap; }
  h2(s: string) { this.ensure(48); this.y += 10; this.text(s, { font: this.f.b, size: 14, after: 6 }); }
  h3(s: string) { this.ensure(30); this.y += 4; this.text(s.toUpperCase(), { font: this.f.m, size: 7.5, color: C.muted, after: 3 }); }
  kv(rows: [string, string][], bar?: RGB) {
    for (const [k, v] of rows) {
      const lines = this.wrap(v, this.f.r, 9.5, W - 150);
      const h = lines.length * 13 + 4;
      this.ensure(h);
      if (bar) this.page.drawRectangle({ x: M, y: A4[1] - this.y - h, width: 2.5, height: h, color: bar });
      this.page.drawText(clean(k), { x: M + (bar ? 12 : 0), y: A4[1] - this.y - 10, size: 9, font: this.f.r, color: C.muted });
      lines.forEach((l, i) => this.page.drawText(l, { x: M + 150, y: A4[1] - this.y - 10 - i * 13, size: 9.5, font: this.f.r, color: C.ink }));
      this.y += h;
      this.page.drawLine({ start: { x: M + (bar ? 12 : 0), y: A4[1] - this.y + 1 }, end: { x: M + W, y: A4[1] - this.y + 1 }, thickness: 0.4, color: C.line });
    }
  }
  logo(x: number, yTop: number, s: number) {
    const p = this.page, cx = x + s / 2, cy = A4[1] - yTop - s / 2, k = s / 32;
    p.drawCircle({ x: cx, y: cy, size: 9.5 * k, borderColor: C.ink, borderWidth: 1.4 * k });
    p.drawCircle({ x: cx, y: cy, size: 4.6 * k, borderColor: C.ink, borderWidth: 1.4 * k });
    p.drawLine({ start: { x: cx, y: cy - 14.5 * k }, end: { x: cx, y: cy + 14.5 * k }, thickness: 1.4 * k, color: C.ink });
    p.drawLine({ start: { x: cx - 14.5 * k, y: cy }, end: { x: cx + 14.5 * k, y: cy }, thickness: 1.4 * k, color: C.ink });
    const r = 4.6 * k;
    const quad = (a0: number, col: RGB) => {
      let d = `M ${cx} ${-cy} `; const n = 10;
      for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * (i / n); d += `L ${cx + r * Math.cos(a)} ${-(cy + r * Math.sin(a))} `; }
      p.drawSvgPath(d + "Z", { x: 0, y: 0, color: col, borderWidth: 0 });
    };
    quad(0, C.cy); quad(-Math.PI / 2, C.mg); quad(Math.PI, C.ye);
  }
}

async function fonts(doc: PDFDocument) {
  doc.registerFontkit(fontkit);
  const F = await import("../assets/fonts");
  const b = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const [r, m, sb, mono] = await Promise.all([F.REGULAR, F.MEDIUM, F.SEMIBOLD, F.MONO].map(x => doc.embedFont(b(x), { subset: true })));
  return { r, m, b: sb, mono };
}

function cover(w: Writer, title: string, sub: string) {
  w.logo(M, M - 4, 26);
  w.page.drawText("Pliego", { x: M + 34, y: A4[1] - M - 9, size: 12, font: w.f.b, color: C.ink });
  w.page.drawText("Preflight de imprenta · Academia Proyecto451", { x: M + 34, y: A4[1] - M - 21, size: 8, font: w.f.r, color: C.muted });
  const date = new Date().toLocaleString("es", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const dw = w.f.r.widthOfTextAtSize(date, 8.5);
  w.page.drawText(date, { x: M + W - dw, y: A4[1] - M - 14, size: 8.5, font: w.f.r, color: C.muted });
  // tira CMYK
  ["#00a3e0", "#e5007d", "#ffd400", "#141618"].forEach((c, i) => w.page.drawRectangle({ x: M + i * 14, y: A4[1] - M - 44, width: 12, height: 5, color: hex(c) }));
  w.y = M + 62;
  w.text(title, { font: w.f.b, size: 21, lh: 25, after: 4 });
  w.text(sub, { size: 10, color: C.muted, after: 14 });
}

function verdictBox(w: Writer, sev: Sev, counts: Applied["counts"], passed: number, marked: number) {
  const [t, s] = VERDICT[sev];
  const h = 74;
  w.ensure(h + 10);
  const top = A4[1] - w.y;
  w.page.drawRectangle({ x: M, y: top - h, width: W, height: h, color: SEVBG[sev] });
  w.page.drawRectangle({ x: M, y: top - h, width: 4, height: h, color: SEVC[sev] });
  w.page.drawText(t, { x: M + 16, y: top - 24, size: 15, font: w.f.b, color: SEVC[sev] === C.info ? C.ink : SEVC[sev] });
  w.page.drawText(s, { x: M + 16, y: top - 40, size: 9, font: w.f.r, color: C.muted });
  const items: [string, string, RGB][] = [[String(counts.error), "bloqueantes", C.error], [String(counts.warn), "a revisar", C.warn], [String(counts.info), "notas", C.info], [String(passed), "superados", C.ok]];
  if (marked) items.push([String(marked), "marcados por el editor", C.muted]);
  let x = M + 16;
  for (const [n, l, c] of items) {
    w.page.drawText(n, { x, y: top - 62, size: 13, font: w.f.b, color: c });
    const nw = w.f.b.widthOfTextAtSize(n, 13);
    w.page.drawText(l, { x: x + nw + 4, y: top - 61, size: 8.5, font: w.f.r, color: C.muted });
    x += nw + 4 + w.f.r.widthOfTextAtSize(l, 8.5) + 18;
  }
  w.y += h + 14;
}

function finding(w: Writer, f: Finding, opts: { compact?: boolean; app?: { id: AppId; name: string } | null } = {}) {
  w.ensure(56);
  w.y += 6;
  const bar = SEVC[f.sev];
  w.text(`${GROUPS[f.group] ?? f.group} · ${SEVL[f.sev]}`.toUpperCase(), { font: w.f.m, size: 7, color: C.muted, x: M + 12, bar, lh: 11 });
  w.text(f.title, { font: w.f.b, size: 11.5, x: M + 12, bar, lh: 15 });
  if (f.detail) w.text(f.detail, { size: 9.5, x: M + 12, bar, color: C.ink });
  const items = f.items ?? [];
  for (const it of items.slice(0, opts.compact ? 8 : 40)) w.text("· " + it, { size: 9, x: M + 20, width: W - 20, bar, color: C.ink, lh: 12.5 });
  if (items.length > (opts.compact ? 8 : 40)) w.text(`y ${items.length - (opts.compact ? 8 : 40)} más`, { size: 9, x: M + 20, bar, color: C.muted });
  if (f.pages.length) {
    const ps = f.pages.map(p => p + 1);
    w.text((ps.length === 1 ? "Página " : "Páginas ") + (ps.length > 60 ? ps.slice(0, 60).join(", ") + "…" : ps.join(", ")), { size: 8.5, x: M + 12, bar, color: C.muted, lh: 12 });
  }
  if (!opts.compact) {
    w.text("Qué pasa en imprenta", { font: w.f.m, size: 8.5, x: M + 12, bar, color: C.muted, lh: 13 });
    w.text(f.impact, { size: 9, x: M + 12, bar, lh: 12.5 });
    const af = opts.app ? appFix(opts.app.id, f.check) : null;
    w.text(af ? `Cómo se arregla en ${opts.app!.name}` : "Cómo se arregla", { font: w.f.m, size: 8.5, x: M + 12, bar, color: C.muted, lh: 13 });
    w.text(af ?? f.fix, { size: 9, x: M + 12, bar, lh: 12.5 });
  }
  w.y += 8;
}

function thumbs(w: Writer, doc: PDFDocument, list: Thumb[]) {
  return (async () => {
    if (!list.length) return;
    w.h2("Dónde están los problemas");
    const wide = list[0].w > list[0].h * 1.15;
    const cols = wide ? 1 : 3, gap = 14, cw = (W - gap * (cols - 1)) / cols;
    let col = 0, rowH = 0;
    for (const t of list) {
      const img = await doc.embedJpg(t.jpg);
      const ih = cw * t.h / t.w;
      const capLines = w.wrap(`Pág. ${t.page + 1} · ${t.labels.join(" · ")}`, w.f.r, 7.5, cw).slice(0, 3);
      const cellH = ih + 6 + capLines.length * 10;
      if (col === 0) { if (w.ensure(cellH + 8)) { /* página nueva */ } rowH = 0; }
      const x = M + col * (cw + gap), top = A4[1] - w.y;
      w.page.drawImage(img, { x, y: top - ih, width: cw, height: ih });
      w.page.drawRectangle({ x, y: top - ih, width: cw, height: ih, borderColor: C.line, borderWidth: 0.6 });
      capLines.forEach((l, i) => w.page.drawText(l, { x, y: top - ih - 12 - i * 10, size: 7.5, font: w.f.r, color: C.muted }));
      rowH = Math.max(rowH, cellH);
      col++;
      if (col === cols) { col = 0; w.y += rowH + 12; }
    }
    if (col) w.y += rowH + 12;
  })();
}

function data(w: Writer, r: Report, costs?: string[]) {
  const { system, content } = resolve(r.profile);
  const fi = r.file;
  w.h2("Datos del archivo");
  w.kv([
    ["Archivo", fi.name], ["Peso", `${(fi.size / 1048576).toFixed(1).replace(".", ",")} MB`], ["Versión de PDF", fi.version],
    ["Estándar", fi.pdfx ?? "Sin PDF/X"], ["Perfil de salida", fi.outputIntent ?? "Sin declarar"], ["Color simulado con", r.color.name],
    ["Formato", fi.formatMm + (fi.formatName ? ` · ${fi.formatName}` : "")], ["Páginas", String(fi.pages)],
    ...(fi.producer || fi.creator ? [["Generado con", [fi.creator, fi.producer].filter(Boolean).join(" · ")] as [string, string]] : []),
    ["Perfil de revisión", `${system.name} · ${content.name} · ${COUNTRY_NAME[r.profile.country] ?? "Otro país"}`],
  ]);
  if (costs?.length) { w.h3("Lo que cuesta"); for (const c of costs) w.text("· " + c, { size: 9, x: M + 8, width: W - 8, after: 2 }); }
  w.h3(r.pdfxCheck.declared ? `Reglas de ${r.pdfxCheck.target}` : `Reglas principales de ${r.pdfxCheck.target}`);
  for (const x of r.pdfxCheck.rules) w.text(`${x.ok ? "Cumple" : "Falta"} · ${x.label}${x.detail && !x.ok && !/^falta$/i.test(x.detail) ? ` (${x.detail})` : ""}`, { size: 9, color: x.ok ? C.ink : C.error, lh: 12.5 });
  if (r.spots.length || r.technical.length) { w.h3("Tintas planas y técnicas"); w.text([...r.spots, ...r.technical].join(" · "), { size: 9 }); }
  if (r.fonts.length) { w.h3(`Fuentes (${r.fonts.length})`); for (const f of r.fonts.slice(0, 40)) w.text(`${f.name} · ${f.embedded ? "incrustada" : "SIN INCRUSTAR"} · ${f.type}`, { size: 8.5, color: f.embedded ? C.ink : C.error, lh: 12 }); }
  if (r.isbns.length) { w.h3("ISBN"); for (const s of r.isbns) w.text(`${s.value} · ${s.valid ? "dígito de control correcto" : "dígito de control inválido"} · pág. ${s.pages.map(p => p + 1).join(", ")}`, { size: 9, color: s.valid ? C.ink : C.error }); }
  if (r.spine) { w.h3("Lomo"); w.text(`En la cubierta: ${fmt(r.spine.actual)} mm · calculado: ${fmt(r.spine.expected)} mm (${r.spine.pages} págs. en ${r.spine.paper})`, { size: 9 }); }
  if (r.coverGeo) { w.h3("Medidas de la cubierta"); w.text(r.coverGeo.breakdown, { size: 9 }); w.text(r.coverGeo.panels.map(p => `${p.name} ${fmt(p.x1 - p.x0)} mm`).join(" · "), { size: 9, color: C.muted }); }
  if (r.barcode) {
    const b = r.barcode;
    w.h3("Código de barras");
    w.text(`${b.digits}${b.addon ? " + " + b.addon : ""} · ${Math.round(b.magnification * 100)} % del nominal · alto ${fmt(b.heightMm)} mm · márgenes ${b.quietLeft && b.quietRight ? "correctos" : "insuficientes"}`, { size: 9 });
  }
  if (r.book) {
    const b = r.book, off = b.folioOffset;
    w.h3("Composición del libro");
    w.kv([
      ["Cuerpo de texto", `${fmt(b.bodySize)} pt`],
      ["Folios", off === null ? "No detecté folios" : off === 0 ? "Coinciden con la página del PDF" : `Folio = página del PDF ${off > 0 ? "−" : "+"} ${Math.abs(off)}`],
      ["Depósito legal", b.credits.dl ?? "No lo encontré"],
      ["Ortografía", b.spelling.checked ? `${b.spelling.words.toLocaleString("es")} palabras · ${b.spelling.unknown} para revisar` : (b.spelling.reason ?? "No revisada")],
    ]);
    if (b.toc.length) {
      w.h3("Índice contra páginas reales");
      for (const t of b.toc) w.text(`${t.title} · ${t.ok ? `pág. ${t.folio}, correcto` : t.real == null ? `dice ${t.folio}, no lo encontré` : `dice ${t.folio}, está en la ${t.real}`}`, { size: 9, color: t.ok ? C.ink : C.error, lh: 12.5 });
    }
  }
}

function footer(doc: PDFDocument, f: Writer["f"], left: string, hash?: string) {
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const y = 26;
    p.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + W, y: y + 12 }, thickness: 0.4, color: C.line });
    const l = `Pliego ${VERSION} · ${left}${hash ? ` · SHA-256 ${hash.slice(0, 16)}…` : ""}`;
    p.drawText(clean(l).slice(0, 110), { x: M, y, size: 7, font: f.r, color: C.faint });
    const r = `${i + 1} / ${pages.length}`;
    p.drawText(r, { x: M + W - f.r.widthOfTextAtSize(r, 7), y, size: 7, font: f.r, color: C.faint });
  });
}

async function section(w: Writer, doc: PDFDocument, inp: PdfInput, opts: { first: boolean; batch: boolean }) {
  const r = inp.report, a = inp.applied;
  const { system, content } = resolve(r.profile);
  const piece = r.profile.piece === "cubierta" ? `Cubierta ${r.profile.coverType === "tapadura" ? "de tapa dura" : r.profile.coverType === "sobrecubierta" ? "(sobrecubierta)" : "rústica"}` : `Interior ${r.profile.colorMode === "mono" ? "a una tinta" : "a cuatro colores"}`;
  const sub = `${piece} · ${system.name} · ${content.name} · ${r.file.formatMm} · ${r.file.pages} ${r.file.pages === 1 ? "página" : "páginas"}`;
  if (opts.first && !opts.batch) cover(w, r.file.name, sub);
  else { if (!opts.first || opts.batch) w.newPage(); w.text(r.file.name, { font: w.f.b, size: 17, lh: 21, after: 2 }); w.text(sub, { size: 9.5, color: C.muted, after: 12 }); }
  verdictBox(w, a.verdict, a.counts, r.passed.length, a.markedCount);
  if (!opts.batch) w.text("Revisión automática previa: no es una certificación ni reemplaza la preimpresión ni las pruebas de la imprenta. El alcance está al final del informe.", { size: 8, color: C.muted, after: 8 });
  if (r.hash && !opts.batch) {
    w.h3("Huella del archivo (SHA-256)");
    w.text(r.hash, { font: w.f.mono, size: 8.5 });
    w.text("Sirve para que la imprenta compruebe que recibió exactamente el archivo revisado. En Mac: shasum -a 256 archivo.pdf · En Windows: certutil -hashfile archivo.pdf SHA256", { size: 8, color: C.muted, after: 4 });
    w.text("El archivo se revisó en el equipo del editor: no se subió a ningún servidor.", { size: 8, color: C.muted, after: 6 });
  }
  if (a.findings.length) {
    w.h2(a.counts.error || a.counts.warn ? "Lo que hay que resolver" : "Notas");
    for (const f of a.findings) finding(w, f, { compact: opts.batch, app: inp.app });
  }
  if (!opts.batch) await thumbs(w, doc, inp.thumbs);
  if (inp.orig) {
    const o = inp.orig;
    w.h2("Cotejo con el original");
    w.text(`${o.words.toLocaleString("es")} palabras en ${o.name}: ${o.missing} faltan en el libro · ${o.extra} sobran · ${o.changed} cambios${o.notes ? ` · ${o.notes - o.notesMissing} de ${o.notes} notas presentes` : ""}. El detalle está en «Lo que hay que resolver».`, { size: 9.5, after: 6 });
  }
  if (inp.diff?.corr) {
    const c = inp.diff.corr;
    w.h2("Correcciones de la prueba anterior");
    w.text(`${c.total} marcas en ${inp.diff.name}: ${c.applied} aplicadas · ${c.missing} sin aplicar${c.different ? ` · ${c.different} aplicadas de otra forma` : ""}${c.lost ? ` · ${c.lost} sin ubicar` : ""}${c.manual ? ` · ${c.manual} para revisar a mano` : ""}. El detalle está en «Lo que hay que resolver».`, { size: 9.5, after: 6 });
  }
  if (inp.diff && inp.diff.findings.length) {
    w.h2("Cambios respecto de la versión anterior");
    w.text(`Comparado con ${inp.diff.name}.`, { size: 9, color: C.muted, after: 4 });
    for (const f of inp.diff.findings) finding(w, f, { compact: true });
  }
  if (a.marked.length) {
    w.h2("Marcado por el editor");
    w.text("Puntos que el editor revisó y dio por buenos, o marcó como falsa alarma.", { size: 9, color: C.muted, after: 4 });
    for (const m of a.marked) {
      if (m.items) for (const it of m.items) w.text(`${REV_LABEL[it.mark]} · ${m.f.title}: ${it.text}`, { size: 9, lh: 12.5 });
      else w.text(`${REV_LABEL[m.mark]} · ${m.f.title}${m.f.detail ? `: ${m.f.detail}` : ""}`, { size: 9, lh: 12.5 });
    }
  }
  if (!opts.batch) {
    data(w, r, inp.costs);
    if (r.passed.length) { w.h3(`Controles superados (${r.passed.length})`); w.text(r.passed.map(p => p.title).join(" · "), { size: 8.5, color: C.muted }); }
  }
}

export async function buildReportPdf(inputs: PdfInput[], batch?: BatchRow[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const f = await fonts(doc);
  const title = batch ? `Lote de ${batch.length} archivos` : inputs[0].report.file.name;
  doc.setTitle(`Informe de preflight · ${title}`); doc.setAuthor("Pliego · Academia Proyecto451"); doc.setCreator("Pliego"); doc.setProducer("Pliego (pdf-lib)");
  const w = new Writer(doc, f, title);
  if (batch) {
    cover(w, `Revisión de ${batch.length} archivos`, "Resumen del lote y hallazgos de cada archivo.");
    w.h2("Resumen");
    const cols = [0, 250, 300, 380];
    w.ensure(20);
    ["Archivo", "Págs.", "Formato", "Resultado"].forEach((h, i) => w.page.drawText(h, { x: M + cols[i], y: A4[1] - w.y - 9, size: 8, font: w.f.m, color: C.muted }));
    w.y += 16;
    for (const b of batch) {
      const name = w.wrap(b.name, w.f.r, 9, 240);
      const h = name.length * 12 + 6;
      w.ensure(h);
      name.forEach((l, i) => w.page.drawText(l, { x: M, y: A4[1] - w.y - 10 - i * 12, size: 9, font: w.f.r, color: C.ink }));
      w.page.drawText(String(b.pages), { x: M + cols[1], y: A4[1] - w.y - 10, size: 9, font: w.f.r, color: C.ink });
      w.page.drawText(clean(b.format), { x: M + cols[2], y: A4[1] - w.y - 10, size: 9, font: w.f.r, color: C.ink });
      w.page.drawCircle({ x: M + cols[3] + 3, y: A4[1] - w.y - 7, size: 3, color: SEVC[b.verdict] });
      const res = b.counts.error ? `${b.counts.error} bloqueante${b.counts.error > 1 ? "s" : ""}${b.counts.warn ? ` · ${b.counts.warn} a revisar` : ""}` : b.counts.warn ? `${b.counts.warn} a revisar` : "Listo";
      w.page.drawText(res, { x: M + cols[3] + 12, y: A4[1] - w.y - 10, size: 9, font: w.f.r, color: C.ink });
      w.y += h;
      w.page.drawLine({ start: { x: M, y: A4[1] - w.y + 2 }, end: { x: M + W, y: A4[1] - w.y + 2 }, thickness: 0.4, color: C.line });
    }
  }
  for (let i = 0; i < inputs.length; i++) await section(w, doc, inputs[i], { first: i === 0, batch: !!batch });
  w.h2("Alcance de esta revisión");
  for (const sc of SCOPE) { w.ensure(48); w.text(sc.t, { font: w.f.m, size: 9.5, lh: 13 }); w.text(sc.d, { size: 9, color: C.muted, after: 6 }); }
  footer(doc, f, batch ? `informe de ${batch.length} archivos` : `informe de ${inputs[0].report.file.name}`, batch ? undefined : inputs[0].report.hash);
  return doc.save();
}
