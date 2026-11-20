// Motor de preflight: abre el PDF con MuPDF y corre todos los controles en el equipo del usuario.
import * as mupdf from "mupdf";
import { COPY, Group } from "./copy";
import { Profile, Sev, resolve, PAPERS, FORMATS } from "./profiles";
import { scanContent, pageMatrixFor, PaintEvent } from "./contentStream";
import { scanResources, spotKey, TECHNICAL, ImageProps } from "./resources";
import { setupColor, rasterCMYK, softProof, ColorSetup, Raster, free } from "./color";
import { pageText, PageText, sameTitle } from "./text";
import { bookChecks, BookResult, Speller, ISBN_PREFIX, COUNTRY_NAME } from "./book";
import { coverGeometry, CoverGeometry } from "./cover";
import { scanBarcode, BarcodeInfo } from "./barcode";
import { typoChecks } from "./typo";
import { detectMany, Family, DICTS } from "./lang";
import { parseDocx, parsePlain, compareOriginal, OrigResult } from "./original";
import { compareVersions, CompareResult } from "./compare";

export type Rect = [number, number, number, number];
export interface Mark { page: number; rect: Rect; label: string }
export interface Finding {
  id: string; check: string; sev: Sev; group: Group; title: string; detail: string;
  pages: number[]; marks: Mark[]; impact: string; fix: string; items?: string[];
}
export interface PageInfo {
  index: number; bounds: Rect; trim: Rect; bleed: Rect; hasTrim: boolean;
  wMm: number; hMm: number; tacMax: number; tacOverMm2: number;
  /** resolución con que se midió la tinta total en esta página (ppi) y si la página tiene RGB */
  tacPpi?: number; rgb?: boolean;
  plates: { c: number; m: number; y: number; k: number }; spots: string[]; tech: string[];
  blank: boolean; folio?: string; status: Sev; rotate: number;
}
export interface FontInfo { name: string; type: string; embedded: boolean; pages: number[] }
export interface PdfxRule { label: string; ok: boolean; detail?: string }
export interface Report {
  file: { name: string; size: number; pages: number; version: string; producer: string; creator: string; title: string;
    pdfx: string | null; outputIntent: string | null; encrypted: boolean; formatMm: string; formatName: string | null };
  profile: Profile; pages: PageInfo[]; findings: Finding[]; passed: { check: string; title: string; group: Group }[];
  fonts: FontInfo[]; isbns: { value: string; valid: boolean; pages: number[] }[];
  counts: { error: number; warn: number; info: number }; verdict: Sev; ms: number;
  spine?: { expected: number; actual: number; pages: number; paper: string };
  pdfxCheck: { target: string; declared: boolean; rules: PdfxRule[] };
  color: { name: string; source: string; softProof: boolean };
  spots: string[]; technical: string[]; layers: { name: string; hidden: boolean }[];
  book?: BookResult; coverGeo?: CoverGeometry & { x0: number; y0: number }; barcode?: BarcodeInfo | null;
  coverTitle?: string | null; key: string; hash?: string;
  /** datos del perfil que no coinciden con lo que muestra el PDF, para proponer otra revisión */
  suggest?: { inks?: "4"; country?: string; reasons: string[] };
}

const PT = 25.4 / 72;
const mm = (pt: number) => pt * PT;
const ptOf = (m: number) => m / PT;
const r1 = (v: number) => Math.round(v * 10) / 10;
const fmtMm = (v: number) => r1(v).toLocaleString("es", { maximumFractionDigits: 1 });
const pageList = (ps: number[]) => {
  const s = [...new Set(ps)].sort((a, b) => a - b).map(p => p + 1);
  if (s.length === 0) return "";
  const parts: string[] = []; let a = s[0], b = s[0];
  for (let i = 1; i <= s.length; i++) {
    if (s[i] === b + 1) { b = s[i]; continue; }
    parts.push(a === b ? `${a}` : `${a}–${b}`); a = b = s[i];
  }
  const txt = parts.slice(0, 8).join(", ") + (parts.length > 8 ? "…" : "");
  return (s.length === 1 ? "pág. " : "págs. ") + txt;
};
const inter = (a: Rect, b: Rect): Rect | null => {
  const r: Rect = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return r[2] > r[0] && r[3] > r[1] ? r : null;
};
const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

interface ColorClass { kind: "gray" | "rgb" | "cmyk" | "spot" | "lab" | "other"; neutral: boolean; cmyk?: number[]; spots: string[]; registration: boolean; white: boolean; light: boolean; deviceRGB: boolean }

// Nombres de colorantes de un espacio Separation o DeviceN, tal como los da MuPDF:
// «Separation(ICCBased(CMYK,PSO Coated v3),All)» o «DeviceN(3,DeviceCMYK,Cyan,Magenta,Yellow)».
// El espacio alternativo puede traer comas y paréntesis propios: se separa solo en el primer nivel.
function colorants(raw: string): string[] {
  const s = raw.replace(/^(Separation|DeviceN)\(/, "").replace(/\)$/, "");
  const parts: string[] = []; let depth = 0, cur = "";
  for (const ch of s) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch; }
  parts.push(cur);
  return parts.map(x => x.trim()).filter(x => x && !/^\d+$/.test(x) && !/^(Device|ICCBased|Cal|Lab|Indexed)/.test(x) && !x.includes("("));
}

function classify(cs: mupdf.ColorSpace, color: number[]): ColorClass {
  const type = cs.getType();
  const base: ColorClass = { kind: "other", neutral: true, spots: [], registration: false, white: false, light: false, deviceRGB: false };
  if (type === "Gray") return { ...base, kind: "gray", white: color[0] >= 0.999, light: color[0] > 0.9 };
  if (type === "RGB" || type === "BGR") {
    const [r, g, b] = color; const neutral = Math.abs(r - g) < 0.02 && Math.abs(g - b) < 0.02;
    return { ...base, kind: "rgb", neutral, white: r > 0.999 && g > 0.999 && b > 0.999, light: r > 0.9 && g > 0.9 && b > 0.9, deviceRGB: cs.getName() === "DeviceRGB" };
  }
  if (type === "CMYK") {
    const [c, m, y, k] = color; const neutral = c < 0.02 && m < 0.02 && y < 0.02;
    return { ...base, kind: "cmyk", neutral, cmyk: color, registration: c > 0.99 && m > 0.99 && y > 0.99 && k > 0.99, white: c + m + y + k < 0.004, light: c + m + y + k < 0.1 };
  }
  if (type === "Separation") {
    const name = colorants(cs.getName()).pop() ?? "";
    if (/^all$/i.test(name)) return { ...base, kind: "spot", registration: color[0] > 0.99, neutral: false };
    if (/^none$/i.test(name)) return base;
    const process = /^(cyan|magenta|yellow|black)$/i.test(name);
    return { ...base, kind: process ? "cmyk" : "spot", neutral: /^black$/i.test(name), spots: process ? [] : [name], white: (color[0] ?? 1) < 0.004 };
  }
  if (cs.isDeviceN()) {
    const names = colorants(cs.getName());
    const spots = names.filter(n => !/^(cyan|magenta|yellow|black|none|all)$/i.test(n));
    return { ...base, kind: spots.length ? "spot" : "cmyk", neutral: false, spots };
  }
  if (type === "Lab") return { ...base, kind: "lab", neutral: false };
  if (type === "Indexed") return { ...base, kind: "other", neutral: false };
  return base;
}

function isbnValid(d: string) {
  if (d.length === 13) { const s = [...d].reduce((a, c, i) => a + (+c) * (i % 2 ? 3 : 1), 0); return s % 10 === 0; }
  if (d.length === 10) { const s = [...d].reduce((a, c, i) => a + (c === "X" || c === "x" ? 10 : +c) * (10 - i), 0); return s % 11 === 0; }
  return false;
}
function findIsbns(text: string): string[] {
  const out = new Set<string>();
  const grab = (start: number) => {
    let d = ""; let i = start; let sepRun = 0;
    while (i < text.length && d.length < 13) {
      const c = text[i];
      if (/\d/.test(c)) { d += c; sepRun = 0; }
      else if ((c === "X" || c === "x") && d.length === 9) { d += "X"; break; }
      else if (/[\s\-‐-―]/.test(c) && d.length > 0 && sepRun < 2) sepRun++;
      else if (d.length === 0 && /[\s:.\-–]/.test(c)) { /* antes del número */ }
      else break;
      i++;
    }
    if (d.length === 13 && /^97[89]/.test(d)) return d;
    if (d.length >= 10 && !/^97[89]/.test(d)) return d.slice(0, 10);
    return d.length >= 10 ? d : null;
  };
  const re = /ISBN/gi; let m;
  while ((m = re.exec(text))) { const v = grab(m.index + 4); if (v) out.add(v); }
  const bare = /(?<![\d])97[89](?:[\s\-‐-]?\d){10}(?![\d])/g;
  while ((m = bare.exec(text))) out.add(m[0].replace(/\D/g, ""));
  return [...out];
}

// Caja ajustada del texto: une las cajas de cada glifo (ascendente/descendente aproximados),
// porque la caja de la fuente que da MuPDF suele ser mucho más grande que la letra.
function glyphBounds(text: any, ctm: any): Rect | null {
  let r: Rect | null = null;
  text.walk({
    showGlyph(font: any, trm: any, gid: number, _u: number, wmode: number) {
      const m = mupdf.Matrix.concat(trm, ctm);
      let adv = 0.5; try { adv = font.advanceGlyph(gid, wmode); } catch { /* sin métrica */ }
      for (const [x, y] of [[0, -0.2], [adv, -0.2], [0, 0.75], [adv, 0.75]]) {
        const X = x * m[0] + y * m[2] + m[4], Y = x * m[1] + y * m[3] + m[5];
        r = r ? [Math.min(r[0], X), Math.min(r[1], Y), Math.max(r[2], X), Math.max(r[3], Y)] : [X, Y, X, Y];
      }
    },
  });
  return r;
}

// MuPDF.js entrega los sombreados a los callbacks del dispositivo sin aumentar su contador de
// referencias, pero igual los registra para liberarlos cuando el recolector de basura borra el
// objeto JS. Eso termina liberando memoria que MuPDF sigue usando (los sombreados dejan de
// dibujarse o el render falla). Los sacamos del registro. Las imágenes, en cambio, llegan con
// su propia referencia: se juntan y se liberan al terminar cada página (si no, cada foto del
// libro queda en memoria hasta el final).
const borrowed = (o: any) => { try { o?.constructor?._finalizer?.unregister(o); } catch { /* */ } return o; };

// Promedio de cada plancha (0-1) dentro de un rectángulo del raster.
function sampleRect(r: Raster, rect: Rect): number[] | null {
  const x0 = Math.max(0, Math.floor(rect[0] * r.scale - r.x0)), x1 = Math.min(r.w, Math.ceil(rect[2] * r.scale - r.x0));
  const y0 = Math.max(0, Math.floor(rect[1] * r.scale - r.y0)), y1 = Math.min(r.h, Math.ceil(rect[3] * r.scale - r.y0));
  if (x1 <= x0 || y1 <= y0) return null;
  const acc = [0, 0, 0, 0]; let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * r.w + x) * 4; acc[0] += r.px[o]; acc[1] += r.px[o + 1]; acc[2] += r.px[o + 2]; acc[3] += r.px[o + 3]; n++; }
  return acc.map(v => v / n / 255);
}

export interface Progress { stage: string; page?: number; pages?: number; pct: number }
export interface ColorInput { icc: Uint8Array | null; iccName: string | null; fallback: Uint8Array | null; spellers?: Partial<Record<Family, Speller>>; key?: string;
  /** archivo pesado o equipo con poca memoria: la tinta total se mide en una sola pasada de baja resolución */
  light?: boolean }

