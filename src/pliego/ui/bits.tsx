import { useEffect, useState } from "react";
import type { Sev } from "../engine/profiles";
import { STATS_URL, statsEnabled, setStatsEnabled, statsConfigured, onStats, sentStats, NEVER_SENT } from "./stats";
import p451 from "../assets/proyecto451.png";

// Hash SHA-256 del código de acceso de los miembros (cambialo cada trimestre).
const ACCESS_HASH = "9b62552619d41f3122e245e796580918725ef87acaa7a81f6a3dd9aac0a5caf2";
const KEY = "pliego-acceso";
// Repositorio público del código (AGPL): completarlo antes de publicar la herramienta.
export const SOURCE_URL = "https://github.com/danibenchi/pliego";

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function useAccess() {
  const [ok, setOk] = useState<boolean>(() => { try { return localStorage.getItem(KEY) === ACCESS_HASH; } catch { return false; } });
  const tryCode = async (code: string) => {
    const h = await sha(code.trim().toUpperCase().replace(/[\s-]/g, ""));
    if (h !== ACCESS_HASH) return false;
    try { localStorage.setItem(KEY, h); } catch { /* sin almacenamiento */ }
    setOk(true); return true;
  };
  return { ok, tryCode };
}

export function Gate({ onCode }: { onCode: (c: string) => Promise<boolean> }) {
  const [code, setCode] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <main className="gate">
      <form className="gate-card" onSubmit={async e => { e.preventDefault(); setBad(!(await onCode(code))); }}>
        <Logo size={44} />
        <h1>Pliego</h1>
        <p>Preflight de PDF para imprenta. Herramienta exclusiva para miembros de la Academia Proyecto451.</p>
        <label htmlFor="code">Código de acceso</label>
        <input id="code" autoFocus autoComplete="off" spellCheck={false} value={code} onChange={e => { setCode(e.target.value); setBad(false); }} placeholder="Lo encontrás en la comunidad" aria-invalid={bad} />
        {bad && <p className="err" role="alert">Ese código no es válido. Revisá el último publicado en la comunidad.</p>}
        <button className="btn primary wide" type="submit" disabled={!code.trim()}>Entrar</button>
        <p className="gatefrom">Una herramienta de la Academia <Brand451 height={20} /></p>
      </form>
    </main>
  );
}

/** Logo de Proyecto451, con enlace a la Academia. */
export function Brand451({ height = 16, className = "" }: { height?: number; className?: string }) {
  return (
    <a className={"brand451 " + className} href="https://academia.proyecto451.com" target="_blank" rel="noopener" title="Academia Proyecto451">
      <img src={p451} alt="Proyecto451" height={height} style={{ height, width: "auto" }} />
    </a>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 1.5V30.5M1.5 16H30.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 11.4a4.6 4.6 0 0 1 4.6 4.6H16z" fill="#00a3e0" />
      <path d="M20.6 16a4.6 4.6 0 0 1-4.6 4.6V16z" fill="#e5007d" />
      <path d="M16 20.6a4.6 4.6 0 0 1-4.6-4.6H16z" fill="#ffd400" />
    </svg>
  );
}

export const SEV_LABEL: Record<Sev, string> = { error: "Bloqueante", warn: "Revisar", info: "Para saber", ok: "Correcto" };

export function SevDot({ sev }: { sev: Sev }) { return <span className={"dot " + sev} aria-label={SEV_LABEL[sev]} />; }

