import { useMemo, useRef, useState } from "react";
import type { Report, Finding } from "../engine/analyze";
import { diffFindings, corrFindings, corrSummary, CorrSummary, origFindings } from "../engine/cross";
import type { OrigResult } from "../engine/original";
import { APPS, AppId, appFix, detectApp } from "../engine/fixes";
import { costs as computeCosts } from "../engine/costs";
import { COUNTRY_NAME } from "../engine/book";
import { GROUPS } from "../engine/copy";
import { resolve, Sev } from "../engine/profiles";
import type { Engine } from "./client";
import { Viewer, Layers } from "./Viewer";
import { SevIcon, SevDot, SEV_LABEL, Privacy, ScopeDialog } from "./bits";
import { action } from "./stats";
import { applyReview, docKey, loadReview, saveReview, setMark, RevMark, REV_LABEL, Review } from "./review";
import { makeThumbs, exportPdf, reportName } from "./exportPdf";
import { actionFor } from "./actions";

const VERDICT: Record<Sev, { t: string; s: string }> = {
  error: { t: "No está listo para imprenta", s: "Hay problemas que la imprenta va a rechazar o que se van a ver en el papel." },
  warn: { t: "Listo, con observaciones", s: "Nada impide imprimir, pero conviene revisar estos puntos antes de mandar el archivo." },
  info: { t: "Listo para imprenta", s: "No encontré problemas. Te dejo algunas notas." },
  ok: { t: "Listo para imprenta", s: "Pasó todos los controles del perfil elegido." },
};

export interface OrigState { status: "running" | "done" | "error"; name: string; findings: Finding[]; sum?: Omit<OrigResult, "findings">; message?: string }
export interface DiffState { status: "running" | "done" | "error"; pct: number; name: string; findings: Finding[]; prevPages: number; message?: string; corr?: CorrSummary; corrFindings?: Finding[] }