// estado compartido con el visor (uno por documento: interior y cubierta)
interface DocState { doc: mupdf.Document; pdf: any; color: ColorSetup; texts: PageText[]; bytes: number }
const docs = new Map<string, DocState>();
// Se guardan abiertos los últimos documentos (para el visor); con muchos archivos o con archivos
// pesados se cierran los más viejos (si hace falta, se vuelven a abrir al consultarlos).
const MAX_DOCS = 6;
const MAX_BYTES = 450e6;
function keepDoc(key: string, st: DocState) {
  const prev = docs.get(key);
  if (prev && prev.doc !== st.doc) { try { prev.doc.destroy(); } catch { /* */ } }
  docs.delete(key); docs.set(key, st);
  const total = () => [...docs.values()].reduce((a, d) => a + d.bytes, 0);
  // el interior y la cubierta que se revisan juntos no se separan; el resto se cierra del más viejo al más nuevo
  const pair = (k: string) => k === "int" || k === "cov";
  while (docs.size > MAX_DOCS || total() > MAX_BYTES) {
    const oldest = [...docs.keys()].find(k => k !== key && !(pair(k) && pair(key)));
    if (!oldest) break;
    try { docs.get(oldest)!.doc.destroy(); } catch { /* */ }
    docs.delete(oldest);
  }
}
function touch(key: string) { const st = docs.get(key); if (st) { docs.delete(key); docs.set(key, st); } return st; }
export function hasDoc(key: string) { return docs.has(key); }