export function SevIcon({ sev, size = 18 }: { sev: Sev; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 20 20", "aria-hidden": true, className: "sevicon " + sev } as any;
  if (sev === "error") return <svg {...p}><circle cx="10" cy="10" r="9" /><path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>;
  if (sev === "warn") return <svg {...p}><path d="M10 1.8 19 17.6H1z" /><path d="M10 7.5v4.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><circle cx="10" cy="14.8" r="1.2" fill="#fff" /></svg>;
  if (sev === "info") return <svg {...p}><circle cx="10" cy="10" r="9" /><path d="M10 9v5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /><circle cx="10" cy="6" r="1.2" fill="#fff" /></svg>;
  return <svg {...p}><circle cx="10" cy="10" r="9" /><path d="M6 10.4l2.7 2.7L14.2 7.4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// Contador de red verificable: cuenta solicitudes que hace la página desde que se cargó el archivo.
export function useNetworkSince(since: number | null) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (since === null) return;
    // las estadísticas anónimas se cuentan aparte (ver StatsLine): acá solo lo demás
    // tampoco cuenta la descarga de partes del propio Pliego (código y tipografías del mismo sitio):
    // no llevan datos, solo traen el programa
    const own = (u: string) => { try { const x = new URL(u); return x.origin === location.origin && /\.(m?js|css|wasm|woff2?|png|svg)$/.test(x.pathname); } catch { return false; } };
    const count = () => setN(performance.getEntriesByType("resource").filter(e => e.startTime > since && !e.name.startsWith("blob:") && !e.name.startsWith("data:") && !(STATS_URL && e.name.startsWith(STATS_URL)) && !own(e.name)).length);
    count();
    let po: PerformanceObserver | null = null;
    try { po = new PerformanceObserver(count); po.observe({ type: "resource", buffered: true }); } catch { /* navegador viejo */ }
    const t = setInterval(count, 1500);
    return () => { po?.disconnect(); clearInterval(t); };
  }, [since]);
  return n;
}

export function Privacy({ since = null }: { since?: number | null }) {
  const n = useNetworkSince(since);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return (
    <div className="privacy">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.5 3 4.5v5c0 4.2 3 7.6 7 9 4-1.4 7-4.8 7-9v-5z" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M6.8 10.2l2.2 2.2 4.2-4.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      <div>
        <b>Tu PDF no sale de esta computadora.</b>
        <span>
          {since === null
            ? "El análisis corre entero en tu navegador. Podés cortar internet y sigue funcionando."
            : `Solicitudes de red desde que abriste el archivo: ${n}.${online ? "" : " Estás sin conexión."}`}
        </span>
        <StatsLine />
      </div>
    </div>
  );
}

function useStats() {
  const [, set] = useState(0);
  useEffect(() => onStats(() => set(x => x + 1)), []);
  return { on: statsEnabled(), list: sentStats() };
}

function StatsLine() {
  const { on, list } = useStats();
  const [open, setOpen] = useState(false);
  const n = list.length;
  return (
    <>
      <span className="statsline">
        {!statsConfigured() ? "Estadísticas anónimas de uso: no se envían en esta versión de prueba"
          : on ? `Estadísticas anónimas de uso: ${n ? `${n} envío${n > 1 ? "s" : ""} sin datos del libro` : "activadas"}` : "Estadísticas anónimas de uso: apagadas"}
        {" · "}<button onClick={e => { e.stopPropagation(); setOpen(true); }}>{!statsConfigured() ? "Ver qué se enviaría" : on ? "Ver qué se envía" : "Activar"}</button>
      </span>
      <StatsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function StatsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { on, list } = useStats();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open]);
  if (!open) return null;
  return (
    <div className="scopebg" onClick={onClose}>
      <div className="scope stats" role="dialog" aria-modal="true" aria-labelledby="stats-t" onClick={e => e.stopPropagation()}>
        <h2 id="stats-t">Estadísticas anónimas de uso</h2>
        <p>Para saber si Pliego se usa y qué problemas aparecen más, al terminar cada revisión se envía un resumen sin datos del libro: qué controles fallaron, la franja de páginas y de peso, el tipo de impresión y el programa con que se exportó. Nunca se envía el archivo.</p>
        <label className="switch"><input type="checkbox" checked={on} onChange={e => setStatsEnabled(e.target.checked)} /> Enviar estadísticas anónimas</label>
        {!statsConfigured() && <p className="note">En esta versión de prueba todavía no hay servidor de estadísticas: no se envía nada. Abajo ves lo que se enviaría.</p>}
        <h3>Lo que nunca se envía</h3>
        <ul className="never">{NEVER_SENT.map(t => <li key={t}>{t}</li>)}</ul>
        <h3>{list.length ? (statsConfigured() ? "Lo que se envió en esta sesión" : "Lo que se habría enviado en esta sesión") : "Todavía no hubo envíos en esta sesión"}</h3>
        {list.map((s, i) => <details key={i} open={i === 0}><summary>{s.at} · {s.stat.kind === "review" ? `revisión de ${s.stat.piece}` : `acción: ${s.stat.action}`}{statsConfigured() ? (s.delivered ? " · recibido" : " · sin confirmar") : ""}</summary><pre>{JSON.stringify(s.stat, null, 2)}</pre></details>)}
        <button className="btn primary" onClick={onClose} autoFocus>Listo</button>
      </div>
    </div>
  );
}

