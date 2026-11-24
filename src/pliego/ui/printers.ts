// Imprentas guardadas por el editor: cómo imprime cada una y sus valores técnicos.
// Se guardan en este navegador; el perfil de color va aparte, en IndexedDB, porque pesa.
import type { Press, Inks, Binding, PrinterSpec, Profile } from "../engine/profiles";
import { cleanMeasures, type RefMeasures } from "./references";

export interface Printer {
  id: string; name: string; press: Press; paperId: string; inks?: Inks; binding?: Binding;
  spec: PrinterSpec; finishes?: string[]; iccName?: string | null; notes?: string;
  /** referencia tomada de un PDF que ya salió bien en esta imprenta */
  measures?: RefMeasures; refDate?: string;
  /** espesor real del papel por hoja, sacado del lomo de la cubierta de referencia */
  mmPerLeaf?: number;
}
const KEY = "pliego-imprentas";

export function loadPrinters(): Printer[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
export function savePrinters(list: Printer[]) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ } }

export function printerFromProfile(p: Profile, name: string, iccName: string | null, id?: string): Printer {
  return { id: id ?? Math.random().toString(36).slice(2, 10), name, press: p.press ?? "offset", paperId: p.paperId ?? "ahuesado80", inks: p.inks, binding: p.binding, spec: { ...(p.spec ?? {}) }, finishes: p.finishes, iccName };
}

// ---------- perfil ICC en IndexedDB ----------
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open("pliego", 1); r.onupgradeneeded = () => r.result.createObjectStore("icc"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function putIcc(id: string, data: ArrayBuffer | null) {
  try { const d = await db(); await new Promise<void>((res, rej) => { const t = d.transaction("icc", "readwrite"); if (data) t.objectStore("icc").put(data, id); else t.objectStore("icc").delete(id); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); } catch { /* */ }
}
export async function getIcc(id: string): Promise<ArrayBuffer | null> {
  try { const d = await db(); return await new Promise((res) => { const r = d.transaction("icc").objectStore("icc").get(id); r.onsuccess = () => res(r.result ?? null); r.onerror = () => res(null); }); } catch { return null; }
}

// ---------- compartir: un archivo .json que otro editor puede importar ----------
export function exportPrinter(p: Printer): string {
  const { id, ...rest } = p;
  return JSON.stringify({ pliego: "imprenta", version: 1, ...rest }, null, 2);
}
export function importPrinter(text: string): Printer | null {
  try {
    const v = JSON.parse(text);
    if (v?.pliego !== "imprenta" || !v.name || !v.press) return null;
    return { id: Math.random().toString(36).slice(2, 10), name: String(v.name).slice(0, 60), press: v.press, paperId: v.paperId ?? "ahuesado80", inks: v.inks, binding: v.binding, spec: v.spec ?? {}, finishes: v.finishes, iccName: null, notes: v.notes,
      measures: cleanMeasures(v.measures), refDate: typeof v.refDate === "string" ? v.refDate : undefined, mmPerLeaf: typeof v.mmPerLeaf === "number" && v.mmPerLeaf > 0.02 && v.mmPerLeaf < 0.5 ? v.mmPerLeaf : undefined };
  } catch { return null; }
}
