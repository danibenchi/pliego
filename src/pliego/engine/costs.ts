// Lo que cuesta: el impacto económico de lo que encontró la revisión (pliegos, planchas,
// color accidental en impresión bajo demanda, lomo). Son cuentas, no presupuestos.
import type { Report } from "./analyze";
import { resolve, PAPERS } from "./profiles";

export interface Cost { tone: "save" | "risk" | "info"; title: string; text: string }
const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("es", { maximumFractionDigits: 1 });
const pl = (n: number, s: string, p = s + "s") => `${n} ${n === 1 ? s : p}`;

export function costs(r: Report): Cost[] {
  if (r.profile.piece !== "interior") return [];
  const out: Cost[] = [];
  const { system } = resolve(r.profile);
  const n = r.pages.length;
  const colorPage = (p: Report["pages"][0]) => p.plates.c + p.plates.m + p.plates.y > 0.0004 || p.spots.length > 0;
  const color = r.pages.filter(colorPage).map(p => p.index);
  const blanks = r.pages.filter(p => p.blank).map(p => p.index);
  const pod = system.id.startsWith("pod-");
  const platform = system.id === "pod-kdp" ? "KDP" : "IngramSpark";

  // color accidental en impresión bajo demanda: el precio se calcula por libro, no por página
  if (pod && r.profile.colorMode === "mono" && color.length > 0 && color.length <= Math.max(3, n * 0.1)) {
    out.push({ tone: "risk", title: `${pl(color.length, "página")} con color en un libro en blanco y negro`,
      text: `En ${platform} el interior se elige entero en blanco y negro o en color: si lo subís en color por estas ${pl(color.length, "página")} (${color.slice(0, 8).map(p => p + 1).join(", ")}${color.length > 8 ? "…" : ""}), se cobra todo el libro como color; si lo subís en blanco y negro, se imprimen en gris. Pasalas a escala de grises.` });
  }
  if (pod && r.profile.colorMode === "cmyk" && color.length > 0 && color.length < n * 0.15) {
    out.push({ tone: "info", title: `Solo ${pl(color.length, "página")} de ${n} usan color`,
      text: `En ${platform} todo el libro se imprime y se cobra como color aunque solo lo usen estas páginas. Si el color no es esencial, en blanco y negro el costo por ejemplar baja mucho.` });
  }

  // offset: pliegos y planchas
  const sig = system.signature;
  if (sig > 2) {
    const full = Math.floor(n / sig), rest = n % sig;
    if (rest) {
      const toClose = sig - rest;
      const blankEnd = (() => { let k = 0; for (let i = n - 1; i >= 0 && r.pages[i].blank; i--) k++; return k; })();
      if (rest <= blanks.length && rest <= 4) out.push({ tone: "save", title: `Sobran ${pl(rest, "página")} para cerrar en ${pl(full, "pliego")}`,
        text: `El libro tiene ${n} páginas: ${pl(full, "pliego")} de ${sig} y ${pl(rest, "página")} sueltas. Hay ${pl(blanks.length, "página en blanco", "páginas en blanco")}${blankEnd ? ` (${blankEnd} al final)` : ""}: sacando ${rest} de ellas, cierra justo y te ahorrás un pliego entero de impresión y encuadernación.` });
      else out.push({ tone: rest <= sig / 4 ? "save" : "info", title: `Faltan ${pl(toClose, "página")} para completar el último pliego`,
        text: `${n} páginas son ${pl(full, "pliego")} de ${sig} más ${pl(rest, "página")}. La imprenta va a agregar ${pl(toClose, "página en blanco", "páginas en blanco")} o cobrar un pliego partido${rest <= 4 ? `. Con ${pl(rest, "página")} menos, cerrás en ${pl(full, "pliego")}` : `. Si podés llegar a ${(full + 1) * sig} páginas, aprovechás el papel que se paga igual`}.` });
    }
    if (r.profile.colorMode === "cmyk" && color.length > 0) {
      const sigs = Math.ceil(n / sig);
      const colorSigs = new Set(color.map(p => Math.floor(p / sig))).size;
      if (colorSigs < sigs) {
        const all4 = sigs * 2 * 4, mixed = colorSigs * 2 * 4 + (sigs - colorSigs) * 2;
        out.push({ tone: "save", title: `El color está en ${colorSigs} de ${sigs} pliegos`,
          text: `Imprimiendo a cuatro colores solo esos pliegos y el resto a una tinta, el libro pasa de unas ${all4} planchas a ${mixed}. Si agrupás las páginas con color en menos pliegos, ahorrás todavía más. Consultalo con la imprenta.` });
      }
    }
  }
  if (pod && n % 2) out.push({ tone: "risk", title: "Número de páginas impar", text: `${platform} necesita un número par de páginas: va a agregar una en blanco al final.` });

  // lomo: cuánto se mueve con cada cambio de extensión
  const paper = PAPERS.find(p => p.id === r.profile.paperId);
  const perLeaf = r.profile.mmPerLeaf ?? paper?.mmPerLeaf;
  if (perLeaf) {
    const step = sig > 2 ? sig : 16;
    out.push({ tone: "info", title: "Cómo se mueve el lomo",
      text: `Con ${r.profile.mmPerLeaf && r.profile.printerName ? `el papel de ${r.profile.printerName} medido en la referencia` : paper?.name ?? "este papel"} (${String(Math.round(perLeaf * 1000) / 1000).replace(".", ",")} mm por hoja), el lomo de ${n} páginas mide unos ${fmt(Math.ceil(n / 2) * perLeaf)} mm. Cada ${step} páginas más suman ${fmt(step / 2 * perLeaf)} mm: si la extensión cambia, la cubierta se rehace.` });
  }
  return out;
}

export const costLines = (cs: Cost[]) => cs.map(c => `${c.title}. ${c.text}`);