export function Results({ engine, report: base, since, diff, setDiff, orig, setOrig, onReset, onProfile, onBack, onAddCover, onRerun }: { onRerun?: (patch: any) => void; engine: Engine; report: Report; since: number | null; diff?: DiffState; setDiff: (d: DiffState) => void; orig?: OrigState; setOrig: (o: OrigState) => void; onAddCover?: (f: File) => void; onReset: () => void; onProfile: () => void; onBack?: () => void }) {
  const report = base;
  const rkey = docKey(base.file.name, base.profile.piece);
  const detected = detectApp(base.file.creator ?? "", base.file.producer ?? "");
  const [appSel, setAppSel] = useState<AppId | "">(() => { try { return (localStorage.getItem("pliego-app") as AppId) || ""; } catch { return ""; } });
  const app: AppId | null = detected ?? (appSel || null);
  const appName = app ? APPS.find(a => a.id === app)!.name : null;
  const costList = useMemo(() => computeCosts(base), [base]);
  const [rev, setRev] = useState<Review>(() => loadReview(rkey));
  const mark = (f: Finding, m: RevMark | null, item?: string) => { const n = setMark(rev, f, m, item); setRev(n); saveReview(rkey, n); };
  const corrList = [...(diff?.status === "done" ? diff.corrFindings ?? [] : []), ...(orig?.status === "done" ? orig.findings : [])];
  const applied = useMemo(() => {
    const rank: Record<string, number> = { error: 0, warn: 1, info: 2, ok: 3 };
    const all = corrList.length ? [...base.findings, ...corrList].sort((a, b) => rank[a.sev] - rank[b.sev]) : base.findings;
    return applyReview(all, rev);
  }, [base, rev, corrList]);
  const [pdfState, setPdfState] = useState<"" | "busy" | "done" | "error">("");
  const downloadPdf = async () => {
    setPdfState("busy");
    try {
      const thumbs = await makeThumbs(engine, base, applied.findings);
      action("report_pdf");
      await exportPdf([{ report: base, applied, thumbs, app: app ? { id: app, name: appName! } : null, costs: costList.map(c => `${c.title}. ${c.text}`), diff: diff?.status === "done" ? { name: diff.name, findings: diff.findings, corr: diff.corr } : null, orig: orig?.status === "done" && orig.sum ? { name: orig.name, ...orig.sum } : null}], reportName(base.file.name));
      setPdfState("done"); setTimeout(() => setPdfState(""), 2500);
    } catch (e) { console.error(e); setPdfState("error"); }
  };
  const diffList = diff?.status === "done" ? diff.findings : [];
  const viewReport = useMemo(() => {
    const extra = [...(diff?.status === "done" ? diff.corrFindings ?? [] : []), ...(orig?.status === "done" ? orig.findings : []), ...diffList];
    return extra.length ? { ...base, findings: [...base.findings, ...extra] } : base;
  }, [base, diff, orig]);
  const origInput = useRef<HTMLInputElement>(null);
  const cotejar = async (f?: File | null) => {
    if (!f) return;
    if (/\.doc$/i.test(f.name)) { setOrig({ status: "error", name: f.name, findings: [], message: "Ese es el formato viejo de Word (.doc). Guardalo como .docx y volvé a elegirlo." }); return; }
    if (!/\.(docx|txt|md)$/i.test(f.name)) { setOrig({ status: "error", name: f.name, findings: [], message: "Elegí el original en Word (.docx) o en texto (.txt)." }); return; }
    setOrig({ status: "running", name: f.name, findings: [] });
    try {
      action("original");
      const r = await engine.original(await f.arrayBuffer(), f.name, base.key);
      const { findings, ...sum } = r;
      setOrig({ status: "done", name: f.name, findings: origFindings(r), sum, message: findings.length ? undefined : "El texto del PDF coincide con el original, palabra por palabra." });
    } catch { setOrig({ status: "error", name: f.name, findings: [], message: "No pude leer ese archivo. ¿Es un Word (.docx) válido?" }); }
  };
  const prevInput = useRef<HTMLInputElement>(null);
  const compare = async (f?: File | null) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") { setDiff({ status: "error", pct: 0, name: f.name, findings: [], prevPages: 0, message: "Ese archivo no es un PDF." }); return; }
    setDiff({ status: "running", pct: 0, name: f.name, findings: [], prevPages: 0 });
    try {
      action("compare");
      const res = await engine.compare(await f.arrayBuffer(), base.key, pr => setDiff({ status: "running", pct: pr.pct, name: f.name, findings: [], prevPages: 0 }));
      setDiff({ status: "done", pct: 100, name: f.name, findings: diffFindings(res), prevPages: res.prevPages, corr: res.annots ? corrSummary(res.corrections) : undefined, corrFindings: corrFindings(res.corrections),
        message: res.findings.length || res.corrections.length ? undefined : "Las dos versiones tienen el mismo texto y se ven iguales." });
    } catch { setDiff({ status: "error", pct: 0, name: f.name, findings: [], prevPages: 0, message: "No pude leer esa versión del PDF." }); }
  };
  const [page, setPage] = useState(() => report.findings.find(f => f.sev === "error" && f.pages.length)?.pages[0] ?? 0);
  const [selected, setSelected] = useState<Finding | null>(null);
  const [filter, setFilter] = useState<"all" | Sev>("all");
  const [tab, setTab] = useState<"hallazgos" | "archivo">("hallazgos");
  const [layers, setLayers] = useState<Layers>({ marks: true, boxes: true, tac: false, mode: "color", plates: [true, true, true, true], spread: false });
  const [copied, setCopied] = useState(false);
  const { system, content } = resolve(report.profile);

  const select = (f: Finding | null) => {
    setSelected(f && selected?.id === f.id ? null : f);
    if (f && f.pages.length && !f.pages.includes(page)) setPage(f.pages[0]);
    if (f?.check === "tac") setLayers(l => ({ ...l, tac: true }));
    if (f?.check === "monoColor" || f?.check === "spot") setLayers(l => ({ ...l, mode: "plates", plates: [true, true, true, false] }));
    if (f && ["edge", "bleed", "safety", "gutter", "spineText"].includes(f.check)) setLayers(l => ({ ...l, boxes: true }));
  };

  const shown = applied.findings.filter(f => filter === "all" ? f.sev !== "info" : f.sev === filter);
  const notes = filter === "all" ? applied.findings.filter(f => f.sev === "info") : [];
  const todo = applied.findings.filter(f => f.sev === "error" || f.sev === "warn");
  const coverInput = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState(false);
  const onPage = viewReport.findings.filter(f => f.pages.includes(page));
  const pi = report.pages[page];

  const copy = async () => {
    const lines = [
      `Preflight de ${report.file.name}`,
      `Perfil: ${system.name} · ${content.name} · ${report.profile.piece}${report.profile.piece === "interior" ? (report.profile.colorMode === "mono" ? " a una tinta" : " a cuatro colores") : ""}`,
      `Resultado: ${VERDICT[applied.verdict].t} (${applied.counts.error} bloqueantes, ${applied.counts.warn} a revisar, ${applied.counts.info} notas${applied.markedCount ? `, ${applied.markedCount} marcados por el editor` : ""})`,
      `Formato ${report.file.formatMm} · ${report.file.pages} páginas`,
      "",
      ...applied.findings.flatMap(f => [`[${SEV_LABEL[f.sev]}] ${f.title}: ${f.detail}`, ...(f.items ?? []).map(i => `   · ${i}`), `   Cómo se arregla: ${f.fix}`]),
      ...(diffList.length ? ["", `Cambios respecto de ${diff!.name}:`, ...diffList.flatMap(f => [`· ${f.title}: ${f.detail}`, ...(f.items ?? []).map(i => `   · ${i}`)])] : []),
    ];
    try { await navigator.clipboard.writeText(lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* sin portapapeles */ }
  };

  return (
    <div className="results">
      <aside className="side">
        {onBack && <button className="backlink" onClick={onBack}>← Volver al lote</button>}
        <div className={"verdict " + applied.verdict}>
          <div className="vhead"><SevIcon sev={applied.verdict} size={26} /><h1>{VERDICT[applied.verdict].t}</h1></div>
          <p>{VERDICT[applied.verdict].s}{report.profile.printerName ? ` Revisado con los valores de ${report.profile.printerName}.` : ""} <button className="scopeinline" onClick={() => setScope(true)}>Revisión automática, no una certificación</button></p>
          <ScopeDialog open={scope} onClose={() => setScope(false)} />
          {report.suggest && onRerun && (
            <div className="suggest" role="status">
              <b>¿Elegiste bien el perfil?</b>
              <p>Lo revisé como {report.profile.inks === "1" ? "interior a una tinta" : report.profile.inks === "2" ? "interior a dos tintas" : "libro a cuatro colores"} y con las normas de {COUNTRY_NAME[report.profile.country] ?? report.profile.country}, pero {report.suggest.reasons.join(" y ")}. Varios hallazgos pueden venir de ahí.</p>
              <button className="btn primary" onClick={() => onRerun({ ...(report.suggest!.inks ? { inks: report.suggest!.inks } : {}), ...(report.suggest!.country ? { country: report.suggest!.country } : {}) })}>
                Volver a revisar {[report.suggest.inks ? "a cuatro colores" : "", report.suggest.country ? `con las normas de ${COUNTRY_NAME[report.suggest.country] ?? report.suggest.country}` : ""].filter(Boolean).join(" y ")}
              </button>
              <span>Si además es un libro escolar, ilustrado o de arte, cambiá el tipo de libro y el papel en el perfil.</span>
            </div>
          )}
          {todo.length > 0 && (
            <div className="todo">
              <b>{applied.counts.error ? "Para mandarlo a imprenta" : "Antes de mandarlo, revisá"}</b>
              <ol>{todo.slice(0, 3).map(f => <li key={f.id} className={f.sev}><button onClick={() => { setTab("hallazgos"); setFilter("all"); select(f); }}>{actionFor(f)}</button></li>)}</ol>
              {todo.length > 3 && <span className="more">y {todo.length - 3} punto{todo.length - 3 !== 1 ? "s" : ""} más, abajo</span>}
            </div>
          )}
          {onAddCover && <><button className="addcover" onClick={() => coverInput.current?.click()}>+ Sumar la cubierta para cruzar ISBN, título y lomo</button><input ref={coverInput} type="file" accept="application/pdf,.pdf" hidden onChange={e => { const f = e.target.files?.[0]; if (f) { action("cover_added"); onAddCover(f); } e.target.value = ""; }} /></>}
          <div className="tally">
            <button className={filter === "error" ? "on" : ""} onClick={() => setFilter(filter === "error" ? "all" : "error")}><b>{applied.counts.error}</b>bloqueantes</button>
            <button className={filter === "warn" ? "on" : ""} onClick={() => setFilter(filter === "warn" ? "all" : "warn")}><b>{applied.counts.warn}</b>a revisar</button>
            <button className={filter === "info" ? "on" : ""} onClick={() => setFilter(filter === "info" ? "all" : "info")}><b>{applied.counts.info}</b>notas</button>
            <button className={filter === "ok" ? "on" : ""} onClick={() => setFilter(filter === "ok" ? "all" : "ok")}><b>{report.passed.length}</b>superados</button>
          </div>
        </div>

        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "hallazgos"} className={tab === "hallazgos" ? "on" : ""} onClick={() => setTab("hallazgos")}>Hallazgos</button>
          <button role="tab" aria-selected={tab === "archivo"} className={tab === "archivo" ? "on" : ""} onClick={() => setTab("archivo")}>Archivo y libro</button>
        </div>

        {tab === "hallazgos" ? (
          <div className="list">
            {filter === "all" && (
              <div className="appline">
                <span>Pasos para</span>
                {detected ? <b title={`${base.file.creator} · ${base.file.producer}`}>{appName} <em>detectado</em></b> : (
                  <select value={appSel} onChange={e => { const v = e.target.value as AppId | ""; setAppSel(v); try { v ? localStorage.setItem("pliego-app", v) : localStorage.removeItem("pliego-app"); } catch { /* */ } }}>
                    <option value="">elegí tu programa…</option>
                    {APPS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                )}
              </div>
            )}
            {filter === "all" && costList.length > 0 && (
              <details className="costs" open={costList.some(c => c.tone !== "info")}>
                <summary>Lo que cuesta <em>{costList.filter(c => c.tone !== "info").length || ""}</em></summary>
                <ul>{costList.map(c => <li key={c.title} className={c.tone}><b>{c.title}</b><p>{c.text}</p></li>)}</ul>
              </details>
            )}
            {filter !== "ok" && shown.map(f => <FindingCard key={f.id} f={f} open={selected?.id === f.id} onClick={() => select(f)} goto={p => { setPage(p); setSelected(f); }} onMark={(m, it) => mark(f, m, it)} appFix={appFix(app, f.check)} appName={appName} />)}
            {filter === "all" && applied.marked.length > 0 && (
              <details className="marked">
                <summary>{applied.markedCount} marcado{applied.markedCount !== 1 ? "s" : ""} por vos</summary>
                <ul>
                  {applied.marked.flatMap(m => m.items
                    ? m.items.map(it => <li key={m.f.id + it.text}><span className={"rv " + it.mark}>{REV_LABEL[it.mark]}</span><div><b>{m.f.title}</b><em>{it.text}</em></div><button onClick={() => mark(m.f, null, it.text)}>Deshacer</button></li>)
                    : [<li key={m.f.id}><span className={"rv " + m.mark}>{REV_LABEL[m.mark]}</span><div><b>{m.f.title}</b><em>{m.f.detail}</em></div><button onClick={() => mark(m.f, null)}>Deshacer</button></li>])}
                </ul>
                <p className="mini">Se recuerda en este navegador para las próximas versiones de este archivo.</p>
              </details>
            )}
            {filter !== "ok" && shown.length === 0 && notes.length === 0 && <p className="empty">Nada en esta categoría.</p>}
            {notes.length > 0 && (
              <details className="notes">
                <summary>{notes.length} nota{notes.length !== 1 ? "s" : ""} para saber</summary>
                {notes.map(f => <FindingCard key={f.id} f={f} open={selected?.id === f.id} onClick={() => select(f)} goto={p => { setPage(p); setSelected(f); }} onMark={(m, it) => mark(f, m, it)} appFix={appFix(app, f.check)} appName={appName} />)}
              </details>
            )}
            {filter === "all" && (
              <section className="versions">
                <div className="vrow">
                  <div><h3>Versión anterior y correcciones</h3><p>{diff?.status === "done" ? `Comparado con ${diff.name}${diff.prevPages ? ` (${diff.prevPages} págs.)` : ""}` : "Elegí la prueba anterior. Si tiene las correcciones marcadas como comentarios, verifico una por una si se aplicaron."}</p></div>
                  <button className="btn" disabled={diff?.status === "running"} onClick={() => prevInput.current?.click()}>{diff?.status === "done" ? "Otra versión" : "Elegir versión anterior"}</button>
                </div>
                {diff?.status === "running" && <div className="vprog"><i style={{ width: `${Math.max(4, diff.pct)}%` }} /><span>Comparando con {diff.name}…</span></div>}
                {diff?.message && <p className={diff.status === "error" ? "err" : "mini"}>{diff.message}</p>}
                {diff?.status === "done" && diff.corr && (
                  <div className="corrsum">
                    <b>{diff.corr.total} {diff.corr.total === 1 ? "marca" : "marcas"} en la prueba anterior</b>
                    <div className="cbar">{(["applied", "missing", "different", "lost", "manual"] as const).map(k => diff.corr![k] > 0 && <i key={k} className={k} style={{ flexGrow: diff.corr![k] }} />)}</div>
                    <ul>
                      <li className="applied"><b>{diff.corr.applied}</b> aplicadas</li>
                      <li className="missing"><b>{diff.corr.missing}</b> sin aplicar</li>
                      {diff.corr.different > 0 && <li className="different"><b>{diff.corr.different}</b> de otra forma</li>}
                      {diff.corr.lost > 0 && <li className="lost"><b>{diff.corr.lost}</b> sin ubicar</li>}
                      {diff.corr.manual > 0 && <li className="manual"><b>{diff.corr.manual}</b> para revisar a mano</li>}
                    </ul>
                    {(diff.corr.missing + diff.corr.different + diff.corr.lost + diff.corr.manual) > 0 && <p className="mini">El detalle está arriba, con el resto de los hallazgos.</p>}
                  </div>
                )}
                {diffList.map(f => <FindingCard key={f.id} f={f} open={selected?.id === f.id} onClick={() => select(f)} goto={p => { setPage(p); setSelected(f); }} />)}
                <input ref={prevInput} type="file" accept="application/pdf,.pdf" hidden onChange={e => { compare(e.target.files?.[0]); e.target.value = ""; }} />
              </section>
            )}
            {filter === "all" && report.profile.piece === "interior" && (
              <section className="versions">
                <div className="vrow">
                  <div><h3>Cotejo con el original</h3><p>{orig?.status === "done" ? `Cotejado con ${orig.name}` : "Elegí el Word aprobado: te digo si se perdió, cambió o agregó texto al armar el libro, y si están todas las notas."}</p></div>
                  <button className="btn" disabled={orig?.status === "running"} onClick={() => origInput.current?.click()}>{orig?.status === "done" ? "Otro original" : "Elegir el original"}</button>
                </div>
                {orig?.status === "running" && <div className="vprog"><i style={{ width: "60%" }} /><span>Cotejando con {orig.name}…</span></div>}
                {orig?.message && <p className={orig.status === "error" ? "err" : "mini"}>{orig.message}</p>}
                {orig?.status === "done" && orig.sum && (
                  <div className="corrsum">
                    <b>{orig.sum.words.toLocaleString("es")} palabras del original · {(Math.min(100, orig.sum.matched / Math.max(1, orig.sum.words) * 100)).toLocaleString("es", { maximumFractionDigits: 1 })} % igual en el libro</b>
                    <ul>
                      <li className={orig.sum.missing ? "missing" : "applied"}><b>{orig.sum.missing}</b> faltan</li>
                      <li className={orig.sum.extra ? "different" : "applied"}><b>{orig.sum.extra}</b> sobran</li>
                      <li className={orig.sum.changed ? "different" : "applied"}><b>{orig.sum.changed}</b> cambios</li>
                      {orig.sum.notes > 0 && <li className={orig.sum.notesMissing ? "missing" : "applied"}><b>{orig.sum.notes - orig.sum.notesMissing}</b> de {orig.sum.notes} notas</li>}
                    </ul>
                    {orig.sum.skippedFront > 0 && <p className="mini">No comparé los preliminares del libro (portada, créditos, índice: {orig.sum.skippedFront} palabras que el original no tiene).</p>}
                    {orig.sum.tracked && <p className="mini">El Word tiene cambios propuestos sin resolver: lo comparé con todos los cambios aceptados.</p>}
                  </div>
                )}
                <input ref={origInput} type="file" accept=".docx,.txt,.md,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden onChange={e => { cotejar(e.target.files?.[0]); e.target.value = ""; }} />
              </section>
            )}
            {(filter === "all" || filter === "ok") && report.passed.length > 0 && (
              <details className="passed" open={filter === "ok"}>
                <summary><SevIcon sev="ok" size={16} /> {report.passed.length} controles superados</summary>
                <ul>{report.passed.map(p => <li key={p.check}><span>{GROUPS[p.group]}</span>{p.title}</li>)}</ul>
              </details>
            )}
          </div>
        ) : <FileTab report={report} />}

        <div className="side-foot">
          <button className="btn primary wide" onClick={downloadPdf} disabled={pdfState === "busy"}>{pdfState === "busy" ? "Armando el informe…" : pdfState === "done" ? "Informe descargado ✓" : pdfState === "error" ? "No pude armar el PDF · reintentar" : "Descargar informe en PDF"}</button>
          <div className="row3">
            <button className="btn" onClick={copy}>{copied ? "Copiado ✓" : "Copiar texto"}</button>
            <button className="btn" onClick={onProfile}>Perfil</button>
            <button className="btn" onClick={onReset}>Otro PDF</button>
          </div>
        </div>
      </aside>

      <Viewer engine={engine} report={viewReport} page={page} setPage={p => setPage(p)} layers={layers} setLayers={setLayers} selected={selected} onSelect={select} />

      <aside className="pageinfo" aria-label="Datos de la página">
        <h2>Página {page + 1}{pi.folio && pi.folio !== String(page + 1) ? <em> · folio {pi.folio}</em> : null}</h2>
        <dl className="kv">
          <div><dt>Corte</dt><dd>{fmt(pi.wMm)} × {fmt(pi.hMm)} mm</dd></div>
          <div><dt>Sangrado</dt><dd>{bleedOf(pi)}</dd></div>
          <div><dt>Lado</dt><dd>{report.profile.piece === "cubierta" ? "Cubierta extendida" : page % 2 === 0 ? "Impar · derecha" : "Par · izquierda"}</dd></div>
        </dl>
        <h3>Tinta total</h3>
        <div className="meter">
          <div className="track"><i className={pi.tacMax > system.tac ? "over" : ""} style={{ width: `${Math.min(100, pi.tacMax / 400 * 100)}%` }} /><b style={{ left: `${system.tac / 4}%` }} title={`Límite ${system.tac} %`} /></div>
          <div className="mlab"><span>Máx. {pi.tacMax} %</span><span>Límite {system.tac} %</span></div>
        </div>
        <h3>Planchas que usa</h3>
        <div className="platebars">
          {(["c", "m", "y", "k"] as const).map(k => (
            <div key={k} className={"pb p" + k.toUpperCase()}>
              <span>{k.toUpperCase()}</span><div><i style={{ width: `${Math.min(100, Math.sqrt(pi.plates[k]) * 100)}%` }} /></div><em>{pct(pi.plates[k])}</em>
            </div>
          ))}
        </div>
        {(pi.spots.length > 0 || pi.tech.length > 0) && <>
          <h3>Tintas planas y técnicas</h3>
          <div className="inks">{pi.spots.map(s => <span key={s}><i />{s}</span>)}{pi.tech.map(s => <span key={s} className="tech" title="Tinta técnica"><i />{s}</span>)}</div>
        </>}
        <h3>En esta página</h3>
        {onPage.length ? (
          <ul className="pagefind">
            {onPage.map(f => <li key={f.id}><button onClick={() => select(f)} className={selected?.id === f.id ? "on" : ""}><SevDot sev={f.sev} />{f.title}</button></li>)}
          </ul>
        ) : <p className="empty">Sin problemas en esta página.</p>}
        <div className="legend">
          <span><i className="lg trim" />Corte</span><span><i className="lg bleed" />Sangrado</span><span><i className="lg safe" />Zona segura</span>
          {report.profile.piece === "interior" && <span><i className="lg gutter" />Lomo</span>}
        </div>
        <Privacy since={since} />
      </aside>
    </div>
  );
}