export function analyze(data: Uint8Array, name: string, profile: Profile, onProgress: (p: Progress) => void, colorIn?: ColorInput): Report {
  const t0 = performance.now();
  const { system, content, minPpi, hardPpi } = resolve(profile);
  const cover = profile.piece === "cubierta";
  const mono = !cover && profile.colorMode === "mono";
  const doc = mupdf.Document.openDocument(data, "application/pdf");
  const pdf = doc.asPDF();
  const findings = new Map<string, Finding>();
  const passed = new Set<string>();
  const add = (check: string, sev: Sev, detail: string, page?: number, rect?: Rect | null, label?: string, item?: string, key = check) => {
    let f = findings.get(key);
    if (!f) {
      const c = COPY[check];
      f = { id: key, check, sev, group: c.group, title: c.title, detail, pages: [], marks: [], impact: c.impact, fix: c.fix, items: [] };
      findings.set(key, f);
    }
    if (sevRank(sev) > sevRank(f.sev)) f.sev = sev;
    if (page !== undefined && !f.pages.includes(page)) f.pages.push(page);
    if (page !== undefined && rect && f.marks.length < 400) f.marks.push({ page, rect, label: label ?? f.title });
    if (item && f.items!.length < 60 && !f.items!.includes(item)) f.items!.push(item);
    return f;
  };

  // ---------- archivo ----------
  const trailer = pdf?.getTrailer();
  const root = trailer?.get("Root");
  const info = trailer?.get("Info");
  const infoStr = (k: string) => { try { const v = info?.get(k); return v && !v.isNull() ? (v.isName() ? v.asName() : v.asString()) : ""; } catch { return ""; } };
  const encrypted = doc.needsPassword() || !!(trailer && !trailer.get("Encrypt").isNull());
  let outputIntent: string | null = null, oiHasProfile = false, pdfx: string | null = infoStr("GTS_PDFXVersion") || null;
  try {
    const oi = root?.get("OutputIntents");
    if (oi && oi.isArray() && oi.length > 0) {
      const o = oi.get(0);
      outputIntent = [o.get("OutputConditionIdentifier"), o.get("OutputCondition"), o.get("Info")].map(v => (v && !v.isNull() ? v.asString() : "")).filter(Boolean)[0] || "Declarado";
      oiHasProfile = !o.get("DestOutputProfile").isNull();
      if (!pdfx && o.get("S").asName() === "GTS_PDFX") pdfx = "PDF/X";
    }
  } catch { /* sin intents */ }
  const trapped = infoStr("Trapped");
  const version = pdf ? pdf.getVersion() : 14;
  // metadatos que exige PDF/X
  let xmp = "";
  try { const md = root?.get("Metadata"); if (md && !md.isNull()) xmp = new TextDecoder().decode(md.readStream().asUint8Array()); } catch { /* */ }
  const hasTitle = !!infoStr("Title") || /<dc:title>[\s\S]*?<rdf:li[^>]*>\s*[^<\s][\s\S]*?<\/rdf:li>/.test(xmp);
  const hasDates = (!!infoStr("CreationDate") || /xmp:CreateDate/.test(xmp)) && (!!infoStr("ModDate") || /xmp:ModifyDate/.test(xmp));
  const xmpPdfx = /GTS_PDFXVersion/.test(xmp);
  const xFlags = { transfer: false, postscript: false, external: false, halftone: false };
  const badBoxes: number[] = [];
  // capas
  const layers: { name: string; hidden: boolean }[] = [];
  try {
    const ocp = root?.get("OCProperties");
    if (ocp && !ocp.isNull()) {
      const off = new Set<number>();
      const offArr = ocp.get("D").get("OFF");
      if (offArr && offArr.isArray()) offArr.forEach((o: any) => off.add(o.asIndirect()));
      ocp.get("OCGs").forEach((o: any) => { const nm = o.resolve().get("Name"); layers.push({ name: nm && !nm.isNull() ? nm.asString() : "Sin nombre", hidden: off.has(o.asIndirect()) }); });
    }
  } catch { /* sin capas */ }
  // interactividad (prohibida en PDF/X)
  let interactive = false;
  try {
    const names = root?.get("Names");
    if (names && !names.isNull() && !names.get("JavaScript").isNull()) interactive = true;
    const oa = root?.get("OpenAction");
    if (oa && oa.isDictionary() && oa.get("S").asName() === "JavaScript") interactive = true;
    if (root && !root.get("AA").isNull()) interactive = true;
  } catch { /* */ }

  // color: perfil de la imprenta, del PDF o de referencia (y se quita el del PDF de la copia en memoria)
  const color = setupColor(pdf, colorIn?.icc ?? null, colorIn?.iccName ?? null, colorIn?.fallback ?? null);

  const nPages = doc.countPages();
  const pages: PageInfo[] = [];
  const fonts = new Map<string, FontInfo>();
  const isbnMap = new Map<string, number[]>();
  const allText: string[] = [];
  const texts: PageText[] = [];
  const ss = new mupdf.StrokeState({ lineCap: "Butt", lineJoin: "Miter", lineWidth: 1, miterLimit: 10 });
  const RASTER = 0.75; // 54 ppi para cobertura y bordes
  const FINE = 150 / 72; // segunda pasada de tinta total
  const light = !!colorIn?.light || (doc.countPages() > 600 && data.length > 80e6);
  const FINE_MAX_PX = 6e6; // tope de píxeles por página en la segunda pasada (cubiertas grandes, láminas)
  let transparency = 0, overprintUsed = false, deviceRGB = false, anyRGB = false, bit16 = false, jpx = false;
  const usedFonts = new Set<string>();
  const allSpots = new Map<string, number[]>();
  const techSpots = new Set<string>();
  const rotated: number[] = [];
  let outlineBudgetHit = false;

  const readStream = (o: any): string | null => { let b: any; try { b = o.readStream(); return b.asString(); } catch { return null; } finally { free(b); } };
  const readRaw = (o: any): Uint8Array | null => { let b: any; try { b = o.readRawStream(); return b.asUint8Array().slice(0, 90000); } catch { return null; } finally { free(b); } };
  const contentsOf = (pobj: any): string[] => {
    const c = pobj.get("Contents");
    if (!c || c.isNull()) return [];
    if (c.isArray()) { const out: string[] = []; c.forEach((s: any) => { const t = readStream(s); if (t) out.push(t); }); return out; }
    const t = readStream(c); return t ? [t] : [];
  };
  const collectFonts = (res: any, page: number, used: Set<string> | null, depth = 0) => {
    if (!res || res.isNull() || depth > 6) return;
    const fd = res.get("Font");
    if (fd && fd.isDictionary()) fd.forEach((f: any) => {
      f = f.resolve();
      const base = f.get("BaseFont"); const sub = f.get("Subtype").asName();
      const nm = (base && !base.isNull() ? base.asName() : sub === "Type3" ? "Type 3" : "Sin nombre").replace(/^[A-Z]{6}\+/, "");
      let desc = f.get("FontDescriptor");
      if (sub === "Type0") { const df = f.get("DescendantFonts"); if (df && df.isArray()) desc = df.get(0).resolve().get("FontDescriptor"); }
      const embedded = sub === "Type3" || (!!desc && !desc.isNull() && ["FontFile", "FontFile2", "FontFile3"].some(k => !desc.get(k).isNull()));
      const key = nm + "|" + sub;
      const fi = fonts.get(key) ?? { name: nm, type: sub, embedded, pages: [] };
      if (!fi.pages.includes(page) && (!used || used.has(nm) || sub === "Type3")) fi.pages.push(page);
      fi.embedded = fi.embedded && embedded;
      fonts.set(key, fi);
    });
    const xo = res.get("XObject");
    if (xo && xo.isDictionary()) xo.forEach((x: any) => {
      x = x.resolve();
      if (x.get("Subtype").asName() === "Form") collectFonts(x.get("Resources"), page, used, depth + 1);
    });
  };
  const addSpot = (s: string, page: number) => {
    if (TECHNICAL.test(s)) { techSpots.add(s); return; }
    const a = allSpots.get(s) ?? []; if (!a.includes(page)) a.push(page); allSpots.set(s, a);
  };

  for (let i = 0; i < nPages; i++) {
    onProgress({ stage: "Revisando páginas", page: i + 1, pages: nPages, pct: 5 + (i / nPages) * 88 });
    const page = pdf.loadPage(i) as mupdf.PDFPage;
    const bounds = page.getBounds("MediaBox") as Rect;
    const pobj = page.getObject();
    const hasTrim = !pobj.getInheritable("TrimBox").isNull() || !pobj.getInheritable("ArtBox").isNull();
    const trim = (!pobj.getInheritable("TrimBox").isNull() ? page.getBounds("TrimBox") : !pobj.getInheritable("ArtBox").isNull() ? page.getBounds("ArtBox") : page.getBounds("CropBox")) as Rect;
    const bleedRaw = page.getBounds("BleedBox") as Rect;
    const bleed = inter(bleedRaw, bounds) ?? bounds;
    const rotObj = pobj.getInheritable("Rotate");
    const rotate = rotObj && !rotObj.isNull() ? ((rotObj.asNumber() % 360) + 360) % 360 : 0;
    if (rotate) rotated.push(i);
    const pi: PageInfo = { index: i, bounds, trim, bleed, hasTrim, wMm: mm(trim[2] - trim[0]), hMm: mm(trim[3] - trim[1]),
      tacMax: 0, tacOverMm2: 0, plates: { c: 0, m: 0, y: 0, k: 0 }, spots: [], tech: [], blank: false, status: "ok", rotate };
    const recto = i % 2 === 0;
    const res = pobj.getInheritable("Resources");
    const rs = scanResources(res, readRaw);
    if (rs.transfer) xFlags.transfer = true; if (rs.postscript) xFlags.postscript = true; if (rs.external) xFlags.external = true; if (rs.halftone) xFlags.halftone = true;
    if (hasTrim && (trim[0] < bleedRaw[0] - 0.5 || trim[1] < bleedRaw[1] - 0.5 || trim[2] > bleedRaw[2] + 0.5 || trim[3] > bleedRaw[3] + 0.5 || bleedRaw[0] < bounds[0] - 0.5 || bleedRaw[2] > bounds[2] + 0.5)) badBoxes.push(i);
    for (const s of rs.spots) { addSpot(s, i); if (TECHNICAL.test(s)) { if (!pi.tech.includes(s)) pi.tech.push(s); } else if (!pi.spots.includes(s)) pi.spots.push(s); }
    let pageRGB = rs.rgbShading;

    // -- dispositivo de dibujo: recorre cada objeto con su color y su recorte --
    const clips: Rect[] = [];
    let maskBox: Rect | null = null;
    const clipNow = (r: Rect): Rect | null => { let o: Rect | null = r; for (const c of clips) { if (!o) break; o = inter(o, c); } return o; };
    const pushClip = (r: Rect) => clips.push(clips.length ? (inter(r, clips[clips.length - 1]) ?? [0, 0, 0, 0]) : r);
    const textItems: { rect: Rect; size: number; cc: ColorClass }[] = [];
    const glyphLike: Rect[] = [];
    let walks = 0;
    const colorUse = (cc: ColorClass, rect: Rect | null, what: string) => {
      if (!rect) return;
      for (const s of cc.spots) {
        addSpot(s, i);
        if (TECHNICAL.test(s)) { if (!pi.tech.includes(s)) pi.tech.push(s); continue; }
        if (!pi.spots.includes(s)) pi.spots.push(s);
        // tintas planas previstas por el perfil: negro + una plana, o cuatro colores + planas
        const allowed = profile.inks === "4+" || (profile.inks === "2" && (allSpots.size <= 1 || [...allSpots.keys()].filter(k => !TECHNICAL.test(k))[0] === s));
        if (!allowed) add("spot", mono ? "error" : "warn", "", i, rect, `Tinta plana: ${s}`, s);
      }
      if (cc.kind === "rgb" || cc.kind === "lab") { pageRGB = true; anyRGB = true; if (cc.deviceRGB) deviceRGB = true; }
      if (cc.registration && overlaps(rect, trim)) add("registration", "error", "", i, rect, "Color de registro");
      if (cc.kind === "rgb" && what !== "image") add("rgbObjects", "warn", "", i, rect, `${what} en RGB`);
      if (mono && !cc.neutral && !cc.white && cc.kind !== "spot") add("monoColor", "error", "", i, rect, `${what} en color`);
    };
    const shadeRects: Rect[] = [];
    const owned: any[] = [];
    // ¿El trazado pasa por dentro de la caja de corte? Las marcas de corte suelen ir en un solo
    // trazado que cubre las cuatro esquinas: su rectángulo envolvente cruza la página, pero el
    // trazado no entra en la página. Se recorre y se mira cada punto y el medio de cada segmento.
    const entersTrim = (path: any, ctm: number[]) => {
      const t = [trim[0] + 1, trim[1] + 1, trim[2] - 1, trim[3] - 1];
      const T = (x: number, y: number) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
      const inside = (x: number, y: number) => x > t[0] && x < t[2] && y > t[1] && y < t[3];
      let hit = false, px = 0, py = 0, n = 0;
      const to = (x: number, y: number, move = false) => { const [X, Y] = T(x, y); if (inside(X, Y) || (!move && inside((X + px) / 2, (Y + py) / 2))) hit = true; px = X; py = Y; n++; };
      try { path.walk({ moveTo(x: number, y: number) { to(x, y, true); }, lineTo(x: number, y: number) { to(x, y); }, curveTo(_a: number, _b: number, _c: number, _d: number, x: number, y: number) { to(x, y); }, closePath() { } }); }
      catch { return true; }
      return hit || n === 0;
    };
    const dev = new mupdf.Device({
      clipPath(path: any, _eo: boolean, ctm: any) { pushClip(path.getBounds(ss, ctm)); },
      clipStrokePath(path: any, st: any, ctm: any) { pushClip(path.getBounds(st, ctm)); },
      clipText(text: any, ctm: any) { pushClip(text.getBounds(ss, ctm)); },
      clipStrokeText(text: any, st: any, ctm: any) { pushClip(text.getBounds(st, ctm)); },
      clipImageMask(_img: any, ctm: any) { owned.push(_img); pushClip(mupdf.Rect.transform([0, 0, 1, 1], ctm) as Rect); },
      popClip() { clips.pop(); },
      beginMask(bbox: any) { maskBox = bbox; transparency++; },
      endMask() { pushClip(maskBox ?? bounds); },
      beginGroup(_b: any, _cs: any, _iso: boolean, _ko: boolean, blend: string, alpha: number) { if (alpha < 0.999 || blend !== "Normal") transparency++; },
      fillPath(path: any, _eo: boolean, ctm: any, cs: any, color: number[], alpha: number) {
        if (alpha < 0.999) transparency++;
        const raw = path.getBounds(ss, ctm) as Rect;
        const rect = clipNow(raw);
        const fcc = classify(cs, color);
        if (fcc.registration && !entersTrim(path, ctm)) fcc.registration = false;
        colorUse(fcc, rect, "Relleno");
        // posible texto en contornos: trazados chicos con muchas curvas
        if (!rect) return;
        const h = raw[3] - raw[1], w = raw[2] - raw[0];
        if (h >= 3 && h <= 48 && w <= h * 40 && w >= 1) {
          if (walks > 4000) { outlineBudgetHit = true; return; }
          walks++;
          let curves = 0, moves = 0;
          path.walk({ moveTo() { moves++; }, curveTo() { curves++; } });
          if (curves >= 4 && curves / Math.max(1, moves) >= 2) glyphLike.push(rect);
        }
      },
      strokePath(path: any, st: any, ctm: any, cs: any, color: number[], alpha: number) {
        if (alpha < 0.999) transparency++;
        const rect = clipNow(path.getBounds(st, ctm));
        const cc = classify(cs, color);
        if (cc.registration && !entersTrim(path, ctm)) cc.registration = false;
        colorUse(cc, rect, "Línea");
        if (!rect || cc.white) return;
        const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
        const w = st.getLineWidth() * scale;
        if (cc.spots.some(s => TECHNICAL.test(s))) return; // los troqueles suelen ser filetes finos a propósito
        if (w === 0) add("hairline", "error", "", i, rect, "Filete de grosor 0");
        else if (w < system.minLinePt - 0.001) add("hairline", w < 0.1 ? "error" : "warn", "", i, rect, `Filete de ${w.toFixed(2).replace(".", ",")} pt`);
      },
      fillText(text: any, ctm: any, cs: any, color: number[], alpha: number) {
        if (alpha < 0.999) transparency++;
        const gb = glyphBounds(text, ctm);
        const rect = gb ? clipNow(gb) : null;
        if (!rect) return;
        let size = 999;
        text.walk({ beginSpan(_f: any, trm: any) { const m = mupdf.Matrix.concat(trm, ctm); size = Math.min(size, Math.hypot(m[2], m[3])); } });
        const cc = classify(cs, color);
        textItems.push({ rect, size, cc });
        colorUse(cc, rect, "Texto");
      },
      fillImage(img: any, ctm: any, alpha: number) {
        owned.push(img);
        if (alpha < 0.999) transparency++;
        const full = mupdf.Rect.transform([0, 0, 1, 1], ctm) as Rect;
        const rect = clipNow(full);
        if (!rect || (rect[2] - rect[0]) < 3 || (rect[3] - rect[1]) < 3) return;
        const w = img.getWidth(), h = img.getHeight();
        const props: ImageProps | undefined = rs.images.get(`${w}x${h}`);
        const dw = Math.hypot(ctm[0], ctm[1]) / 72, dh = Math.hypot(ctm[2], ctm[3]) / 72;
        const ppi = Math.round(Math.min(w / dw, h / dh));
        const ics = img.getColorSpace();
        const cname = ics ? ics.getType() : "Gray";
        const bpc = props?.bpc ?? 8;
        const lineart = img.getImageMask() || bpc === 1;
        const parts = [`${w}×${h} px`, `${ppi} ppi`, cname === "RGB" ? "RGB" : cname === "CMYK" ? "CMYK" : cname === "Gray" ? (lineart ? "1 bit" : "Gris") : cname];
        if (props?.jpegQ != null) parts.push(`JPEG calidad ${props.jpegQ}`);
        if (bpc === 16) parts.push("16 bits");
        const label = parts.join(" · ");
        if (lineart) { if (ppi < system.lineArtPpi * 0.5) add("lineArt", "warn", "", i, rect, label); }
        else if (ppi < hardPpi) add("imgPpi", "error", "", i, rect, label, undefined, "imgPpi");
        else if (ppi < minPpi - 10) add("imgPpi", "warn", "", i, rect, label, undefined, "imgPpi");
        else if (ppi > 800) add("imgHeavy", "info", "", i, rect, label);
        if (props?.jpegQ != null && props.jpegQ < 60) add("jpeg", props.jpegQ < 40 ? "warn" : "info", "", i, rect, label);
        if (bpc === 16) { bit16 = true; add("bit16", "info", "", i, rect, label); }
        if (props?.filter.includes("JPX")) jpx = true;
        if (props?.smask) transparency++;
        if (cname === "RGB" || cname === "Lab") { pageRGB = true; anyRGB = true; if (ics?.getName() === "DeviceRGB") deviceRGB = true; }
        if (cname === "RGB") add("imgRgb", pdfx || outputIntent ? "info" : "warn", "", i, rect, label);
        if (ics && (ics.getType() === "Separation" || ics.isDeviceN())) colorUse(classify(ics, [1]), rect, "Imagen");
        if (mono && ics && (cname === "RGB" || cname === "CMYK" || cname === "Lab" || cname === "Indexed")) add("monoColor", "warn", "", i, rect, `Imagen en ${cname === "RGB" ? "RGB" : cname === "CMYK" ? "CMYK" : "color"}`);
      },
      fillImageMask(img: any, ctm: any, cs: any, color: number[]) {
        owned.push(img);
        const rect = clipNow(mupdf.Rect.transform([0, 0, 1, 1], ctm) as Rect);
        if (!rect) return;
        const ppi = Math.round(img.getWidth() / (Math.hypot(ctm[0], ctm[1]) / 72));
        if (ppi < system.lineArtPpi * 0.5) add("lineArt", "warn", "", i, rect, `Dibujo de línea · ${ppi} ppi`);
        colorUse(classify(cs, color), rect, "Dibujo de línea");
      },
      fillShade(shade: any, ctm: any, alpha: number) {
        borrowed(shade);
        if (alpha < 0.999) transparency++;
        let r: Rect | null = null;
        try { r = clipNow(mupdf.Rect.transform(shade.getBounds(), ctm) as Rect); } catch { r = clips.length ? clips[clips.length - 1] : null; }
        if (r) shadeRects.push(inter(r, bounds) ?? r);
      },
    });
    try { page.run(dev, mupdf.Matrix.identity); } catch (e) { add("encrypted", "warn", "", i); }
    try { dev.close(); } catch { /* ya cerrado */ }
    if (rs.rgbShading) for (const r of shadeRects.length ? shadeRects : [bounds]) add("shadingRgb", "warn", "", i, r, "Degradado en RGB");
    if (mono) for (const sh of rs.shadings) if (sh.cs !== "Gray" && !(sh.spot && /black/i.test(sh.spot))) { for (const r of shadeRects.slice(0, 10)) add("monoColor", "error", "", i, r, "Degradado en color"); break; }

    // -- flujo de contenido: sobreimpresión, fuentes usadas --
    const streams = contentsOf(pobj);
    const sc = scanContent(streams, res, pageMatrixFor(pobj), x => readStream(x));
    if (sc.overprintUsed) overprintUsed = true;
    for (const u of sc.usedFonts) usedFonts.add(u);
    collectFonts(res, i, streams.length ? sc.usedFonts : null);

    // -- raster CMYK (con el perfil de la imprenta si hay RGB) --
    const ras = rasterCMYK(pdf, i, RASTER, color, pageRGB);
    const W = ras.w, H = ras.h, px = ras.px;
    const limit = system.tac * 2.55;
    let maxT = 0, ink = 0, cC = 0, cM = 0, cY = 0, cK = 0;
    for (let o = 0; o < px.length; o += 4) {
      const c = px[o], m = px[o + 1], yy = px[o + 2], k = px[o + 3], s = c + m + yy + k;
      if (s > maxT) maxT = s;
      if (s > 3) ink++;
      if (c > 12) cC++; if (m > 12) cM++; if (yy > 12) cY++; if (k > 12) cK++;
    }
    const tot = W * H;
    pi.tacMax = Math.round(maxT / 2.55);
    pi.plates = { c: cC / tot, m: cM / tot, y: cY / tot, k: cK / tot };
    pi.blank = ink === 0 && textItems.length === 0;

    // -- tinta total en detalle: segunda pasada a 150 ppi donde se acerca al límite --
    if (maxT > limit * 0.9) {
      // resolución adaptativa: 150 ppi salvo en páginas enormes; en archivos pesados se usa la primera pasada
      const area = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
      const FS = light ? RASTER : Math.min(FINE, Math.sqrt(FINE_MAX_PX / Math.max(1, area)));
      const fine = light ? ras : rasterCMYK(pdf, i, FS, color, pageRGB);
      const m = measureTac(fine, FS, limit);
      pi.tacOverMm2 = m.overMm2; pi.tacMax = m.max; pi.tacPpi = Math.round(FS * 72);
      const ob = m.rect;
      if (pi.tacOverMm2 >= 4 && ob) add("tac", pi.tacOverMm2 > 100 ? "error" : "warn", "", i, ob, `Hasta ${pi.tacMax} % de tinta en ${fmtMm(pi.tacOverMm2)} mm² (límite ${system.tac} %)`);
    }
    pi.rgb = pageRGB; if (!pi.tacPpi) pi.tacPpi = Math.round(RASTER * 72);
    if (mono && (cC + cM + cY) / tot > 0.002 && !findings.get("monoColor")?.pages.includes(i)) add("monoColor", "warn", "", i, bounds, "Esta página genera tinta en C, M o Y");

    // -- texto: cuerpo, negros, calados, zona segura, lomo --
    const safety = ptOf(content.safetyMm), gutter = ptOf(content.gutterMm);
    for (const t of textItems) {
      const { rect, size, cc } = t;
      const sz = size === 999 ? 0 : size;
      const szTxt = `${sz.toFixed(1).replace(".", ",")} pt`;
      if (cc.kind === "cmyk" && cc.cmyk && cc.cmyk[3] > 0.8 && cc.cmyk[0] + cc.cmyk[1] + cc.cmyk[2] > 0.15 && sz > 0 && sz < 12)
        add("richBlackText", "warn", "", i, rect, `Texto de ${szTxt} en C${Math.round(cc.cmyk[0] * 100)} M${Math.round(cc.cmyk[1] * 100)} Y${Math.round(cc.cmyk[2] * 100)} K${Math.round(cc.cmyk[3] * 100)}`);
      if (cc.kind === "rgb" && cc.neutral && !cc.white && !mono) add("rgbBlackText", "warn", "", i, rect, `Texto de ${szTxt} en gris o negro RGB`);
      if (sz > 0 && sz < 5.5) add("tinyText", "info", "", i, rect, `Texto de ${szTxt}`);
      // texto calado chico sobre fondo de varias tintas
      if ((cc.white || cc.light) && sz > 0 && sz < 9) {
        const bg = sampleRect(ras, rect);
        if (bg) {
          const platesOn = bg.filter(v => v > 0.25).length;
          if (platesOn >= 3) add("knockoutText", "warn", "", i, rect, `Texto calado de ${szTxt} sobre fondo de ${platesOn} tintas`);
        }
      }
      if (cc.white) continue;
      const dl = rect[0] - trim[0], dr = trim[2] - rect[2], dt = rect[1] - trim[1], db = trim[3] - rect[3];
      const outside = rect[2] < trim[0] || rect[0] > trim[2] || rect[3] < trim[1] || rect[1] > trim[3];
      if (outside) continue;
      const near = Math.min(dl, dr, dt, db);
      if (near < safety) add("safety", near < ptOf(2) ? "error" : "warn", "", i, rect, `Texto a ${fmtMm(Math.max(0, mm(near)))} mm del corte`);
      if (!cover && nPages > 1) {
        const dSpine = recto ? dl : dr;
        if (dSpine < gutter && dSpine >= 0 && near >= safety) add("gutter", "warn", "", i, rect, `Texto a ${fmtMm(mm(dSpine))} mm del lomo`);
      }
    }

    // -- sobreimpresión: blanco, color, negro calado y capas técnicas --
    const isKOnly = (e: PaintEvent) => (e.cs === "CMYK" && e.color.length === 4 && e.color[0] < 0.01 && e.color[1] < 0.01 && e.color[2] < 0.01 && e.color[3] > 0.95) || (e.cs === "Gray" && e.color[0] < 0.05);
    const isWhite = (e: PaintEvent) => (e.cs === "CMYK" && e.color.length === 4 && e.color.every(v => v <= 0.001)) || (e.cs === "Gray" && e.color[0] >= 0.999);
    for (const e of sc.events) {
      const r = e.rect ? (inter(e.rect as Rect, bounds) ?? null) : null;
      if (e.op && isWhite(e)) { add("whiteOverprint", "error", "", i, r, `${e.kind === "text" ? "Texto" : "Objeto"} blanco en sobreimpresión`); continue; }
      if (e.cs.startsWith("Sep:")) {
        const nm = e.cs.slice(4);
        if (TECHNICAL.test(nm) && !e.op) add("techOverprint", "error", "", i, r, `${nm} sin sobreimpresión`, nm);
        continue;
      }
      if (e.op && e.cs === "CMYK" && !isKOnly(e) && (e.color[0] + e.color[1] + e.color[2]) > 0.05) add("colorOverprint", "warn", "", i, r, `${e.kind === "text" ? "Texto" : "Objeto"} de color en sobreimpresión`);
      if (e.kind === "text" && !e.op && isKOnly(e) && (e.size ?? 99) < 12 && r) {
        const pad = 2; const ring = sampleRect(ras, [r[0] - pad, r[1] - pad, r[2] + pad, r[3] + pad]);
        if (ring && ring[0] + ring[1] + ring[2] > 0.3) add("blackKnockout", "warn", "", i, r, `Negro de ${(e.size ?? 0).toFixed(1).replace(".", ",")} pt calado sobre color`);
      }
    }

    // -- posible texto en contornos: renglones de trazados chicos sin texto real --
    if (glyphLike.length >= 6) {
      const rows = new Map<number, Rect[]>();
      for (const g of glyphLike) {
        if (textItems.some(t => overlaps(t.rect, g))) continue;
        const key = Math.round(((g[1] + g[3]) / 2) / 6);
        rows.set(key, [...(rows.get(key) ?? []), g]);
      }
      for (const [, rr] of rows) {
        if (rr.length < 5) continue;
        const u: Rect = rr.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] as Rect, rr[0]);
        const hAvg = rr.reduce((a, b) => a + (b[3] - b[1]), 0) / rr.length;
        if (u[2] - u[0] > hAvg * 3) add("outlines", "info", "", i, u, "Parece texto en contornos");
      }
    }

    // -- bordes: tinta que toca el corte sin extenderse al sangrado --
    const need = ptOf(system.bleedMm) - ptOf(0.4);
    const inkAt = (X: number, Y: number) => {
      const x = Math.floor(X * RASTER - ras.x0), y = Math.floor(Y * RASTER - ras.y0);
      if (x < 0 || y < 0 || x >= W || y >= H) return -1;
      const o = (y * W + x) * 4; return px[o] + px[o + 1] + px[o + 2] + px[o + 3];
    };
    const edges: { name: string; inside: (t: number) => [number, number]; out: (t: number, d: number) => [number, number]; from: number; to: number; avail: number }[] = [
      { name: "izquierdo", inside: t => [trim[0] + 1.2, t], out: (t, d) => [trim[0] - d, t], from: trim[1], to: trim[3], avail: trim[0] - bleed[0] },
      { name: "derecho", inside: t => [trim[2] - 1.2, t], out: (t, d) => [trim[2] + d, t], from: trim[1], to: trim[3], avail: bleed[2] - trim[2] },
      { name: "superior", inside: t => [t, trim[1] + 1.2], out: (t, d) => [t, trim[1] - d], from: trim[0], to: trim[2], avail: trim[1] - bleed[1] },
      { name: "inferior", inside: t => [t, trim[3] - 1.2], out: (t, d) => [t, trim[3] + d], from: trim[0], to: trim[2], avail: bleed[3] - trim[3] },
    ];
    let bleedShort = false;
    for (const e of edges) {
      if (!cover && nPages > 1 && ((recto && e.name === "izquierdo") || (!recto && e.name === "derecho"))) continue; // lado del lomo
      let touching = 0, missing = 0, samples = 0, segA = -1, segB = -1;
      const step = 1 / RASTER;
      for (let t = e.from + 2; t < e.to - 2; t += step) {
        samples++;
        const [ix, iy] = e.inside(t);
        if (inkAt(ix, iy) <= 8) continue;
        touching++;
        const depth = Math.min(need, e.avail - 0.5);
        const [ox, oy] = e.out(t, Math.max(0.6, depth));
        const v = depth < 0.6 ? -1 : inkAt(ox, oy);
        if (v <= 8) { missing++; if (segA < 0) segA = t; segB = t; }
      }
      if (touching > samples * 0.02 && missing > touching * 0.3) {
        const r: Rect = e.name === "izquierdo" || e.name === "derecho"
          ? [e.name === "izquierdo" ? trim[0] - 4 : trim[2] - 4, segA, e.name === "izquierdo" ? trim[0] + 4 : trim[2] + 4, segB]
          : [segA, e.name === "superior" ? trim[1] - 4 : trim[3] - 4, segB, e.name === "superior" ? trim[1] + 4 : trim[3] + 4];
        add("edge", "error", "", i, r, `Borde ${e.name}: llega al corte sin sangrado`);
      }
      if (touching > samples * 0.02 && e.avail < ptOf(system.bleedMm) - 0.5) bleedShort = true;
    }
    if (bleedShort) add("bleed", "error", "", i, undefined, undefined, `${fmtMm(mm(Math.min(trim[0] - bleed[0], bleed[2] - trim[2], trim[1] - bleed[1], bleed[3] - trim[3])))} mm`);

    // -- marcas de impresión: tinta fuera del sangrado o en las esquinas del sangrado --
    if (bounds[2] - bleed[2] > 2 || bleed[0] - bounds[0] > 2 || bounds[3] - bleed[3] > 2 || bleed[1] - bounds[1] > 2) {
      let outInk = 0;
      for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
        const X = (x + ras.x0) / RASTER, Y = (y + ras.y0) / RASTER;
        if (X >= bleed[0] && X <= bleed[2] && Y >= bleed[1] && Y <= bleed[3]) continue;
        const o = (y * W + x) * 4; if (px[o] + px[o + 1] + px[o + 2] + px[o + 3] > 40) outInk++;
      }
      if (outInk > 4) add("marks", "info", "", i);
    }
    const bd = Math.min(trim[0] - bleed[0], bleed[2] - trim[2], trim[1] - bleed[1], bleed[3] - trim[3]);
    if (bd > ptOf(1.5)) {
      const s = Math.min(bd, ptOf(3)) - 1;
      const corners: [Rect, Rect][] = [
        [[trim[0] - s, trim[1] - s, trim[0] - 0.8, trim[1] - 0.8], [trim[0], trim[1], trim[0] + ptOf(3), trim[1] + ptOf(3)]],
        [[trim[2] + 0.8, trim[1] - s, trim[2] + s, trim[1] - 0.8], [trim[2] - ptOf(3), trim[1], trim[2], trim[1] + ptOf(3)]],
        [[trim[0] - s, trim[3] + 0.8, trim[0] - 0.8, trim[3] + s], [trim[0], trim[3] - ptOf(3), trim[0] + ptOf(3), trim[3]]],
        [[trim[2] + 0.8, trim[3] + 0.8, trim[2] + s, trim[3] + s], [trim[2] - ptOf(3), trim[3] - ptOf(3), trim[2], trim[3]]],
      ];
      let hits = 0; const where: Rect[] = [];
      for (const [outer, innerC] of corners) {
        const a = sampleRect(ras, outer), b = sampleRect(ras, innerC);
        if (a && b && a.reduce((x, y) => x + y, 0) > 0.06 && b.reduce((x, y) => x + y, 0) < 0.02) { hits++; where.push(outer); }
      }
      if (hits >= 2) for (const w of where) add("marksInBleed", "warn", "", i, w, "Marca de corte en el sangrado");
    }

    // -- anotaciones --
    const annots = pobj.get("Annots");
    if (annots && annots.isArray()) annots.forEach((a: any) => {
      const st = a.resolve().get("Subtype").asName();
      if (["Movie", "Sound", "Screen", "RichMedia", "Widget", "3D"].includes(st)) interactive = true;
      if (!["Link", "PrinterMark", "TrapNet"].includes(st)) add("annots", "warn", "", i, undefined, undefined, st);
    });

    // -- texto de la página (base de los controles del libro) --
    try {
      const pt = pageText(page, i, trim);
      texts[i] = pt;
      const txt = pt.lines.map(l => l.text).join("\n");
      allText[i] = txt;
      for (const v of findIsbns(txt)) { const a = isbnMap.get(v) ?? []; if (!a.includes(i)) a.push(i); isbnMap.set(v, a); }
    } catch { allText[i] = ""; texts[i] = { index: i, trim, lines: [] }; }
    pages.push(pi);
    free(dev, page, ...owned);
    // las imágenes ya decodificadas quedan en la caché del motor: se vacía para que la memoria no crezca con el libro
    mupdf.emptyStore();
  }

  if (light) add("lightMode", "info", `El archivo es pesado para este equipo: la tinta total se midió a ${Math.round(RASTER * 72)} ppi en lugar de 150 ppi. El resto de los controles se hizo completo. Abrí este punto para medir la tinta en detalle, en todo el libro o en un rango de páginas.`);
  onProgress({ stage: "Revisando el libro", pct: 95 });

  // ---------- controles de documento ----------
  if (encrypted) add("encrypted", "error", "");
  if (!outputIntent) add("outputIntent", system.wantsOutputIntent ? "warn" : "info", ""); else passed.add("outputIntent");
  if (layers.length) {
    const hidden = layers.filter(l => l.hidden);
    if (hidden.length) { const f = add("hiddenLayers", "warn", ""); hidden.forEach(h => f.items!.push(h.name)); }
    else add("layers", "info", "", undefined, undefined, undefined, layers.map(l => l.name).join(", "));
  }
  if (transparency > 0) add("transparency", "info", "");
  if (rotated.length) { const f = add("rotated", "info", ""); f.pages = rotated; }
  const techList = [...techSpots];
  if (techList.length && !findings.has("techOverprint") && !profile.finishes?.length) add("technical", "info", "", undefined, undefined, undefined, techList.join(", "));

  // tintas planas con el mismo nombre de base
  const groups = new Map<string, string[]>();
  for (const s of allSpots.keys()) { const k = spotKey(s); groups.set(k, [...(groups.get(k) ?? []), s]); }
  for (const [, names] of groups) if (names.length > 1) {
    const f = add("spotDuplicate", "warn", "");
    f.items!.push(names.map(n => `«${n}»`).join(" y "));
    names.forEach(n => f.pages.push(...(allSpots.get(n) ?? [])));
  }

  const noTrim = pages.filter(p => !p.hasTrim).map(p => p.index);
  if (noTrim.length) { const f = add("trimbox", "warn", ""); f.pages = noTrim; }
  const sizes = new Map<string, number[]>();
  for (const p of pages) { const k = `${fmtMm(p.wMm)} × ${fmtMm(p.hMm)}`; sizes.set(k, [...(sizes.get(k) ?? []), p.index]); }
  const mainSize = [...sizes.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!cover && sizes.size > 1) {
    for (const [k, ps] of sizes) if (k !== mainSize[0]) { const f = add("pageSize", "error", ""); f.pages.push(...ps); f.items!.push(`${k} mm en ${pageList(ps)}`); }
  }
  const p0 = pages[0];
  const fmtName = FORMATS.find(f => Math.abs(f.w - p0.wMm) < 0.6 && Math.abs(f.h - p0.hMm) < 0.6)?.name ?? null;
  if (!cover && profile.trimW && profile.trimH && (Math.abs(profile.trimW - p0.wMm) > 0.5 || Math.abs(profile.trimH - p0.hMm) > 0.5))
    add("format", "error", "", undefined, undefined, undefined, `El PDF mide ${fmtMm(p0.wMm)} × ${fmtMm(p0.hMm)} mm; esperabas ${fmtMm(profile.trimW)} × ${fmtMm(profile.trimH)} mm`);

  let spine: Report["spine"];
  let coverGeo: Report["coverGeo"], barcode: BarcodeInfo | null = null, coverTitle: string | null = null;
  if (!cover) {
    if (system.signature > 2 && nPages % system.signature !== 0) {
      const missing = system.signature - (nPages % system.signature);
      const f = add("signature", "warn", "");
      f.items!.push(`${nPages} páginas: faltan ${missing} para completar el pliego de ${system.signature} (${nPages + missing} en total)`);
      if (nPages % 8 === 0) f.items!.push(`También cierra con un medio pliego de 8 si tu imprenta lo acepta`);
    } else if (nPages % 2 !== 0) add("signature", "error", "", undefined, undefined, undefined, `${nPages} páginas: un libro siempre tiene un número par de páginas`);
    else passed.add("signature");
    if (system.minPages && nPages < system.minPages) add("minPages", "error", "", undefined, undefined, undefined, `${nPages} páginas; el mínimo es ${system.minPages}`);
    const blanks = pages.filter(p => p.blank).map(p => p.index);
    if (blanks.length) { const f = add("blank", "info", ""); f.pages = blanks; }

    // créditos
    const front = allText.slice(0, Math.min(12, nPages)).join("\n");
    const missingLegal: string[] = [];
    if (!/©|copyright/i.test(front)) missingLegal.push("No aparece el símbolo © ni la palabra copyright");
    if (profile.country === "es" && !/dep[óo]sito\s+legal/i.test(front)) missingLegal.push("No encontré el depósito legal (obligatorio en España)");
    if (profile.country === "ar" && !/11\.?723/.test(front)) missingLegal.push("No encontré la leyenda de la ley 11.723");
    if (isbnMap.size === 0) missingLegal.push("No encontré ningún ISBN en el interior");
    if (missingLegal.length) { const f = add("legal", "warn", ""); f.items!.push(...missingLegal); } else passed.add("legal");
  } else {
    // cubierta: geometría según el tipo (rústica, tapa dura, sobrecubierta)
    const tw = profile.trimW, th = profile.trimH;
    if (tw && th && (profile.interiorPages || profile.spineMm)) {
      const paper = PAPERS.find(p => p.id === profile.paperId);
      const perLeaf = profile.mmPerLeaf ?? paper?.mmPerLeaf ?? 0.1;
      // el lomo que indica la imprenta manda sobre el calculado
      const expected = profile.spineMm ?? Math.ceil((profile.interiorPages ?? 0) / 2) * perLeaf;
      const type = profile.coverType ?? "rustica";
      // solapas no declaradas: si sobra un ancho simétrico plausible, se asumen (redondeadas al milímetro)
      let flapMm = profile.flapMm ?? 0;
      if (!flapMm && type !== "tapadura") {
        const base0 = coverGeometry({ type, trimW: tw, trimH: th, spine: expected, flapMm: 0, boardMm: profile.boardMm ?? 2.5, cejaMm: profile.cejaMm ?? 3, turnInMm: 15, hingeMm: 8 });
        const f = Math.round((p0.wMm - base0.totalW) / 2);
        if (f >= 40 && f <= 140 && Math.abs(p0.hMm - base0.totalH) <= 1) {
          flapMm = f;
          add("coverFlaps", "info", `La cubierta parece tener solapas de ${f} mm. Las tomé para calcular las medidas y el lomo; si no es así, corregilo en el perfil.`);
        }
      }
      const params = { type, trimW: tw, trimH: th, spine: expected, flapMm, boardMm: profile.boardMm ?? 2.5, cejaMm: profile.cejaMm ?? 3, turnInMm: profile.turnInMm ?? 15, hingeMm: profile.hingeMm ?? 8 };
      const geo = coverGeometry(params);
      const extra = geo.totalW - expected - (type === "tapadura" || type === "sobrecubierta" ? 2 * params.boardMm + (type === "sobrecubierta" ? 2 : 0) : 0);
      const actualSpine = p0.wMm - extra;
      spine = { expected: r1(expected), actual: r1(actualSpine), pages: profile.interiorPages ?? 0, paper: profile.spineMm ? "el lomo que indica la imprenta" : paper?.name ?? `${perLeaf} mm por hoja` };
      if (Math.abs(p0.wMm - geo.totalW) > 1 || Math.abs(p0.hMm - geo.totalH) > 1) {
        add("coverSize", "error", "", 0, undefined, undefined, `La cubierta mide ${fmtMm(p0.wMm)} × ${fmtMm(p0.hMm)} mm y debería medir ${fmtMm(geo.totalW)} × ${fmtMm(geo.totalH)} mm`);
        add("coverSize", "error", "", 0, undefined, undefined, `Cálculo: ${geo.breakdown}`);
        if (Math.abs(p0.hMm - geo.totalH) <= 1) add("spine", "error", "", 0, undefined, undefined, profile.spineMm ? `El lomo de la cubierta mide ${fmtMm(actualSpine)} mm y la imprenta indicó ${fmtMm(expected)} mm` : `El lomo de la cubierta mide ${fmtMm(actualSpine)} mm; para ${profile.interiorPages} páginas en ${spine.paper} corresponden unos ${fmtMm(expected)} mm`);
      } else passed.add("coverSize");
      if (Math.abs(actualSpine - expected) <= 1) passed.add("spine");
      const x0 = p0.trim[0], y0 = p0.trim[1];
      coverGeo = { ...geo, x0, y0 };
      const folds = geo.folds.map(v => x0 + ptOf(v)), hfolds = geo.hfolds.map(v => y0 + ptOf(v));
      const tItems: Rect[] = [];
      const tdev = new mupdf.Device({ fillText(text: any, ctm: any) { const g = glyphBounds(text, ctm); if (g) tItems.push(g); } });
      { const p0 = pdf.loadPage(0); p0.run(tdev, mupdf.Matrix.identity); tdev.close(); free(tdev, p0); }
      for (const r of tItems) {
        for (const f of folds) if (r[0] < f + ptOf(1.5) && r[2] > f - ptOf(1.5)) add("spineText", "warn", "", 0, r, "Texto sobre un pliegue");
        for (const f of hfolds) if (r[1] < f + ptOf(1.5) && r[3] > f - ptOf(1.5)) add("spineText", "warn", "", 0, r, "Texto sobre un pliegue");
        if (type === "tapadura") {
          const inTurn = geo.panels.filter(pn => pn.kind === "turnin").some(pn => r[0] < x0 + ptOf(pn.x1) && r[2] > x0 + ptOf(pn.x0)) || hfolds.length === 2 && (r[1] < hfolds[0] || r[3] > hfolds[1]);
          const inHinge = geo.panels.filter(pn => pn.kind === "hinge").some(pn => r[0] < x0 + ptOf(pn.x1) && r[2] > x0 + ptOf(pn.x0));
          if (inTurn) add("turnIn", "error", "", 0, r, "Texto en la vuelta");
          else if (inHinge) add("turnIn", "warn", "", 0, r, "Texto en el cajo");
        }
      }
      // título de tapa: la línea de texto más grande del panel de tapa
      const front = geo.panels.find(pn => pn.kind === "front");
      if (front && texts[0]) {
        const fx0 = x0 + ptOf(front.x0), fx1 = x0 + ptOf(front.x1);
        const inFront = texts[0].lines.filter(l => l.r[0] >= fx0 - 2 && l.r[2] <= fx1 + 2);
        coverTitle = inFront.sort((a, b) => b.size - a.size)[0]?.text ?? null;
      }
      // código de barras en la contratapa
      const back = geo.panels.find(pn => pn.kind === "back");
      const area: Rect | null = back ? [x0 + ptOf(back.x0), p0.bounds[1], x0 + ptOf(back.x1), p0.bounds[3]] : null;
      onProgress({ stage: "Leyendo el código de barras", pct: 97 });
      barcode = scanBarcode(pdf, 0, area, color) ?? (area ? scanBarcode(pdf, 0, null, color) : null);
    } else if (texts[0]) {
      onProgress({ stage: "Leyendo el código de barras", pct: 97 });
      barcode = scanBarcode(pdf, 0, null, color);
    }
    // controles del código de barras
    if (barcode) {
      const b = barcode, isbnsText = [...isbnMap.keys()].filter(v => v.length === 13);
      const mag = Math.round(b.magnification * 100);
      if (b.magnification < 0.8) add("barcode", "error", "", 0, b.rect, `Código al ${mag} %`, `Está al ${mag} % del tamaño nominal: el mínimo es 80 %`);
      else if (b.magnification < 0.9) add("barcode", "info", "", 0, b.rect, `Código al ${mag} %`, `Está al ${mag} %: dentro de lo aceptable, pero cerca del mínimo (80 %)`);
      const nominalH = 22.85 * b.magnification;
      if (b.heightMm < nominalH * 0.5) add("barcode", "warn", "", 0, b.rect, "Barras recortadas", `Las barras miden ${fmtMm(b.heightMm)} mm de alto: están recortadas más de la mitad y algunos lectores fallan`);
      if (!b.quietLeft || !b.quietRight) add("barcode", "warn", "", 0, b.rect, "Margen invadido", `Hay elementos dentro del margen en blanco ${!b.quietLeft && !b.quietRight ? "de ambos lados" : !b.quietLeft ? "izquierdo (11 módulos)" : "derecho (7 módulos)"}`);
      const absorbBars = Math.min(1, b.bars[0] + b.bars[3]), absorbSpace = Math.min(1, b.space[0] + b.space[3]);
      if (absorbBars < 0.6) add("barcode", "error", "", 0, b.rect, "Barras que no absorben rojo", `Las barras son de un color que los lectores (de luz roja) no ven bien: deben ir en negro o en un azul o verde oscuro`);
      else if (b.bars[0] + b.bars[1] + b.bars[2] > 0.5 && b.bars[3] > 0.5) add("barcode", "warn", "", 0, b.rect, "Barras en negro compuesto", `Las barras están en negro de cuatro colores: cualquier desregistro las engrosa. Usá negro 100 %`);
      if (absorbSpace > 0.3) add("barcode", "error", "", 0, b.rect, "Fondo oscuro", `El fondo del código es demasiado oscuro para un lector de luz roja: usá blanco, amarillo o rojo claro`);
      if (isbnsText.length && !isbnsText.includes(b.digits)) add("barcode", "error", "", 0, b.rect, `Código ${b.digits}`, `El código de barras dice ${b.digits} y el ISBN impreso es ${isbnsText.join(", ")}`);
      if (b.addon) add("barcode", "info", "", 0, b.rect, `Suplemento ${b.addon}`, `Lleva suplemento de 5 dígitos (${b.addon}), habitual para el precio en algunos mercados`);
      if (!findings.has("barcode")) passed.add("barcode");
    } else if (cover) add("barcode", "warn", "", undefined, undefined, undefined, "No encontré un código de barras EAN-13 en la cubierta. Si lo agrega la imprenta, está bien");
  }

  // libro: folios, capítulos, índice, viudas, créditos, ortografía
  let book: BookResult | undefined;
  if (!cover && nPages >= 4) {
    onProgress({ stage: "Revisando la composición del libro", pct: 96 });
    book = bookChecks(texts, { country: profile.country, chaptersOdd: profile.chaptersOdd === true ? true : profile.chaptersOdd === false ? false : "auto", spellers: colorIn?.spellers ?? {}, forceLang: profile.language && profile.language !== "auto" ? DICTS.find(d => d.id === profile.language)?.family ?? null : null, spellRequested: profile.spell !== false, year: new Date().getFullYear() }, add as any);
    for (const c of ["orphan", "widow", "hyphenLadder", "pageTurnHyphen", "runningHead", "repeatedWord", "toc"]) if (!findings.has(c)) passed.add(c);
    if (book.folioOffset !== null && !findings.has("folio")) passed.add("folio");
    if (profile.chaptersOdd !== false && !findings.has("chapterOdd")) passed.add("chapterOdd");
    // ortotipografía, composición y aparato
    const all = texts.map(t => t.lines.map(l => l.text).join(" ")).join(" ").toLowerCase();
    const words = all.split(/\s+/).length || 1;
    const es = (all.match(/\b(el|la|los|las|de|que|y|en|un|una|por|con|para|del|se|no)\b/g) ?? []).length / words;
    if (profile.typo !== false) {
      onProgress({ stage: "Revisando ortotipografía y composición", pct: 97 });
      const ran = typoChecks(texts, { bodySize: book.bodySize, folioOffset: book.folioOffset, chapters: book.chapters, spanish: es > 0.16 }, add as any);
      for (const c of ran) if (!findings.has(c)) passed.add(c);
    }
  }

  // ISBN
  const isbns = [...isbnMap.entries()].map(([v, ps]) => ({ value: v, valid: isbnValid(v), pages: ps }));
  for (const s of isbns) if (!s.valid) { const f = add("isbn", "error", ""); f.pages.push(...s.pages); f.items!.push(`${s.value} tiene un dígito de control inválido (${pageList(s.pages)})`); }
  const valid13 = isbns.filter(s => s.valid && s.value.length === 13);
  if (valid13.length > 1) { const f = add("isbn", "info", ""); f.items!.push(`Aparecen ${valid13.length} ISBN distintos: ${valid13.map(s => s.value).join(", ")}. Si uno es del ebook o de otra edición, está bien`); }
  if (isbns.length && isbns.every(s => s.valid) && valid13.length <= 1) passed.add("isbn");
  const prefixes = ISBN_PREFIX[profile.country];
  if (prefixes && valid13.length && !valid13.some(s => prefixes.some(p => s.value.startsWith(p))))
    add("isbnCountry", "info", "", undefined, undefined, undefined, `El ISBN ${valid13[0].value} no tiene un prefijo habitual de ${COUNTRY_NAME[profile.country]} (${prefixes.map(p => p.slice(0, 3) + "-" + p.slice(3)).join(", ")}). Si el ISBN se asignó en otro país o es correcto, ignoralo`);

  // fuentes
  const fontList = [...fonts.values()].filter(f => f.pages.length && (usedFonts.size === 0 || usedFonts.has(f.name) || f.type === "Type3"));
  const unembedded = fontList.filter(f => !f.embedded);
  if (unembedded.length) { const f = add("fonts", "error", ""); for (const u of unembedded) { f.items!.push(`${u.name} (${pageList(u.pages)})`); f.pages.push(...u.pages); } }
  else if (fontList.length) passed.add("fonts");
  const t3 = fontList.filter(f => f.type === "Type3");
  if (t3.length) { const f = add("type3", "info", ""); t3.forEach(u => f.pages.push(...u.pages)); }

  // ---------- PDF/X: reglas principales ----------
  const isX1a = !!pdfx && /X-1/i.test(pdfx);
  const isX3 = !!pdfx && /X-3/i.test(pdfx);
  const target = isX1a ? "PDF/X-1a" : isX3 ? "PDF/X-3" : "PDF/X-4";
  const maxVersion = isX1a || isX3 ? 14 : 16;
  const rules: PdfxRule[] = [
    { label: "Perfil de salida declarado", ok: !!outputIntent && (oiHasProfile || !!outputIntent), detail: outputIntent ?? "Falta" },
    { label: "Caja de corte en todas las páginas", ok: noTrim.length === 0, detail: noTrim.length ? `Falta en ${pageList(noTrim)}` : undefined },
    { label: "Todas las fuentes incrustadas", ok: unembedded.length === 0, detail: unembedded.map(u => u.name).join(", ") || undefined },
    { label: "Sin seguridad ni contraseña", ok: !encrypted },
    { label: "Sin elementos interactivos (JavaScript, formularios, multimedia)", ok: !interactive },
    { label: "Indica si tiene reventado (clave Trapped)", ok: /^(true|false)$/i.test(trapped), detail: trapped || "Falta" },
    { label: `Versión de PDF permitida (hasta ${maxVersion / 10})`, ok: version <= maxVersion, detail: `El archivo es PDF ${(version / 10).toFixed(1)}` },
  ];
  rules.push({ label: "Cajas bien anidadas (corte dentro del sangrado, sangrado dentro del papel)", ok: badBoxes.length === 0, detail: badBoxes.length ? pageList(badBoxes) : undefined });
  rules.push({ label: "Título del documento", ok: hasTitle, detail: hasTitle ? undefined : "Falta en los metadatos" });
  rules.push({ label: "Fechas de creación y modificación", ok: hasDates, detail: hasDates ? undefined : "Faltan en los metadatos" });
  rules.push({ label: "Sin funciones de transferencia ni semitonos propios", ok: !xFlags.transfer && !xFlags.halftone });
  rules.push({ label: "Sin PostScript incrustado ni contenido externo", ok: !xFlags.postscript && !xFlags.external });
  if (!isX1a && !isX3) {
    if (pdfx) rules.push({ label: "Metadatos XMP con la versión de PDF/X", ok: xmpPdfx, detail: xmpPdfx ? undefined : "Declara PDF/X solo en Info" });
    if (outputIntent) rules.push({ label: "Perfil ICC de salida incrustado", ok: oiHasProfile, detail: oiHasProfile ? undefined : "Declara la condición pero no incrusta el perfil" });
  }
  if (isX1a) {
    rules.push({ label: "Sin RGB ni Lab", ok: !anyRGB });
    rules.push({ label: "Sin transparencias", ok: transparency === 0 });
    rules.push({ label: "Sin capas", ok: layers.length === 0 });
    rules.push({ label: "Sin imágenes de 16 bits ni JPEG 2000", ok: !bit16 && !jpx });
  } else {
    rules.push({ label: "Sin RGB sin perfil (DeviceRGB)", ok: !deviceRGB || (!!outputIntent && /rgb/i.test(outputIntent)) });
  }
  const failing = rules.filter(r => !r.ok);
  if (pdfx) {
    if (failing.length) { const f = add("pdfxFail", "error", ""); failing.forEach(r => f.items!.push(r.label + (r.detail ? `: ${r.detail}` : ""))); }
    else passed.add("pdfx");
  } else {
    const f = add("pdfx", system.wantsOutputIntent ? "warn" : "info", "");
    failing.forEach(r => f.items!.push(`${r.label}${r.detail ? `: ${r.detail === "Falta" ? "falta" : r.detail}` : ""}`));
  }

  // controles sin hallazgos = superados
  const relevant = ["edge", "bleed", "safety", "tac", "imgPpi", "imgRgb", "rgbObjects", "spot", "registration", "whiteOverprint", "colorOverprint", "blackKnockout",
    "richBlackText", "knockoutText", "hairline", "pageSize", "trimbox", "jpeg", "shadingRgb", "spotDuplicate", "marksInBleed"];
  if (!cover) relevant.push("gutter"); if (mono) relevant.push("monoColor"); if (techList.length) relevant.push("techOverprint");
  // en un archivo pesado la tinta se midió con poco detalle: no se da por superada
  for (const c of relevant) if (!findings.has(c) && !(light && c === "tac")) passed.add(c);

  // textos de detalle
  for (const f of findings.values()) {
    f.pages = [...new Set(f.pages)].sort((a, b) => a - b);
    const n = f.marks.length;
    const where = f.pages.length ? pageList(f.pages) : "todo el documento";
    const pl = (k: number, s: string, p = "s") => `${k} ${s}${k !== 1 ? p : ""}`;
    const D: Record<string, string> = {
      imgPpi: (() => {
        const ppiOf = (l: string) => +(l.match(/(\d+) ppi/)?.[1] ?? 0);
        const low = f.marks.filter(m => ppiOf(m.label) < hardPpi).length;
        const base = `${pl(n, "imagen", "es")} por debajo de ${minPpi} ppi efectivos (${where}).`;
        return low && low < n ? `${base} De ellas, ${low} por debajo de ${hardPpi} ppi, que es lo que más se va a notar.` : base;
      })(),
      imgRgb: `${pl(n, "imagen", "es")} en RGB (${where}).${color.space ? ` Se convierten con ${color.name}.` : ""}`,
      imgHeavy: `${pl(n, "imagen", "es")} por encima de 800 ppi (${where}).`,
      lineArt: `${pl(n, "dibujo")} de línea por debajo de ${system.lineArtPpi / 2} ppi (${where}).`,
      jpeg: `${pl(n, "imagen", "es")} con compresión JPEG por debajo de calidad 60 (${where}).`,
      bit16: `${pl(n, "imagen", "es")} de 16 bits por canal (${where}).`,
      tac: `Zonas de más de 4 mm² por encima del ${system.tac} % de tinta total en ${where}. Máximo medido: ${Math.max(...f.pages.map(p => pages[p].tacMax))} %.` +
        (light ? ` Medido a ${Math.round(RASTER * 72)} ppi porque el archivo es pesado: puede haber zonas chicas que no aparezcan. Para medirlo en detalle, abrí este punto.` : ""),
      edge: `Elementos que tocan el corte sin pasar al sangrado en ${where}.`,
      bleed: `El sangrado disponible es de ${f.items![0] ?? "0 mm"}; ${system.short} pide ${fmtMm(system.bleedMm)} mm (${where}).`,
      safety: (() => {
        // folios, cabeceras y pestañas de la maqueta se repiten en el mismo lugar de muchas páginas:
        // se cuentan aparte para que no tapen los casos sueltos
        const key = (m: { page: number; rect: Rect }) => `${m.page % 2}:${Math.round(m.rect[0] / 6)}:${Math.round(m.rect[1] / 6)}`;
        const cnt = new Map<string, Set<number>>();
        for (const m of f.marks) { const k = key(m); (cnt.get(k) ?? cnt.set(k, new Set()).get(k)!).add(m.page); }
        const rep = f.marks.filter(m => cnt.get(key(m))!.size >= 5), loose = f.marks.filter(m => cnt.get(key(m))!.size < 5);
        if (!rep.length) return `${pl(n, "bloque")} de texto a menos de ${content.safetyMm} mm del corte (${where}).`;
        const repPages = new Set(rep.map(m => m.page)).size;
        const looseTxt = loose.length ? `${pl(loose.length, "bloque")} de texto suelto a menos de ${content.safetyMm} mm del corte (${pageList(loose.map(m => m.page))}), y ` : "";
        return `${looseTxt}${loose.length ? "e" : "E"}lementos de la maqueta que se repiten (folios, cabeceras o pestañas) a menos de ${content.safetyMm} mm del corte en ${pl(repPages, "página")}. Si están ahí a propósito, confirmá con la imprenta su tolerancia de corte.`;
      })(),
      gutter: `${pl(n, "bloque")} de texto a menos de ${content.gutterMm} mm del lomo (${where}).`,
      monoColor: `El perfil indica un interior a una tinta, pero hay elementos en color en ${where}.`,
      spot: `Tintas planas encontradas: ${f.items!.join(", ")} (${where}).`,
      registration: `Elementos en color de registro en ${where}.`,
      rgbObjects: `${pl(n, "objeto")} vectoriales o de texto en RGB (${where}).`,
      whiteOverprint: `${pl(n, "objeto")} blanco${n !== 1 ? "s" : ""} con sobreimpresión en ${where}: no se van a ver impresos.`,
      colorOverprint: `${pl(n, "objeto")} de color con sobreimpresión en ${where}.`,
      blackKnockout: `${pl(n, "bloque")} de texto negro chico que perfora un fondo de color (${where}).`,
      techOverprint: `${f.items!.join(", ")}: sin sobreimpresión en ${where}.`,
      technical: `Tintas técnicas en el archivo: ${f.items!.join(", ")}.`,
      spotDuplicate: `Hay tintas planas que parecen la misma con nombres distintos.`,
      shadingRgb: `Degradados definidos en RGB en ${where}.`,
      richBlackText: `${pl(n, "bloque")} de texto de menos de 12 pt en negro compuesto (${where}).`,
      rgbBlackText: `${pl(n, "bloque")} de texto en negro o gris RGB (${where}).`,
      tinyText: `${pl(n, "bloque")} de texto de menos de 5,5 pt (${where}).`,
      knockoutText: `${pl(n, "bloque")} de texto blanco de menos de 9 pt sobre fondos de tres o cuatro tintas (${where}).`,
      outlines: `Renglones de trazados con forma de letra y sin texto real en ${where}.`,
      hairline: `${pl(n, "filete")} más fino${n !== 1 ? "s" : ""} que ${String(system.minLinePt).replace(".", ",")} pt (${where}).`,
      fonts: `${pl(unembedded.length, "fuente")} sin incrustar.`,
      type3: `Hay fuentes Type 3 en ${where}.`,
      pdfx: failing.length ? `No declara ningún estándar PDF/X. Para exportarlo como ${target} falta resolver ${pl(failing.length, "punto")}:` : `No declara ningún estándar PDF/X, pero ya cumple las reglas principales de ${target}: solo falta exportarlo con ese ajuste.`,
      pdfxFail: `Declara ${pdfx} pero no cumple ${pl(failing.length, "regla")} del estándar:`,
      outputIntent: `El archivo no declara un perfil de salida.`,
      layers: `El PDF contiene capas: ${f.items!.join(", ")}.`,
      hiddenLayers: `${pl(f.items!.length, "capa")} oculta${f.items!.length !== 1 ? "s" : ""}: ${f.items!.join(", ")}.`,
      rotated: `${pl(f.pages.length, "página")} con rotación (${where}).`,
      marks: `Hay marcas o elementos fuera de la caja de sangrado en ${where}.`,
      marksInBleed: `Las marcas de corte arrancan dentro del sangrado en ${where}.`,
      annots: `Hay comentarios o campos en ${where}: ${f.items!.join(", ")}.`,
      transparency: `El archivo usa transparencias (sombras, opacidades, modos de fusión o máscaras).`,
      trimbox: `${pl(f.pages.length, "página")} sin caja de corte definida.`,
      pageSize: `Formato principal: ${mainSize[0]} mm.`,
      blank: `${pl(f.pages.length, "página")} en blanco (${where}).`,
      encrypted: `El PDF tiene seguridad activada.`,
      spineText: `Texto sobre un pliegue (lomo, solapas o vueltas).`,
      orphan: `${pl(n, "línea")} huérfana${n !== 1 ? "s" : ""}: primera línea de párrafo sola al pie (${where}).`,
      widow: `${pl(n, "línea")} viuda${n !== 1 ? "s" : ""}: última línea de párrafo sola arriba (${where}).`,
      hyphenLadder: `${pl(n, "escalera")} de más de tres guiones seguidos (${where}).`,
      pageTurnHyphen: `${pl(n, "palabra")} cortada${n !== 1 ? "s" : ""} entre una página impar y la siguiente (${where}).`,
      headOnOpening: `${pl(n, "apertura")} de capítulo con cabecera (${where}).`,
      chapterOdd: `${pl(n, "capítulo")} que empieza${n !== 1 ? "n" : ""} en página par (${where}).`,
      repeatedWord: `${pl(n, "palabra")} repetida${n !== 1 ? "s" : ""} (${where}).`,
      spelling: f.items!.length > 1 ? `${pl(f.items!.length, "palabra")} que no está${f.items!.length !== 1 ? "n" : ""} en el diccionario. Muchas serán nombres o términos correctos:` : f.items![0] ?? "",
      runningHead: `${pl(f.items!.length, "cabecera")} que nombra${f.items!.length !== 1 ? "n" : ""} otro capítulo:`,
      toc: f.items!.length > 1 ? `${pl(f.items!.length, "entrada")} del índice no coincide${f.items!.length !== 1 ? "n" : ""} con la página real:` : f.items![0] ?? "",
    };
    if (D[f.check]) { f.detail = f.marks.length >= 400 ? D[f.check].replace(/^400 /, "Más de 400 ") : D[f.check]; if (["bleed", "spot", "technical", "layers", "techOverprint", "annots", "hiddenLayers"].includes(f.check)) f.items = []; if (f.check === "spelling" && f.items!.length === 1) f.items = []; if (f.check === "toc" && f.items!.length === 1) f.items = []; }
    else if (f.detail) { /* ya trae su resumen */ }
    else if (f.items && f.items.length) { f.detail = f.items[0]; f.items = f.items.slice(1); }
  }

  for (const f of findings.values()) for (const p of f.pages) {
    const pg = pages[p]; if (pg && sevRank(f.sev) > sevRank(pg.status)) pg.status = f.sev;
  }

  const list = [...findings.values()].sort((a, b) => sevRank(b.sev) - sevRank(a.sev) || order(a.group) - order(b.group));
  const counts = { error: 0, warn: 0, info: 0 };
  list.forEach(f => { if (f.sev !== "ok") counts[f.sev]++; });
  const verdict: Sev = counts.error ? "error" : counts.warn ? "warn" : "ok";
  // ¿el perfil elegido se corresponde con el libro? (tintas, país del ISBN)
  const suggest: NonNullable<Report["suggest"]> = { reasons: [] };
  if (mono && !cover) {
    const colorPages = pages.filter(p => p.plates.c + p.plates.m + p.plates.y > 0.01).length;
    if (colorPages >= Math.max(3, nPages * 0.5)) { suggest.inks = "4"; suggest.reasons.push(`${colorPages} de ${nPages} páginas tienen color`); }
  }
  const isbnLand = valid13.length ? Object.entries(ISBN_PREFIX).find(([, ps]) => ps.some(p => valid13[0].value.startsWith(p)))?.[0] : undefined;
  if (isbnLand && isbnLand !== profile.country) { suggest.country = isbnLand; suggest.reasons.push(`el ISBN ${valid13[0].value} es de ${COUNTRY_NAME[isbnLand]}`); }
  keepDoc(colorIn?.key ?? "main", { doc, pdf, color, texts, bytes: data.length });
  onProgress({ stage: "Listo", pct: 100 });
  return {
    file: { name, size: data.byteLength, pages: nPages, version: `PDF ${(version / 10).toFixed(1)}`,
      producer: infoStr("Producer"), creator: infoStr("Creator"), title: infoStr("Title"), pdfx, outputIntent, encrypted,
      formatMm: `${fmtMm(p0.wMm)} × ${fmtMm(p0.hMm)} mm`, formatName: fmtName },
    profile, pages, findings: list,
    passed: [...passed].filter(c => !findings.has(c)).map(c => ({ check: c, title: COPY[c].title, group: COPY[c].group })),
    fonts: fontList, isbns, counts, verdict, ms: Math.round(performance.now() - t0), spine,
    pdfxCheck: { target: pdfx ?? target, declared: !!pdfx, rules },
    color: { name: color.name, source: color.source, softProof: !!color.space },
    spots: [...allSpots.keys()], technical: techList, layers, suggest: suggest.reasons.length ? suggest : undefined,
    book, coverGeo, barcode, coverTitle, key: colorIn?.key ?? "main",
  };
}

