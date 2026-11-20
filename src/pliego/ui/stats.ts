// Estadísticas de uso anónimas.
//
// Sirven para saber si Pliego se usa y qué problemas aparecen más, nada más. Reglas:
// - Se envía una lista cerrada de campos (ver `ReviewStat` y `ActionStat`). Nada de nombres de archivo,
//   huellas, textos, ISBN, títulos, nombres de imprentas ni identificadores de la persona o del equipo.
// - Los números van en franjas (páginas, peso, duración) para que un envío no permita reconocer un libro.
// - Sin cookies, sin credenciales, sin identificador de sesión: cada envío es independiente.
// - Se puede ver exactamente qué se envió y apagarlo. Si no hay servidor configurado, no se envía nada.
import type { Report } from "../engine/analyze";
import { detectApp } from "../engine/fixes";

export const STATS_URL: string = (import.meta as any).env?.VITE_PLIEGO_STATS_URL ?? "";
const KEY = "pliego-estadisticas";
const VERSION = "0.9";

export interface ReviewStat {
  kind: "review"; v: string;
  piece: "interior" | "cubierta";
  press: string; inks: string; paper: "estucado" | "sin estucar" | "otro"; binding: string; country: string;
  pages: string; size: string; secs: string;
  verdict: string; errors: number; warns: number; infos: number;
  /** controles que fallaron, solo el nombre interno y la gravedad (p. ej. "tac:warn") */
  checks: string[];
  app: string; langs: string[]; light: boolean; batch: boolean; printerSaved: boolean;
}
export interface ActionStat { kind: "action"; v: string; action: "compare" | "original" | "report_pdf" | "batch" | "cover_added" }
export type Stat = ReviewStat | ActionStat;

const band = (n: number, cuts: number[], unit = "") => {
  for (let i = 0; i < cuts.length; i++) if (n <= cuts[i]) return `${i ? cuts[i - 1] + 1 : 0}-${cuts[i]}${unit}`;
  return `>${cuts[cuts.length - 1]}${unit}`;
};

export function statsEnabled(): boolean { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } }
export function setStatsEnabled(on: boolean) { try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* */ } notify(); }
export const statsConfigured = () => !!STATS_URL;

// lo último que se envió (o que se habría enviado), para mostrarlo tal cual
const sent: { at: string; stat: Stat; delivered: boolean }[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(f => f());
export function onStats(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export const sentStats = () => sent.slice();

export function reviewStat(r: Report, opts: { batch: boolean }): ReviewStat {
  const p = r.profile;
  const paper = /estucado/.test(p.paperId ?? "") ? "estucado" : p.paperId ? "sin estucar" : "otro";
  return {
    kind: "review", v: VERSION,
    piece: p.piece === "cubierta" ? "cubierta" : "interior",
    press: p.press ?? "offset", inks: p.inks ?? "", paper, binding: p.binding ?? "", country: p.country ?? "",
    pages: band(r.file.pages, [4, 48, 96, 160, 240, 320, 480, 640]),
    size: band(Math.round(r.file.size / 1e6), [5, 20, 50, 100, 200, 500], " MB"),
    secs: band(Math.round(r.ms / 1000), [5, 15, 30, 60, 120, 300], " s"),
    verdict: r.verdict, errors: r.counts.error, warns: r.counts.warn, infos: r.counts.info,
    checks: [...new Set(r.findings.filter(f => f.sev !== "ok").map(f => `${f.check}:${f.sev}`))].sort(),
    app: detectApp(r.file.creator, r.file.producer) ?? "otro",
    langs: r.book?.spelling?.langs ?? [],
    light: r.findings.some(f => f.check === "lightMode"), batch: opts.batch, printerSaved: !!p.printerId,
  };
}

export function sendStat(stat: Stat) {
  const enabled = statsEnabled();
  if (!enabled) return;
  const entry = { at: new Date().toLocaleTimeString("es"), stat, delivered: false };
  sent.unshift(entry); if (sent.length > 20) sent.pop();
  notify();
  if (!STATS_URL) return;
  // text/plain evita la consulta previa del navegador; sin credenciales ni cookies
  fetch(STATS_URL, { method: "POST", body: JSON.stringify(stat), headers: { "Content-Type": "text/plain" }, credentials: "omit", keepalive: true, mode: "cors", referrerPolicy: "no-referrer" })
    .then(r => { entry.delivered = r.ok; notify(); }).catch(() => { /* sin conexión: no se reintenta */ });
}

export const action = (a: ActionStat["action"]) => sendStat({ kind: "action", v: VERSION, action: a });

/** Lo que nunca se envía, para mostrarlo junto a lo que sí. */
export const NEVER_SENT = [
  "El PDF, el Word ni ninguna parte de su contenido",
  "Nombres de archivo, títulos, ISBN ni la huella del archivo",
  "Tu nombre, tu correo ni identificadores del equipo (Pliego no guarda la dirección IP)",
  "Los valores ni el nombre de tu imprenta",
  "Cookies o datos que permitan unir dos revisiones entre sí",
];