function FindingCard({ f, open, onClick, goto, onMark, appFix, appName }: { f: Finding; open: boolean; onClick: () => void; goto: (p: number) => void; onMark?: (m: RevMark | null, item?: string) => void; appFix?: string | null; appName?: string | null }) {
  return (
    <article className={"fcard " + f.sev + (open ? " open" : "")}>
      <button className="fhead" onClick={onClick} aria-expanded={open}>
        <SevIcon sev={f.sev} size={18} />
        <div><span className="fgroup">{GROUPS[f.group]} · {SEV_LABEL[f.sev]}</span><h3>{f.title}</h3><p>{f.detail}</p></div>
      </button>
      {open && (
        <div className="fbody">
          {f.items && f.items.length > 0 && <ul className="items">{f.items.map(i => <li key={i}><span>{i}</span>{onMark && <span className="imark"><button title="Revisado: está bien así" aria-label="Marcar como revisado" onClick={() => onMark("ok", i)}>✓</button><button title="Falsa alarma" aria-label="Marcar como falsa alarma" onClick={() => onMark("fa", i)}>✕</button></span>}</li>)}</ul>}
          {f.pages.length > 0 && (
            <div className="pchips">{f.pages.slice(0, 40).map(p => <button key={p} onClick={() => goto(p)}>{p + 1}</button>)}{f.pages.length > 40 && <span>+{f.pages.length - 40}</span>}</div>
          )}
          <h4>Qué pasa en imprenta</h4><p>{f.impact}</p>
          {appFix ? <><h4>Cómo se arregla en {appName}</h4><p>{appFix}</p><h4>En general</h4><p className="muted">{f.fix}</p></> : <><h4>Cómo se arregla</h4><p>{f.fix}</p></>}
          {onMark && <div className="markbar"><span>¿Ya lo viste?</span><button onClick={() => onMark("ok")}>Revisado, está bien así</button><button onClick={() => onMark("fa")}>Falsa alarma</button></div>}
        </div>
      )}
    </article>
  );
}

