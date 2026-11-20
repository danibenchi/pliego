// Lectura del código de barras EAN-13 de la cubierta, en el navegador (ZXing, Apache-2.0),
// y medición de lo que hace que un lector de librería lo lea o no: tamaño, altura, márgenes
// en blanco y color de barras y fondo (los lectores usan luz roja).
import * as mupdf from "mupdf";
import { MultiFormatReader, BarcodeFormat, DecodeHintType, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, ResultMetadataType } from "@zxing/library";
import type { ColorSetup } from "./color";
import { rasterCMYK } from "./color";

export type R = [number, number, number, number];
export interface BarcodeInfo {
  digits: string; addon: string | null; magnification: number; moduleMm: number; heightMm: number;
  quietLeft: boolean; quietRight: boolean; bars: number[]; space: number[]; rect: R;
}

const DPI = 200;

function decode(lum: Uint8ClampedArray, w: number, h: number) {
  const r = new MultiFormatReader();
  r.setHints(new Map<any, any>([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]], [DecodeHintType.TRY_HARDER, true]]));
  try { return r.decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(lum, w, h)))); } catch { return null; }
}

export function scanBarcode(pdf: any, index: number, area: R | null, color: ColorSetup): BarcodeInfo | null {
  const s = DPI / 72;
  const page = pdf.loadPage(index);
  const pix = page.toPixmap(mupdf.Matrix.scale(s, s), mupdf.ColorSpace.DeviceGray, false, false, "View", "MediaBox");
  const W = pix.getWidth(), H = pix.getHeight(), st = pix.getStride();
  const src = pix.getPixels().slice();
  const [bx0, by0] = pix.getBounds();
  try { pix.destroy(); page.destroy(); } catch { /* */ }
  // recorte al área de búsqueda (contratapa) y, si no aparece, búsqueda por ventanas
  const AX0 = area ? Math.max(0, Math.floor(area[0] * s - bx0)) : 0, AY0 = area ? Math.max(0, Math.floor(area[1] * s - by0)) : 0;
  const AX1 = area ? Math.min(W, Math.ceil(area[2] * s - bx0)) : W, AY1 = area ? Math.min(H, Math.ceil(area[3] * s - by0)) : H;
  if (AX1 - AX0 < 50 || AY1 - AY0 < 50) return null;
  const tryAt = (x0: number, y0: number, w: number, h: number) => {
    const lum = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lum[y * w + x] = src[(y + y0) * st + (x + x0)];
    let r = decode(lum, w, h);
    if (r) return { res: r, x0, y0, w, h, rotated: false, L: lum, LW: w, LH: h };
    const rot = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rot[x * h + (h - 1 - y)] = lum[y * w + x];
    r = decode(rot, h, w);
    return r ? { res: r, x0, y0, w, h, rotated: true, L: rot, LW: h, LH: w } : null;
  };
  let hit = tryAt(AX0, AY0, AX1 - AX0, AY1 - AY0);
  if (!hit) {
    const mmPx = DPI / 25.4, tw = Math.round(80 * mmPx), th = Math.round(60 * mmPx);
    outer: for (let y = AY1 - th; y > AY0 - th; y -= Math.round(th / 2)) for (let x = AX0; x < AX1; x += Math.round(tw / 2)) {
      const x0 = Math.max(AX0, x), y0 = Math.max(AY0, y), w = Math.min(tw, AX1 - x0), h = Math.min(th, AY1 - y0);
      if (w < 100 || h < 100) continue;
      hit = tryAt(x0, y0, w, h); if (hit) break outer;
    }
  }
  if (!hit) return null;
  const { res, rotated, L, LW, LH } = hit, ax0 = hit.x0, ay0 = hit.y0, h = hit.h;
  const pts = res.getResultPoints();
  const [p0, p1] = [pts[0], pts[pts.length - 1]];
  const y = Math.round((p0.getY() + p1.getY()) / 2);
  const mod = (p1.getX() - p0.getX()) / 92;
  const moduleMm = mod * 25.4 / DPI;
  const at = (x: number, yy: number) => (x < 0 || yy < 0 || x >= LW || yy >= LH) ? 255 : L[Math.round(yy) * LW + Math.round(x)];
  // umbral propio de este código: punto medio entre lo más oscuro y lo más claro de la línea de lectura
  let mn = 255, mx = 0;
  for (let x = p0.getX() - 2 * mod; x <= p1.getX() + 2 * mod; x++) { const v = at(x, y); if (v < mn) mn = v; if (v > mx) mx = v; }
  const thr = (mn + mx) / 2;
  // altura de las barras sobre la primera barra de la guarda izquierda
  const bx = p0.getX() - mod;
  let up = y, down = y;
  // la barra puede no caer justo en bx: buscamos la columna más oscura cerca
  let bxx = bx; { let best = 255; for (let dx = -mod; dx <= mod; dx += 0.5) { const v = at(bx + dx, y); if (v < best) { best = v; bxx = bx + dx; } } }
  while (up > 0 && (at(bxx, up - 1) < thr || at(bxx, up - 2) < thr)) up--;
  while (down < LH - 1 && (at(bxx, down + 1) < thr || at(bxx, down + 2) < thr)) down++;
  const heightMm = (down - up) * 25.4 / DPI;
  // márgenes en blanco: 11 módulos a la izquierda, 7 a la derecha
  const startX = p0.getX() - 1.5 * mod, endX = p1.getX() + 1.5 * mod;
  const clear = (x0: number, x1: number) => { for (let yy = y - 6; yy <= y + 6; yy += 3) for (let x = x0; x <= x1; x++) if (at(x, yy) < thr - (mx - mn) * 0.15) return false; return true; };
  const quietLeft = clear(startX - 10.5 * mod, startX - 1), quietRight = clear(endX + 1, endX + 6.5 * mod);
  // rectángulo en coordenadas de página
  const toPage = (x: number, yy: number): [number, number] => rotated
    ? [(ax0 + yy) / s + bx0 / s, (ay0 + (LW - 1 - x)) / s + by0 / s]
    : [(ax0 + x + bx0) / s, (ay0 + yy + by0) / s];
  const c1 = toPage(startX - 11 * mod, up), c2 = toPage(endX + 7 * mod, down);
  const rect: R = [Math.min(c1[0], c2[0]), Math.min(c1[1], c2[1]), Math.max(c1[0], c2[0]), Math.max(c1[1], c2[1])];
  // color de barras y espacios en CMYK, sobre la línea de lectura
  const bars = [0, 0, 0, 0], space = [0, 0, 0, 0]; let nb = 0, ns = 0;
  try {
    const ras = rasterCMYK(pdf, index, s, color, true);
    for (let x = startX; x <= endX; x += 1) {
      const [X, Y] = toPage(x, y);
      const px = Math.floor(X * s - ras.x0), py = Math.floor(Y * s - ras.y0);
      if (px < 0 || py < 0 || px >= ras.w || py >= ras.h) continue;
      const o = (py * ras.w + px) * 4, g = at(x, y);
      const v = [ras.px[o] / 255, ras.px[o + 1] / 255, ras.px[o + 2] / 255, ras.px[o + 3] / 255];
      // con códigos chicos cada barra o espacio mide uno o dos píxeles: solo se toma el color donde el
      // píxel y sus vecinos son del mismo tipo, para no mezclar barra con espacio
      const lo = thr - (mx - mn) * 0.25, hi = thr + (mx - mn) * 0.25;
      if (g < lo && at(x - 1, y) < lo && at(x + 1, y) < lo) { v.forEach((c, k) => (bars[k] += c)); nb++; }
      else if (g > hi && at(x - 1, y) > hi && at(x + 1, y) > hi) { v.forEach((c, k) => (space[k] += c)); ns++; }
    }
  } catch { /* sin color */ }
  const addon = (res.getResultMetadata()?.get(ResultMetadataType.UPC_EAN_EXTENSION) as string | undefined) ?? null;
  return { digits: res.getText(), addon, magnification: moduleMm / 0.33, moduleMm, heightMm, quietLeft, quietRight,
    bars: bars.map(v => nb ? v / nb : 0), space: space.map(v => ns ? v / ns : 0), rect };
}