// Qué hace y qué no hace Pliego: el alcance de la revisión, a la vista antes y después de revisar.
export const SCOPE: { t: string; d: string }[] = [
  { t: "Es una revisión automática previa, no una certificación", d: "Pliego ayuda a encontrar a tiempo los problemas más frecuentes de un PDF de imprenta. No certifica que el archivo cumpla PDF/X ni ninguna norma ISO o de la Ghent Workgroup: revisa sus reglas principales. Si la imprenta exige un certificado o un preflight propio, ese es el que vale." },
  { t: "No reemplaza la preimpresión ni las pruebas de la imprenta", d: "La imprenta vuelve a revisar el archivo con su sistema y sus perfiles. La simulación del color, del papel y del lomo en pantalla es aproximada: para el color, la referencia es la prueba de color certificada o una prueba impresa (ferro o plotter)." },
  { t: "Mandan las especificaciones de tu imprenta", d: "Los valores típicos (sangrado, tinta máxima, resolución, pliegos, espesor del papel) son referencias del sector. Cargá los de tu imprenta cuando los tengas, y confirmá siempre con ella el lomo y las medidas de la cubierta." },
  { t: "No reemplaza la corrección profesional", d: "La ortografía, la ortotipografía, la composición y el aparato se revisan con reglas automáticas, que pueden marcar cosas que están bien y dejar pasar errores. Pliego no lee el sentido del texto ni evalúa el estilo, la coherencia o los datos." },
  { t: "Solo ve el texto que el PDF deja leer", d: "El texto convertido en imagen o en contornos no se revisa. La verificación de correcciones y el cotejo con el original dependen de que el PDF y el Word tengan texto real." },
  { t: "Que no aparezcan problemas no es una garantía", d: "Un informe limpio reduce riesgos, pero no asegura que el libro se imprima sin inconvenientes. La responsabilidad del archivo final es del editor y de la imprenta. Pliego es software libre y se ofrece tal cual, sin garantías." },
  { t: "Tus archivos no salen de tu equipo", d: "El análisis se hace en tu navegador. Los PDF y los Word nunca se suben a ningún servidor. Lo único que puede salir son estadísticas anónimas de uso, sin datos del libro, que podés ver y apagar." },
];

export function ScopeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open]);
  if (!open) return null;
  return (
    <div className="scopebg" onClick={onClose}>
      <div className="scope" role="dialog" aria-modal="true" aria-labelledby="scope-t" onClick={e => e.stopPropagation()}>
        <h2 id="scope-t">Qué hace y qué no hace Pliego</h2>
        <ul>{SCOPE.map(s => <li key={s.t}><b>{s.t}</b><p>{s.d}</p></li>)}</ul>
        <button className="btn primary" onClick={onClose} autoFocus>Entendido</button>
      </div>
    </div>
  );
}