const sevRank = (s: Sev) => (s === "error" ? 3 : s === "warn" ? 2 : s === "info" ? 1 : 0);
const order = (g: Group) => ["archivo", "paginas", "color", "imagenes", "texto", "libro", "aparato", "ortotipografia", "composicion"].indexOf(g);

// ---------- tinta total ----------
// Superficie por encima del límite (mm²), máximo (%) y rectángulo que encierra esas zonas.
export function measureTac(r: Raster, scale: number, limit255: number): { overMm2: number; max: number; rect: Rect | null } {
  let over = 0, fmax = 0; let ob: Rect | null = null;
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const o = (y * r.w + x) * 4; const s = r.px[o] + r.px[o + 1] + r.px[o + 2] + r.px[o + 3];
    if (s > fmax) fmax = s;
    if (s > limit255) {
      over++;
      const X = (x + r.x0) / scale, Y = (y + r.y0) / scale;
      ob = ob ? [Math.min(ob[0], X), Math.min(ob[1], Y), Math.max(ob[2], X + 1 / scale), Math.max(ob[3], Y + 1 / scale)] : [X, Y, X + 1 / scale, Y + 1 / scale];
    }
  }
  const pxMm = 25.4 / (72 * scale);
  return { overMm2: over * pxMm * pxMm, max: Math.round(fmax / 2.55), rect: ob };
}

