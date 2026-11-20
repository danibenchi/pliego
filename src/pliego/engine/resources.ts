// Recorre los recursos de una página (y de sus formularios) para leer datos que el dispositivo
// de dibujo no da: propiedades de cada imagen, espacio de color de degradados y nombres de tintas.

export interface ImageProps { w: number; h: number; bpc: number; mask: boolean; cs: string; filter: string; jpegQ: number | null; smask: boolean; icc: boolean }
export interface ResScan { images: Map<string, ImageProps>; shadings: { cs: string; spot?: string }[]; spots: Set<string>; rgbShading: boolean; transfer?: boolean; postscript?: boolean; external?: boolean; halftone?: boolean }

const STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const STD_SUM = STD_LUMA.reduce((a, b) => a + b, 0);

// Estima la calidad de un JPEG (escala 1-100 del estándar IJG) a partir de su tabla de cuantización de luminancia.
export function jpegQuality(b: Uint8Array): number | null {
  for (let i = 0; i < Math.min(b.length - 4, 65536); i++) {
    if (b[i] !== 0xff || b[i + 1] !== 0xdb) continue;
    const len = (b[i + 2] << 8) | b[i + 3];
    let p = i + 4;
    const end = i + 2 + len;
    while (p < end) {
      const pq = b[p] >> 4, tq = b[p] & 15; p++;
      const n = 64 * (pq ? 2 : 1);
      if (tq === 0) {
        let sum = 0;
        for (let k = 0; k < 64; k++) sum += pq ? (b[p + 2 * k] << 8) | b[p + 2 * k + 1] : b[p + k];
        const s = (sum * 100) / STD_SUM;
        const q = s <= 100 ? (200 - s) / 2 : 5000 / s;
        return Math.max(1, Math.min(100, Math.round(q)));
      }
      p += n;
    }
  }
  return null;
}

// Decodifica ASCII85 (algunos generadores envuelven el JPEG con ese filtro).
function a85(b: Uint8Array): Uint8Array {
  const out: number[] = []; let tuple = 0, n = 0;
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 0x7e) break; // ~>
    if (c <= 32) continue;
    if (c === 0x7a && n === 0) { out.push(0, 0, 0, 0); continue; } // z
    tuple = tuple * 85 + (c - 33); n++;
    if (n === 5) { out.push((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255); tuple = 0; n = 0; }
    if (out.length > 70000) break;
  }
  return new Uint8Array(out);
}
function hexd(b: Uint8Array): Uint8Array {
  const out: number[] = []; let hi = -1;
  for (let i = 0; i < b.length && out.length < 70000; i++) {
    const c = b[i]; if (c === 0x3e) break;
    const v = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
    if (v < 0) continue;
    if (hi < 0) hi = v; else { out.push(hi * 16 + v); hi = -1; }
  }
  return new Uint8Array(out);
}

function csOf(o: any): { cs: string; spot?: string; icc: boolean } {
  if (!o || o.isNull()) return { cs: "?", icc: false };
  o = o.resolve?.() ?? o;
  if (o.isName()) { const n = o.asName(); return { cs: n.replace("Device", ""), icc: false }; }
  if (o.isArray()) {
    const first = o.get(0).asName();
    if (first === "ICCBased") { const N = o.get(1).get("N").asNumber(); return { cs: N === 4 ? "CMYK" : N === 3 ? "RGB" : "Gray", icc: true }; }
    if (first === "Separation") { const nm = o.get(1).asName(); return { cs: "Separation", spot: nm, icc: false }; }
    if (first === "DeviceN") { const names: string[] = []; o.get(1).forEach((v: any) => names.push(v.asName())); return { cs: "DeviceN", spot: names.join(", "), icc: false }; }
    if (first === "Indexed") { const base = csOf(o.get(1)); return { cs: "Indexed " + base.cs, spot: base.spot, icc: base.icc }; }
    return { cs: first, icc: false };
  }
  return { cs: "?", icc: false };
}

const PROCESS = /^(cyan|magenta|yellow|black|none|all)$/i;