function FileTab({ report }: { report: Report }) {
  const r = report, fi = r.file;
  const { system } = resolve(r.profile);
  const full = Math.floor(fi.pages / system.signature), rest = fi.pages % system.signature;
  const sheets = r.profile.piece !== "interior" || system.signature <= 2 ? null
    : full === 0 ? `menos de un pliego de ${system.signature}`
    : `${full} pliego${full > 1 ? "s" : ""} de ${system.signature}${rest ? ` + ${rest} págs.` : ""}`;
  const totals = useMemo(() => {
    const t = { c: 0, m: 0, y: 0, k: 0 }; r.pages.forEach(p => { (["c", "m", "y", "k"] as const).forEach(k => { if (p.plates[k] > 0.0005) t[k]++; }); }); return t;
  }, [r]);
  return (
    <div className="filetab">
      <dl className="kv">
        <div><dt>Archivo</dt><dd title={fi.name}>{fi.name}</dd></div>
        <div><dt>Peso</dt><dd>{(fi.size / 1048576).toFixed(1).replace(".", ",")} MB</dd></div>
        <div><dt>Versión</dt><dd>{fi.version}</dd></div>
        <div><dt>Estándar</dt><dd>{fi.pdfx ?? "Sin PDF/X"}</dd></div>
        <div><dt>Perfil de salida</dt><dd>{fi.outputIntent ?? "Sin declarar"}</dd></div>
        <div><dt>Color simulado con</dt><dd title={r.color.name}>{r.color.name}</dd></div>
        <div><dt>Formato</dt><dd>{fi.formatMm}{fi.formatName ? ` · ${fi.formatName}` : ""}</dd></div>
        <div><dt>Páginas</dt><dd>{fi.pages}{sheets ? ` · ${sheets}` : ""}</dd></div>
        {fi.producer && <div><dt>Generado con</dt><dd>{[fi.creator, fi.producer].filter(Boolean).join(" · ")}</dd></div>}
        <div><dt>Revisado en</dt><dd>{(r.ms / 1000).toFixed(1).replace(".", ",")} s, en tu equipo</dd></div>
      </dl>
      {r.profile.piece === "cubierta" && r.barcode !== undefined && <BarcodeBox r={r} />}
      {r.coverGeo && <>
        <h3>Medidas de la cubierta</h3>
        <p className="mini">{r.coverGeo.breakdown}</p>
        <div className="panels">{r.coverGeo.panels.map((p, i) => <span key={i} className={p.kind} style={{ flexGrow: Math.max(1, p.x1 - p.x0) }} title={`${p.name}: ${fmt(p.x1 - p.x0)} mm`}><b>{p.name}</b><em>{fmt(p.x1 - p.x0)}</em></span>)}</div>
        <p className="mini">Total esperado: {fmt(r.coverGeo.totalW)} × {fmt(r.coverGeo.totalH)} mm sin sangrado.</p>
      </>}
      {r.book && <BookBox r={r} />}
      {r.spine && (
        <>
          <h3>Lomo</h3>
          <div className={"spinebox " + (Math.abs(r.spine.actual - r.spine.expected) > 1 ? "bad" : "good")}>
            <div><b>{fmt(r.spine.actual)} mm</b><span>en la cubierta</span></div>
            <div><b>{fmt(r.spine.expected)} mm</b><span>calculado: {r.spine.pages} págs. en {r.spine.paper}</span></div>
          </div>
        </>
      )}
      <h3>{r.pdfxCheck.declared ? `Reglas de ${r.pdfxCheck.target}` : `Reglas principales de ${r.pdfxCheck.target}`}</h3>
      <ul className="checklist">
        {r.pdfxCheck.rules.map(x => <li key={x.label} className={x.ok ? "" : "bad"}><SevIcon sev={x.ok ? "ok" : (r.pdfxCheck.declared ? "error" : "warn")} size={16} /><span>{x.label}</span>{x.detail && !x.ok && <em>{x.detail}</em>}</li>)}
      </ul>
      <p className="mini">Es una revisión de las reglas principales del estándar, no una certificación.</p>
      {(r.spots.length > 0 || r.technical.length > 0) && <>
        <h3>Tintas planas y técnicas</h3>
        <div className="inks">{r.spots.map(s => <span key={s}><i />{s}</span>)}{r.technical.map(s => <span key={s} className="tech"><i />{s}</span>)}</div>
      </>}
      {r.layers.length > 0 && <>
        <h3>Capas</h3>
        <ul className="fonts">{r.layers.map(l => <li key={l.name} className={l.hidden ? "bad" : ""}><span>{l.name}</span><em>{l.hidden ? "Oculta" : "Visible"}</em></li>)}</ul>
      </>}
      <h3>Planchas en el documento</h3>
      <p className="mini">Páginas que generan tinta en cada plancha: C {totals.c} · M {totals.m} · Y {totals.y} · K {totals.k}</p>
      <h3>Fuentes ({r.fonts.length})</h3>
      <ul className="fonts">{r.fonts.map(f => <li key={f.name + f.type} className={f.embedded ? "" : "bad"}><span>{f.name}</span><em>{f.embedded ? "Incrustada" : "Sin incrustar"} · {f.type}</em></li>)}</ul>
      <h3>ISBN</h3>
      {r.isbns.length ? <ul className="fonts">{r.isbns.map(s => <li key={s.value} className={s.valid ? "" : "bad"}><span>{s.value}</span><em>{s.valid ? "Dígito de control correcto" : "Dígito de control inválido"} · pág. {s.pages.map(p => p + 1).join(", ")}</em></li>)}</ul> : <p className="mini">No encontré ningún ISBN en el texto.</p>}
    </div>
  );
}

