// Web Worker: todo el procesamiento del PDF ocurre acá, en el navegador del usuario.
import { analyze, render, compareWith, hasDoc, compareOriginalWith, sampleLangs, peek, inspect, tacDetail } from "./engine/analyze";
import { DICTS, dictFor, Family } from "./engine/lang";
import { FOGRA39_B64 } from "./assets/fogra39";
import type { Speller } from "./engine/book";

let fallback: Uint8Array | null = null;
const iccReady = Promise.resolve().then(() => { const s = atob(FOGRA39_B64); fallback = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) fallback[i] = s.charCodeAt(i); });

// Diccionarios libres (LibreOffice / Hunspell), comprimidos; se cargan solo los del idioma del libro.
const DICT: Record<string, () => Promise<{ AFF: string; DIC: string }>> = {
  "es": () => import("./assets/dict/es"),
  "es-ar": () => import("./assets/dict/es-ar"),
  "es-mx": () => import("./assets/dict/es-mx"),
  "es-co": () => import("./assets/dict/es-co"),
  "es-cl": () => import("./assets/dict/es-cl"),
  "es-uy": () => import("./assets/dict/es-uy"),
  "es-pe": () => import("./assets/dict/es-pe"),
  "es-ve": () => import("./assets/dict/es-ve"),
  "ca": () => import("./assets/dict/ca"),
  "ca-valencia": () => import("./assets/dict/ca-valencia"),
  "gl": () => import("./assets/dict/gl"),
  "eu": () => import("./assets/dict/eu"),
  "pt": () => import("./assets/dict/pt"),
  "pt-pt": () => import("./assets/dict/pt-pt"),
  "en": () => import("./assets/dict/en"),
  "en-gb": () => import("./assets/dict/en-gb"),
  "fr": () => import("./assets/dict/fr"),
  "it": () => import("./assets/dict/it"),
  "de": () => import("./assets/dict/de"),
};
let factory: Promise<any> | null = null;
const spellers = new Map<string, Speller>();
const unb64 = (s: string) => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
async function speller(id: string): Promise<Speller | null> {
  if (spellers.has(id)) return spellers.get(id)!;
  try {
    factory ??= import("hunspell-asm").then(m => m.loadModule());
    const [f, d, { gunzipSync }] = await Promise.all([factory, DICT[id](), import("fflate")]);
    const aff = f.mountBuffer(gunzipSync(unb64(d.AFF)), id + ".aff"), dic = f.mountBuffer(gunzipSync(unb64(d.DIC)), id + ".dic");
    const h = f.create(aff, dic);
    const sp: Speller = { correct: (w: string) => { try { return h.spell(w); } catch { return true; } } };
    spellers.set(id, sp);
    return sp;
  } catch (e) { console.error("diccionario", id, e); return null; }
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;
  const post = (m: any, t?: Transferable[]) => (self as any).postMessage({ id: msg.id, ...m }, t ?? []);
  try {
    if (msg.type === "analyze") {
      await iccReady;
      const data = new Uint8Array(msg.data);
      const sp: Partial<Record<Family, Speller>> = {};
      if (msg.profile.piece === "interior" && msg.profile.spell !== false) {
        post({ type: "progress", progress: { stage: "Reconociendo el idioma", pct: 1 } });
        const fams = msg.profile.language && msg.profile.language !== "auto"
          ? [{ family: DICTS.find(d => d.id === msg.profile.language)?.family ?? "es", share: 1 }]
          : sampleLangs(data).slice(0, 3);
        for (const { family } of fams) {
          const id = dictFor(family as Family, msg.profile.country, msg.profile.language);
          post({ type: "progress", progress: { stage: `Cargando el diccionario (${DICTS.find(d => d.id === id)?.name ?? id})`, pct: 2 } });
          const s = await speller(id); if (s) sp[family as Family] = s;
        }
      }
      const report = analyze(data, msg.name, msg.profile, p => post({ type: "progress", progress: p }),
        { icc: msg.icc ? new Uint8Array(msg.icc) : null, iccName: msg.iccName ?? null, fallback, spellers: sp, key: msg.key ?? "main", light: !!msg.light });
      post({ type: "done", report });
    } else if (msg.type === "render") {
      const out = render(msg.page, msg.scale, msg.cmyk, msg.proof, msg.key ?? "main");
      post({ type: "done", out }, [out.rgba.buffer, ...(out.cmyk ? [out.cmyk.buffer] : []), ...(out.proof ? [out.proof.buffer] : [])]);
    } else if (msg.type === "original") {
      post({ type: "done", report: compareOriginalWith(new Uint8Array(msg.data), msg.name, msg.key ?? "main") });
    } else if (msg.type === "tac") {
      const res = tacDetail(msg.key ?? "main", msg.pages, msg.limit, msg.rgb ?? [], (d, t) => post({ type: "progress", progress: { stage: "Midiendo la tinta en detalle", page: d, pages: t, pct: t ? (d / t) * 100 : 100 } }));
      post({ type: "done", report: res });
    } else if (msg.type === "inspect") {
      post({ type: "done", report: inspect(new Uint8Array(msg.data)) });
    } else if (msg.type === "peek") {
      post({ type: "done", report: peek(new Uint8Array(msg.data)) });
    } else if (msg.type === "has") {
      post({ type: "done", report: hasDoc(msg.key) });
    } else if (msg.type === "compare") {
      const res = compareWith(new Uint8Array(msg.data), msg.key ?? "main", pct => post({ type: "progress", progress: { stage: "Comparando versiones", pct } }));
      post({ type: "done", report: res });
    }
  } catch (err: any) {
    post({ type: "error", error: String(err?.message ?? err) });
  }
};
(self as any).postMessage({ type: "ready" });
