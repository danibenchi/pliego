// Gestión de color: perfil de la imprenta (ICC), tramado a CMYK y simulación en papel.
//
// MuPDF, al renderizar a DeviceCMYK, deja intactos los valores CMYK del PDF y pasa los grises a la
// plancha de negro, que es lo que queremos para medir tinta. Pero convierte el RGB con un perfil
// genérico. Para que el RGB se convierta con el perfil de la imprenta sin tocar el CMYK nativo,
// hacemos un segundo render hacia el ICC con DefaultCMYK = ese mismo ICC (identidad para el CMYK),
// y combinamos: donde el primer render es solo negro (grises) gana el primero; en el resto, el segundo.
import * as mupdf from "mupdf";

export interface ColorSetup { space: mupdf.ColorSpace | null; name: string; source: "pdf" | "usuario" | "referencia" | "ninguno"; iccObj: any | null }

export function setupColor(pdf: any, userIcc: Uint8Array | null, userName: string | null, fallback: Uint8Array | null): ColorSetup {
  let bytes: Uint8Array | null = null, name = "", source: ColorSetup["source"] = "ninguno";
  const root = pdf?.getTrailer().get("Root");
  try {
    const oi = root?.get("OutputIntents");
    if (oi && oi.isArray() && oi.length > 0) {
      const o = oi.get(0);
      const prof = o.get("DestOutputProfile");
      if (prof && !prof.isNull() && prof.isStream()) {
        bytes = prof.readStream().asUint8Array().slice();
        const id = o.get("OutputConditionIdentifier");
        name = id && !id.isNull() ? id.asString() : "Perfil del PDF";
        source = "pdf";
      }
    }
  } catch { /* sin perfil */ }
  if (userIcc) { bytes = userIcc; name = userName ?? "Perfil de la imprenta"; source = "usuario"; }
  if (!bytes && fallback) { bytes = fallback; name = "FOGRA39 (estucado, referencia)"; source = "referencia"; }
  // El perfil de salida declarado hace que MuPDF reinterprete el CMYK al renderizar: lo quitamos de la copia en memoria.
  try { if (root && !root.get("OutputIntents").isNull()) root.delete("OutputIntents"); } catch { /* */ }
  if (!bytes || !pdf) return { space: null, name: "Genérico de MuPDF", source: "ninguno", iccObj: null };
  try {
    const space = new mupdf.ColorSpace(bytes, name);
    if (space.getNumberOfComponents() !== 4) return { space: null, name: "Genérico de MuPDF", source: "ninguno", iccObj: null };
    const st = pdf.addStream(bytes, { N: 4, Alternate: pdf.newName("DeviceCMYK") });
    const arr = pdf.newArray(); arr.push(pdf.newName("ICCBased")); arr.push(st);
    return { space, name, source, iccObj: arr };
  } catch {
    return { space: null, name: "Genérico de MuPDF", source: "ninguno", iccObj: null };
  }
}

export interface Raster { w: number; h: number; x0: number; y0: number; scale: number; px: Uint8Array }

// Libera objetos de MuPDF en el acto: sin esto la memoria del motor crece página a página
// hasta que el navegador corta el análisis en los libros ilustrados.
export function free(...objs: any[]) { for (const o of objs) { try { o?.destroy?.(); } catch { /* ya liberado */ } } }

function copyPix(pix: mupdf.Pixmap): { w: number; h: number; x0: number; y0: number; px: Uint8Array } {
  const w = pix.getWidth(), h = pix.getHeight(), st = pix.getStride(), n = pix.getNumberOfComponents(), src = pix.getPixels();
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) { let o = y * st, d = y * w * 4; for (let x = 0; x < w; x++, o += n, d += 4) { out[d] = src[o]; out[d + 1] = src[o + 1]; out[d + 2] = src[o + 2]; out[d + 3] = src[o + 3]; } }
  const b = pix.getBounds();
  return { w, h, x0: b[0], y0: b[1], px: out };
}

export function rasterCMYK(pdf: any, index: number, scale: number, color: ColorSetup, withProfile: boolean): Raster {
  const m = mupdf.Matrix.scale(scale, scale);
  const page = pdf.loadPage(index);
  const p1 = page.toPixmap(m, mupdf.ColorSpace.DeviceCMYK, false, false, "View", "MediaBox");
  const a = copyPix(p1); free(p1);
  if (!withProfile || !color.space || !color.iccObj) { free(page); return { ...a, scale }; }
  const res = page.getObject().getInheritable("Resources");
  let csd = res.get("ColorSpace");
  const had = !csd.isNull() && !csd.get("DefaultCMYK").isNull();
  if (!had) {
    if (csd.isNull()) { csd = pdf.newDictionary(); res.put("ColorSpace", csd); }
    csd.put("DefaultCMYK", color.iccObj);
  }
  let b;
  const page2 = pdf.loadPage(index);
  try { const p2 = page2.toPixmap(m, color.space, false, false, "View", "MediaBox"); b = copyPix(p2); free(p2); }
  finally { free(page2); if (!had) csd.delete("DefaultCMYK"); free(page); }
  if (b.w !== a.w || b.h !== a.h) return { ...a, scale };
  const A = a.px, B = b.px;
  for (let i = 0; i < A.length; i += 4) if (A[i] | A[i + 1] | A[i + 2]) { A[i] = B[i]; A[i + 1] = B[i + 1]; A[i + 2] = B[i + 2]; A[i + 3] = B[i + 3]; }
  return { ...a, scale };
}

// Simulación en papel: interpreta los valores CMYK con el perfil de la imprenta y los lleva a pantalla.
export function softProof(r: Raster, color: ColorSetup): Uint8ClampedArray | null {
  if (!color.space) return null;
  const pix = new mupdf.Pixmap(color.space, [0, 0, r.w, r.h], false);
  pix.getPixels().set(r.px);
  const rgb = pix.convertToColorSpace(mupdf.ColorSpace.DeviceRGB);
  const st = rgb.getStride(), n = rgb.getNumberOfComponents(), src = rgb.getPixels();
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const o = y * st + x * n, d = (y * r.w + x) * 4; out[d] = src[o]; out[d + 1] = src[o + 1]; out[d + 2] = src[o + 2]; out[d + 3] = 255; }
  free(rgb, pix);
  return out;
}