function BarcodeBox({ r }: { r: Report }) {
  const b = r.barcode;
  if (!b) return <><h3>Código de barras</h3><p className="mini">No encontré un código EAN-13 legible en la cubierta.</p></>;
  const ink = (v: number[]) => ["C", "M", "Y", "K"].map((k, i) => v[i] > 0.02 ? `${k} ${Math.round(v[i] * 100)}` : "").filter(Boolean).join(" · ") || "sin tinta";
  const good = b.magnification >= 0.8 && b.heightMm >= 18 && b.quietLeft && b.quietRight;
  return (
    <>
      <h3>Código de barras</h3>
      <div className={"barcodebox " + (good ? "good" : "bad")}>
        <b className="digits">{b.digits.replace(/^(\d{3})(\d{2,})/, "$1 $2")}{b.addon ? <em> + {b.addon}</em> : null}</b>
        <dl className="kv">
          <div><dt>Tamaño</dt><dd>{Math.round(b.magnification * 100)} % del nominal</dd></div>
          <div><dt>Alto de barras</dt><dd>{fmt(b.heightMm)} mm</dd></div>
          <div><dt>Márgenes blancos</dt><dd>{b.quietLeft && b.quietRight ? "Correctos" : `Falta ${!b.quietLeft && !b.quietRight ? "a los dos lados" : !b.quietLeft ? "a la izquierda" : "a la derecha"}`}</dd></div>
          <div><dt>Barras</dt><dd>{ink(b.bars)}</dd></div>
          <div><dt>Fondo</dt><dd>{ink(b.space)}</dd></div>
        </dl>
      </div>
    </>
  );
}