// Medición de la tinta total en detalle (150 ppi), a pedido y por las páginas que se elijan: sirve
// después de una revisión adaptada a un archivo pesado, o para revisar un capítulo con más cuidado.
// Usa el documento que ya quedó abierto de la revisión; libera memoria página por página.
export interface TacPage { index: number; max: number; overMm2: number; rect: Rect | null; ppi: number }
export function tacDetail(key: string, pages: number[], limitPct: number, rgbPages: number[], onProgress: (done: number, total: number) => void): TacPage[] {
  const st = touch(key);
  if (!st) throw new Error("Sin documento");
  const out: TacPage[] = [];
  const rgb = new Set(rgbPages);
  pages.forEach((i, k) => {
    onProgress(k, pages.length);
    const pg = st.pdf.loadPage(i);
    const b = pg.getBounds("MediaBox") as Rect; free(pg);
    const area = (b[2] - b[0]) * (b[3] - b[1]);
    const FS = Math.min(150 / 72, Math.sqrt(6e6 / Math.max(1, area)));
    const r = rasterCMYK(st.pdf, i, FS, st.color, rgb.has(i));
    const m = measureTac(r, FS, limitPct * 2.55);
    out.push({ index: i, max: m.max, overMm2: m.overMm2, rect: m.rect, ppi: Math.round(FS * 72) });
    mupdf.emptyStore();
  });
  onProgress(pages.length, pages.length);
  return out;
}

