// Medir la tinta total en detalle (150 ppi) a pedido: después de una revisión adaptada a un archivo
// pesado, o para mirar con más cuidado un capítulo. Actualiza el hallazgo «Exceso de tinta».
import { useState } from "react";
import type { Report, Finding, TacPage } from "../engine/analyze";
import { resolve, Sev } from "../engine/profiles";
import { COPY } from "../engine/copy";
import type { Engine } from "./client";
import { action } from "./stats";

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("es", { maximumFractionDigits: 1 });
const pageList = (ps: number[]) => {
  const s = [...new Set(ps)].sort((a, b) => a - b).map(p => p + 1); const out: string[] = []; let a = s[0], b = s[0];
  for (let i = 1; i <= s.length; i++) { if (s[i] === b + 1) { b = s[i]; continue; } out.push(a === b ? `${a}` : `${a}–${b}`); a = b = s[i]; }
  return (s.length > 1 ? "págs. " : "pág. ") + out.join(", ");
};

/** Reemplaza el hallazgo de tinta con las páginas medidas en detalle y recalcula el veredicto. */
export function applyTac(r: Report, res: TacPage[]): Report {
  const { system } = resolve(r.profile);
  const measured = new Set(res.map(x => x.index));
  const pages = r.pages.map(p => { const m = res.find(x => x.index === p.index); return m ? { ...p, tacMax: m.max, tacOverMm2: m.overMm2, tacPpi: m.ppi } : p; });
  const old = r.findings.find(f => f.check === "tac");
  const keep = old ? { pages: old.pages.filter(p => !measured.has(p)), marks: old.marks.filter(m => !measured.has(m.page)) } : { pages: [], marks: [] };
  const hits = res.filter(x => x.overMm2 >= 4 && x.rect);
  const allPages = [...keep.pages, ...hits.map(h => h.index)].sort((a, b) => a - b);
  const marks = [...keep.marks, ...hits.map(h => ({ page: h.index, rect: h.rect!, label: `Hasta ${h.max} % de tinta en ${fmt(h.overMm2)} mm² (límite ${system.tac} %)` }))];
  const coarse = pages.filter(p => (p.tacPpi ?? 150) < 150).length;
  let findings = r.findings.filter(f => f.check !== "tac");
  if (allPages.length) {
    const sev: Sev = pages.some(p => allPages.includes(p.index) && p.tacOverMm2 > 100) ? "error" : "warn";
    const max = Math.max(...allPages.map(p => pages[p].tacMax));
    const c = COPY.tac;
    const f: Finding = { id: "tac", check: "tac", sev, group: c.group, title: c.title, impact: c.impact, fix: c.fix, items: [], pages: allPages, marks,
      detail: `Zonas de más de 4 mm² por encima del ${system.tac} % de tinta total en ${pageList(allPages)}. Máximo medido: ${max} %.` +
        (coarse ? ` ${coarse} página${coarse > 1 ? "s" : ""} todavía medida${coarse > 1 ? "s" : ""} con poco detalle.` : " Medido a 150 ppi.") };
    findings = [...findings, f];
  }
  const rank: Record<Sev, number> = { error: 0, warn: 1, info: 2, ok: 3 };
  findings.sort((a, b) => rank[a.sev] - rank[b.sev]);
  // si ya no queda nada medido con poco detalle, la nota del modo liviano se actualiza
  findings = findings.map(f => f.check === "lightMode" && !coarse ? { ...f, detail: "El archivo es pesado para este equipo: se revisó en modo liviano, pero la tinta total ya se midió en detalle (150 ppi) en todas las páginas." } : f);
  const counts = { error: 0, warn: 0, info: 0 };
  findings.forEach(f => { if (f.sev !== "ok") counts[f.sev]++; });
  const passed = !allPages.length && !coarse && !r.passed.some(p => p.check === "tac") ? [...r.passed, { check: "tac", title: COPY.tac.title, group: COPY.tac.group }] : r.passed;
  return { ...r, pages, findings, counts, passed, verdict: counts.error ? "error" : counts.warn ? "warn" : "ok" };
}