function BookBox({ r }: { r: Report }) {
  const b = r.book!;
  const off = b.folioOffset;
  return (
    <>
      <h3>Composición del libro</h3>
      <dl className="kv">
        <div><dt>Cuerpo de texto</dt><dd>{fmt(b.bodySize)} pt</dd></div>
        <div><dt>Folios</dt><dd>{off === null ? "No detecté folios" : off === 0 ? "Coinciden con la página del PDF" : `Folio = página del PDF ${off > 0 ? "−" : "+"} ${Math.abs(off)}`}</dd></div>
        {b.title && <div><dt>Título</dt><dd title={b.title}>{b.title}</dd></div>}
        <div><dt>Depósito legal</dt><dd>{b.credits.dl ? `${b.credits.dl}${b.credits.dlOk === false ? " · formato dudoso" : ""}` : "No lo encontré"}</dd></div>
        <div><dt>Ortografía</dt><dd>{b.spelling.checked ? `${b.spelling.words.toLocaleString("es")} palabras · ${b.spelling.unknown} para revisar` : (b.spelling.reason ?? "No revisada")}</dd></div>
        <div><dt>País</dt><dd>{COUNTRY_NAME[r.profile.country] ?? "Otro"}</dd></div>
      </dl>
      {b.chapters.length > 0 && <>
        <h3>Capítulos ({b.chapters.length})</h3>
        <ul className="fonts chapters">{b.chapters.slice(0, 60).map(c => <li key={c.page + c.title} className={r.profile.chaptersOdd && c.page % 2 === 1 ? "bad" : ""}><span>{c.title}</span><em>pág. {c.page + 1}{off !== null ? ` · folio ${c.page + 1 - off}` : ""}</em></li>)}</ul>
      </>}
      {b.toc.length > 0 && <>
        <h3>Índice contra páginas reales</h3>
        <ul className="fonts">{b.toc.map((t, i) => <li key={i} className={t.ok ? "" : "bad"}><span>{t.title}</span><em>{t.ok ? `pág. ${t.folio} ✓` : t.real == null ? `dice ${t.folio} · no lo encontré` : `dice ${t.folio} · está en la ${t.real}`}</em></li>)}</ul>
      </>}
    </>
  );
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString("es", { maximumFractionDigits: 1 });
const pct = (v: number) => v === 0 ? "—" : v < 0.01 ? "< 1 %" : `${Math.round(v * 100)} %`;
function bleedOf(p: Report["pages"][0]) {
  const k = 25.4 / 72;
  const v = Math.min(p.trim[0] - p.bleed[0], p.bleed[2] - p.trim[2], p.trim[1] - p.bleed[1], p.bleed[3] - p.trim[3]) * k;
  return v < 0.2 ? "Sin sangrado" : `${fmt(v)} mm`;
}