// ---------- render para el visor ----------
export interface RenderOut { w: number; h: number; scale: number; rgba: Uint8ClampedArray; cmyk?: Uint8ClampedArray; proof?: Uint8ClampedArray }

export function render(index: number, scale: number, withCmyk: boolean, withProof = false, key = "main"): RenderOut {
  const current = touch(key);
  if (!current) throw new Error("Sin documento");
  const page = current.pdf.loadPage(index);
  const m = mupdf.Matrix.scale(scale, scale);
  const pix = page.toPixmap(m, mupdf.ColorSpace.DeviceRGB, false, false, "View", "MediaBox");
  const w = pix.getWidth(), h = pix.getHeight(), src = pix.getPixels(), st = pix.getStride(), nc = pix.getNumberOfComponents();
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * st + x * nc, d = (y * w + x) * 4; rgba[d] = src[o]; rgba[d + 1] = src[o + 1]; rgba[d + 2] = src[o + 2]; rgba[d + 3] = 255; }
  free(pix, page);
  if (!withCmyk && !withProof) return { w, h, scale, rgba };
  const ras = rasterCMYK(current.pdf, index, scale, current.color, true);
  const cmyk = new Uint8ClampedArray(w * h * 4);
  const cw = Math.min(w, ras.w), ch = Math.min(h, ras.h);
  for (let y = 0; y < ch; y++) cmyk.set(ras.px.subarray(y * ras.w * 4, y * ras.w * 4 + cw * 4), y * w * 4);
  const proof = withProof ? softProof({ ...ras, w, h, px: new Uint8Array(cmyk.buffer) }, current.color) ?? undefined : undefined;
  return { w, h, scale, rgba, cmyk, proof };
}