export function scanResources(res: any, readRaw: (o: any) => Uint8Array | null, out?: ResScan, depth = 0): ResScan {
  out = out ?? { images: new Map(), shadings: [], spots: new Set(), rgbShading: false };
  if (!res || res.isNull() || depth > 6) return out;
  const addSpots = (s?: string) => s?.split(",").map(x => x.trim()).filter(x => x && !PROCESS.test(x)).forEach(x => out!.spots.add(x));
  const cs = res.get("ColorSpace");
  if (cs && cs.isDictionary()) cs.forEach((v: any) => addSpots(csOf(v).spot));
  const sh = res.get("Shading");
  const shade = (s: any) => {
    s = s.resolve?.() ?? s;
    const c = csOf(s.get("ColorSpace"));
    out!.shadings.push({ cs: c.cs, spot: c.spot });
    if (c.cs === "RGB") out!.rgbShading = true;
    addSpots(c.spot);
  };
  if (sh && sh.isDictionary()) sh.forEach((s: any) => shade(s));
  const pat = res.get("Pattern");
  if (pat && pat.isDictionary()) pat.forEach((p: any) => {
    p = p.resolve?.() ?? p;
    try { if (p.get("PatternType").asNumber() === 2) shade(p.get("Shading")); else scanResources(p.get("Resources"), readRaw, out, depth + 1); } catch { /* */ }
  });
  // reglas de PDF/X: funciones de transferencia, semitonos propios, PostScript y contenido externo
  const gs = res.get("ExtGState");
  if (gs && gs.isDictionary()) gs.forEach((g: any) => {
    try {
      g = g.resolve?.() ?? g;
      for (const k of ["TR", "TR2"]) { const v = g.get(k); if (v && !v.isNull() && !(v.isName() && /^(Identity|Default)$/.test(v.asName()))) out!.transfer = true; }
      const ht = g.get("HT"); if (ht && !ht.isNull() && !(ht.isName() && ht.asName() === "Default")) out!.halftone = true;
    } catch { /* */ }
  });
  const xo = res.get("XObject");
  if (xo && xo.isDictionary()) xo.forEach((x: any) => {
    const ref = x;
    x = x.resolve?.() ?? x;
    const sub = x.get("Subtype").asName();
    if (sub === "PS" || (sub === "Form" && !x.get("Subtype2").isNull() && x.get("Subtype2").asName() === "PS")) { out!.postscript = true; return; }
    if (!x.get("Ref").isNull() || !x.get("F").isNull()) out!.external = true;
    if (sub === "Form") { scanResources(x.get("Resources"), readRaw, out, depth + 1); return; }
    if (sub !== "Image") return;
    const w = x.get("Width").asNumber(), h = x.get("Height").asNumber();
    const key = `${w}x${h}`;
    if (out!.images.has(key)) return;
    const mask = !x.get("ImageMask").isNull() && x.get("ImageMask").asBoolean();
    const bpcO = x.get("BitsPerComponent");
    const f = x.get("Filter");
    const filters: string[] = [];
    if (f && !f.isNull()) { if (f.isArray()) f.forEach((v: any) => filters.push(v.asName())); else filters.push(f.asName()); }
    const c = mask ? { cs: "Máscara", icc: false } as ReturnType<typeof csOf> : csOf(x.get("ColorSpace"));
    addSpots(c.spot);
    let jpegQ: number | null = null;
    if (filters.includes("DCTDecode")) {
      let raw = readRaw(ref);
      for (const fl of filters) { if (!raw || fl === "DCTDecode") break; raw = fl === "ASCII85Decode" ? a85(raw) : fl === "ASCIIHexDecode" ? hexd(raw) : null; }
      if (raw) jpegQ = jpegQuality(raw);
    }
    out!.images.set(key, { w, h, bpc: bpcO && !bpcO.isNull() ? bpcO.asNumber() : (filters.includes("JPXDecode") ? 8 : 1), mask, cs: c.cs, filter: filters.join("+") || "Sin compresión", jpegQ, smask: !x.get("SMask").isNull(), icc: c.icc });
  });
  return out;
}

// Variantes de nombre de una misma tinta (PANTONE 185 C / 185 CV / 185 U...).
export function spotKey(name: string) {
  return name.toUpperCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " ").replace(/^PANTONE\s*/, "PANTONE ")
    .replace(/\s+(C|CV|CVC|CVU|CP|U|UP|M|EC|PC|TCX|TPX)$/, "").trim();
}

export const TECHNICAL = /(troquel|die ?cut|die ?line|dieline|stanz|cut ?contour|cutcontour|contorno de corte|barniz|varnish|uv ?spot|spot ?uv|lack|relieve|emboss|deboss|foil|stamping|estampad|hot ?foil|stamp|blanco|white|wei(ss|ß)|braille|plegado|perfor|fold|hendido|crease)/i;