export function TacDetail({ engine, report, onPatch }: { engine: Engine; report: Report; onPatch: (r: Report) => void }) {
  const { system } = resolve(report.profile);
  const n = report.pages.length;
  const coarse = report.pages.filter(p => (p.tacPpi ?? 150) < 150);
  const near = coarse.filter(p => p.tacMax >= system.tac * 0.8).map(p => p.index);
  const [mode, setMode] = useState<"near" | "all" | "range">(near.length ? "near" : "all");
  const [from, setFrom] = useState(1), [to, setTo] = useState(n);
  const [state, setState] = useState<{ busy?: boolean; done?: number; total?: number; msg?: string }>({});
  const pagesFor = () => mode === "near" ? near : mode === "all" ? [...Array(n).keys()] : [...Array(Math.max(0, Math.min(n, to) - Math.max(1, from) + 1)).keys()].map(k => Math.max(1, from) - 1 + k);
  const sel = pagesFor();
  const secs = Math.max(2, Math.round(sel.length * 0.3));
  const go = async () => {
    if (!sel.length) return;
    setState({ busy: true, done: 0, total: sel.length }); action("tac_detail");
    try {
      if (!(await engine.has(report.key))) { setState({ msg: "El PDF ya no está abierto en memoria (se revisaron otros archivos después). Volvé a revisarlo y medí la tinta enseguida." }); return; }
      const res = await engine.tac(report.key, sel, system.tac, report.pages.filter(p => p.rgb).map(p => p.index), p => setState({ busy: true, done: p.page ?? 0, total: p.pages ?? sel.length }));
      const hits = res.filter(x => x.overMm2 >= 4).length;
      onPatch(applyTac(report, res));
      setState({ msg: `Listo: medí ${sel.length} página${sel.length > 1 ? "s" : ""} a 150 ppi. ${hits ? `${hits} pasa${hits > 1 ? "n" : ""} el límite de ${system.tac} %.` : `Ninguna pasa el límite de ${system.tac} %.`}` });
    } catch (e) { console.error(e); setState({ msg: "No pude medir la tinta en detalle en este equipo. Probá con menos páginas por vez." }); }
  };
  if (!coarse.length && !state.msg) return null;
  return (
    <div className="tacdetail">
      <h4>Medir la tinta en detalle</h4>
      {coarse.length > 0 && <p>{coarse.length === n ? "Todo el libro" : `${coarse.length} páginas`} se midieron a 54 ppi para no agotar la memoria. A 150 ppi la medición es la misma que en una revisión normal; se hace por partes, así que sirve aun en libros pesados.</p>}
      {coarse.length > 0 && !state.busy && (
        <div className="tacopts">
          {near.length > 0 && <label><input type="radio" checked={mode === "near"} onChange={() => setMode("near")} /> Las {near.length} páginas que se acercan al límite (recomendado)</label>}
          <label><input type="radio" checked={mode === "all"} onChange={() => setMode("all")} /> Todas las páginas ({n})</label>
          <label><input type="radio" checked={mode === "range"} onChange={() => setMode("range")} /> Un rango, por ejemplo un capítulo: de
            <input type="number" min={1} max={n} value={from} onChange={e => { setMode("range"); setFrom(+e.target.value || 1); }} /> a
            <input type="number" min={1} max={n} value={to} onChange={e => { setMode("range"); setTo(+e.target.value || n); }} /></label>
          <button className="btn primary" disabled={!sel.length} onClick={go}>Medir {sel.length} página{sel.length !== 1 ? "s" : ""} (unos {secs < 60 ? `${secs} s` : `${Math.round(secs / 60)} min`})</button>
        </div>
      )}
      {state.busy && <div className="tacbar"><i style={{ width: `${((state.done ?? 0) / (state.total || 1)) * 100}%` }} /><span>Página {state.done} de {state.total}</span></div>}
      {state.msg && <p className="tacmsg">{state.msg}</p>}
    </div>
  );
}