// Comparación con la versión anterior del documento abierto
export function compareWith(prevData: Uint8Array, key = "main", onProgress?: (pct: number) => void): CompareResult {
  const st = docs.get(key);
  if (!st) throw new Error("Sin documento");
  return compareVersions(prevData, { pdf: st.pdf, texts: st.texts }, onProgress);
}


// Cotejo contra el original aprobado (Word o texto) del documento abierto
export function compareOriginalWith(data: Uint8Array, name: string, key = "main"): OrigResult {
  const st = docs.get(key);
  if (!st) throw new Error("Sin documento");
  const orig = /\.docx$/i.test(name) ? parseDocx(data) : parsePlain(new TextDecoder().decode(data));
  return compareOriginal(orig, st.texts);
}

// Muestra de párrafos para decidir qué diccionarios cargar antes de revisar.
function pageTextPlain(d: mupdf.Document, i: number): string {
  const pg = d.loadPage(i); let st: any;
  try { st = pg.toStructuredText(""); return st.asText(); } catch { return ""; } finally { free(st, pg); }
}
function langsOf(d: mupdf.Document, samples = 40): { family: Family; share: number }[] {
  const n = d.countPages(), step = Math.max(1, Math.floor(n / samples)), paras: string[] = [];
  for (let i = 0; i < n; i += step) {
    for (const p of pageTextPlain(d, i).split(/\n\s*\n/)) { const x = p.replace(/\s+/g, " ").trim(); if (x.split(" ").length >= 8) paras.push(x); }
  }
  return detectMany(paras);
}
export function sampleLangs(data: Uint8Array): { family: Family; share: number }[] {
  const d = mupdf.Document.openDocument(data, "application/pdf");
  try { return langsOf(d); } finally { try { d.destroy(); } catch { /* */ } }
}

// Vistazo antes de revisar: lo que el PDF dice de sí mismo (tintas, ISBN, idioma, formato), para
// avisar si el perfil elegido no coincide antes de gastar una revisión completa. Mira una muestra
// de páginas a baja resolución: tarda unos segundos aun en libros pesados.
export interface Inspect extends Peek {
  isbn: string | null; isbnCountry: string | null;
  sampled: number; colorPages: number; langs: { family: Family; share: number }[];
}
export function inspect(data: Uint8Array): Inspect {
  const d = mupdf.Document.openDocument(data, "application/pdf");
  try {
    const base = peekDoc(d);
    const n = base.pages;
    // ISBN: páginas de créditos (al principio) y contratapa o colofón (al final)
    let isbn: string | null = null;
    for (const i of [...Array(Math.min(n, 8)).keys(), ...[...Array(Math.min(n, 4)).keys()].map(k => n - 1 - k)]) {
      if (isbn) break;
      const v = findIsbns(pageTextPlain(d, i)).find(x => x.length === 13 && isbnValid(x));
      if (v) isbn = v;
    }
    const isbnCountry = isbn ? Object.entries(ISBN_PREFIX).find(([, ps]) => ps.some(p => isbn!.startsWith(p)))?.[0] ?? null : null;
    // color: hasta 12 páginas repartidas por el libro, a muy baja resolución
    const picks = n <= 12 ? [...Array(n).keys()] : [...Array(12).keys()].map(k => Math.round(2 + (k * (n - 5)) / 11));
    let colorPages = 0;
    for (const i of picks) {
      const pg = d.loadPage(i); let pix: any;
      try {
        pix = pg.toPixmap(mupdf.Matrix.scale(0.08, 0.08), mupdf.ColorSpace.DeviceCMYK, false, false, "View", "MediaBox");
        const px = pix.getPixels(), nc = pix.getNumberOfComponents(); let c = 0;
        for (let o = 0; o < px.length; o += nc) if (px[o] > 12 || px[o + 1] > 12 || px[o + 2] > 12) c++;
        if (c / (px.length / nc) > 0.01) colorPages++;
      } catch { /* página que no se puede dibujar: no cuenta */ } finally { free(pix, pg); }
    }
    mupdf.emptyStore();
    return { ...base, isbn, isbnCountry, sampled: picks.length, colorPages, langs: base.cover ? [] : langsOf(d, 16) };
  } finally { try { d.destroy(); } catch { /* */ } }
}

// Vistazo rápido antes de revisar: páginas, tamaño de la primera página y programa (para reconocer si es una cubierta)
export interface Peek { pages: number; wMm: number; hMm: number; creator: string; producer: string; cover: boolean }
export function peek(data: Uint8Array): Peek {
  const d = mupdf.Document.openDocument(data, "application/pdf");
  try { return peekDoc(d); } finally { try { d.destroy(); } catch { /* */ } }
}
function peekDoc(d: mupdf.Document): Peek {
  {
    const n = d.countPages();
    const pg: any = d.loadPage(0);
    let b: number[] = pg.getBounds();
    try { const o = pg.getObject(); if (!o.getInheritable("TrimBox").isNull()) b = pg.getBounds("TrimBox"); } catch { /* */ }
    const w = (b[2] - b[0]) * 25.4 / 72, h = (b[3] - b[1]) * 25.4 / 72;
    const info = (d as any).getTrailer?.()?.get("Info");
    const str = (k: string) => { try { const v = info?.get(k); return v && !v.isNull() ? v.asString() : ""; } catch { return ""; } };
    const out = { pages: n, wMm: w, hMm: h, creator: str("Creator"), producer: str("Producer"), cover: n <= 2 && w > h * 1.25 };
    free(pg);
    return out;
  }
}
