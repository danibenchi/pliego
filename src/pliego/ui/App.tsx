import { useEffect, useMemo, useState } from "react";
import type { Report, Progress, Finding } from "../engine/analyze";
import type { Profile, Sev } from "../engine/profiles";
import { crossCheck } from "../engine/cross";
import { Engine, isOom } from "./client";
import { Setup, CoverNeed } from "./Setup";
import { compareProfile, PrecheckDialog, PreItem } from "./Precheck";
import type { Inspect } from "../engine/analyze";
import { Results, DiffState, OrigState } from "./Results";
import { Gate, Logo, useAccess, Privacy, SevIcon } from "./bits";
import { sha256, applyReview, loadReview, docKey } from "./review";
import { exportPdf } from "./exportPdf";
import { sendStat, reviewStat, action } from "./stats";

const DEFAULT: Profile = { systemId: "offset-obra", contentId: "narrativa", piece: "interior", colorMode: "mono", country: "es", flapMm: 0, paperId: "ahuesado80", spell: true, coverType: "rustica", press: "offset", inks: "1", binding: "fresada", chaptersOdd: "auto" };
const PKEY = "pliego-perfil";
interface Pending { interior?: File; cubierta?: File }
// perfiles guardados con la versión anterior (sistema en vez de imprenta y papel)
function migrate(p: Profile): Profile {
  if (p.press) return p;
  const press = p.systemId?.startsWith("offset") ? "offset" : (p.systemId as any) || "offset";
  const paperId = p.systemId === "offset-estucado" && !/estucado/.test(p.paperId ?? "") ? "estucado115" : p.paperId ?? "ahuesado80";
  return { ...p, press, paperId, inks: p.colorMode === "cmyk" ? "4" : "1", binding: p.coverType === "tapadura" ? "tapadura" : "fresada", chaptersOdd: p.chaptersOdd ? true : "auto" };
}
type Key = "interior" | "cubierta";

interface BatchItem { file: File; key: string; status: "wait" | "run" | "done" | "error"; report?: Report; msg?: string }

// ---- archivos pesados ----
// Todo corre en el navegador del miembro: el límite y el modo liviano evitan que una computadora
// con poca memoria se quede colgada a mitad de la revisión.
const LIMIT_MB = 500;
const mbOf = (n: number) => Math.round(n / 1e6);
const memGB = (): number => (navigator as any).deviceMemory ?? 8;
const tooBig = (f: File) => f.size > LIMIT_MB * 1e6
  ? `«${f.name}» pesa ${mbOf(f.size)} MB y Pliego revisa archivos de hasta ${LIMIT_MB} MB. Un PDF de imprenta tan pesado suele traer imágenes con más resolución de la que el papel puede reproducir: exportalo con las imágenes a 300 ppi (450 ppi el arte lineal), o revisalo por partes, exportando rangos de páginas.`
  : "";
const isHeavy = (f: File) => { const m = memGB(); return f.size > 150e6 || (m <= 4 && f.size > 60e6) || (m <= 2 && f.size > 25e6); };
const OOM_MSG = "Este equipo se quedó sin memoria revisando el PDF. Cerrá otras pestañas y programas y volvé a intentarlo: la próxima revisión va a usar el modo para archivos pesados, que necesita menos memoria.";
const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";
function withExtra(r: Report, extra: Finding[]): Report {
  if (!extra.length) return r;
  const order: Record<Sev, number> = { error: 0, warn: 1, info: 2, ok: 3 };
  const findings = [...r.findings, ...extra].sort((a, b) => order[a.sev] - order[b.sev]);
  const counts = { error: 0, warn: 0, info: 0 };
  findings.forEach(f => { if (f.sev !== "ok") counts[f.sev]++; });
  return { ...r, findings, counts, verdict: counts.error ? "error" : counts.warn ? "warn" : "ok", passed: r.passed.filter(p => p.check !== "coverMatch") };
}

export function App() {
  const access = useAccess();
  const engine = useMemo(() => new Engine(), []);
  const [profile, setProfileState] = useState<Profile>(() => { try { return migrate({ ...DEFAULT, ...JSON.parse(localStorage.getItem(PKEY) || "{}") }); } catch { return DEFAULT; } });
  const setProfile = (p: Profile) => { setProfileState(p); try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch { /* */ } };
  const [coverNeed, setCoverNeed] = useState<CoverNeed | null>(null);
  const [files, setFiles] = useState<Pending>({});
  const [progress, setProgress] = useState<Progress | null>(null);
  const [reports, setReports] = useState<Partial<Record<Key, Report>>>({});
  const [active, setActive] = useState<Key>("interior");
  const [diffs, setDiffs] = useState<Partial<Record<Key, DiffState>>>({});
  const [origs, setOrigs] = useState<Partial<Record<Key, OrigState>>>({});
  const [since, setSince] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<"setup" | "run" | "results" | "batch">("setup");
  const [batch, setBatch] = useState<BatchItem[] | null>(null);
  const [batchPdf, setBatchPdf] = useState("");
  const [icc, setIcc] = useState<{ data: ArrayBuffer; name: string } | null>(null);
  const [engineState, setEngineState] = useState(engine.state);
  const [forceLight, setForceLight] = useState(false);
  const [pre, setPre] = useState<{ items: PreItem[]; go: (p: Profile) => void } | null>(null);
  const [lightRun, setLightRun] = useState(false);
  useEffect(() => { engine.onState = setEngineState; setEngineState(engine.state); }, [engine]);

  const report = reports[active] ?? reports.interior ?? reports.cubierta ?? null;

  const analyzeFile = async (f: File, prof: Profile, key: string, onP: (p: Progress) => void) => {
    const buf = await f.arrayBuffer();
    const hash = await sha256(buf);
    const light = forceLight || isHeavy(f);
    if (light) setLightRun(true);
    const r = await engine.analyze(buf, f.name, prof, onP, icc, key, light);
    return { ...r, hash };
  };

  const runBatch = async (list: File[], prof = profile) => {
    setError("");
    const pdfs = list.filter(isPdf);
    if (!pdfs.length) { setError("Ninguno de esos archivos es un PDF."); return; }
    const items: BatchItem[] = pdfs.map((file, i) => tooBig(file) ? { file, key: `b${i}`, status: "error", msg: `Pesa ${mbOf(file.size)} MB (límite ${LIMIT_MB} MB)` } : { file, key: `b${i}`, status: "wait" });
    setLightRun(false);
    setBatch(items); setReports({}); setDiffs({}); setOrigs({}); setView("batch"); setSince(performance.now());
    action("batch");
    await engine.ready;
    for (let i = 0; i < items.length; i++) {
      if (items[i].status === "error") continue;
      items[i] = { ...items[i], status: "run" }; setBatch([...items]);
      try {
        const pk = await engine.peek(await items[i].file.arrayBuffer());
        const r = await analyzeFile(items[i].file, { ...prof, piece: pk.cover ? "cubierta" : "interior" }, items[i].key, pr => setProgress({ ...pr, stage: `${items[i].file.name} · ${pr.stage}` }));
        items[i] = { ...items[i], status: "done", report: r };
        sendStat(reviewStat(r, { batch: true }));
      } catch (e) {
        if (isOom(e)) { setForceLight(true); await engine.ready; }
        items[i] = { ...items[i], status: "error", msg: isOom(e) ? "Sin memoria en este equipo" : undefined };
      }
      setBatch([...items]);
    }
    setProgress(null);
  };

  const openBatchItem = async (it: BatchItem) => {
    if (!it.report) return;
    if (!(await engine.has(it.key))) {
      setView("run"); setProgress({ stage: "Volviendo a abrir el PDF", pct: 5 });
      try { const r = await analyzeFile(it.file, it.report.profile, it.key, setProgress); it.report = r; setBatch(b => b ? b.map(x => x.key === it.key ? { ...x, report: r } : x) : b); }
      catch { setView("batch"); return; }
    }
    setDiffs({}); setOrigs({});
    setReports({ [it.report.profile.piece === "cubierta" ? "cubierta" : "interior"]: it.report }); setActive(it.report.profile.piece === "cubierta" ? "cubierta" : "interior"); setView("results");
  };

  const downloadBatch = async () => {
    if (!batch) return;
    setBatchPdf("busy");
    try {
      const done = batch.filter(b => b.report);
      const inputs = done.map(b => ({ report: b.report!, applied: applyReview(b.report!.findings, loadReview(docKey(b.file.name, b.report!.profile.piece))), thumbs: [] }));
      await exportPdf(inputs, `Preflight - lote de ${done.length} archivos.pdf`, inputs.map(x => ({ name: x.report.file.name, pages: x.report.file.pages, format: x.report.file.formatMm, verdict: x.applied.verdict, counts: x.applied.counts })));
      setBatchPdf("done"); setTimeout(() => setBatchPdf(""), 2500);
    } catch (e) { console.error(e); setBatchPdf("error"); }
  };

  // reconoce qué es cada archivo (interior o cubierta) y decide cómo revisarlos
  const onFiles = async (list: File[]) => {
    setError(""); setCoverNeed(null);
    const pdfs = list.filter(isPdf);
    if (!pdfs.length) { setError("Ese archivo no es un PDF."); return; }
    if (pdfs.length > 2) return runBatch(pdfs);
    const big = pdfs.map(tooBig).find(Boolean);
    if (big) { setError(big); return; }
    await engine.ready;
    // vistazo antes de revisar: qué es cada archivo y si el perfil coincide con lo que muestra
    setFiles({ interior: pdfs[0], cubierta: pdfs[1] }); setView("run"); setSince(performance.now());
    setProgress({ stage: "Mirando el PDF antes de revisar", pct: 1 });
    let looks: Inspect[];
    try { looks = []; for (const f of pdfs) looks.push(await engine.inspect(await f.arrayBuffer())); }
    catch (e) {
      setProgress(null); setView("setup");
      setError(isOom(e) ? OOM_MSG : "No pude leer este PDF. Puede estar dañado, protegido o no ser un PDF válido."); return;
    }
    let plan: Pending | null = null, needCover = false;
    if (pdfs.length === 2) {
      const ci = looks.findIndex(x => x.cover);
      if (ci >= 0 && !looks[1 - ci].cover) plan = { interior: pdfs[1 - ci], cubierta: pdfs[ci] };
      else { setProgress(null); return runBatch(pdfs); }
    } else if (looks[0].cover) { plan = { cubierta: pdfs[0] }; needCover = true; }
    else plan = { interior: pdfs[0] };
    const go = (prof: Profile) => {
      setPre(null);
      if (prof !== profile) setProfile(prof);
      if (needCover && !(prof.trimW && (prof.interiorPages || prof.spineMm))) {
        setProgress(null); setView("setup");
        setCoverNeed({ file: pdfs[0], peekW: looks[0].wMm, peekH: looks[0].hMm });
        return;
      }
      run(plan!, prof);
    };
    const items = compareProfile(profile, [
      ...(plan.interior ? [{ piece: "interior" as const, insp: looks[pdfs.indexOf(plan.interior)] }] : []),
      ...(plan.cubierta ? [{ piece: "cubierta" as const, insp: looks[pdfs.indexOf(plan.cubierta)] }] : []),
    ]);
    if (!items.length) return go(profile);
    setProgress({ stage: "Antes de revisar, confirmá el perfil", pct: 1 });
    setPre({ items, go });
  };

  const run = async (p: Pending, prof = profile) => {
    setError(""); setBatch(null); setCoverNeed(null);
    const fi = p.interior, fc = p.cubierta;
    if ((fi && !isPdf(fi)) || (fc && !isPdf(fc))) { setError("Ese archivo no es un PDF."); return; }
    const big = [fi, fc].map(f => f ? tooBig(f) : "").find(Boolean);
    if (big) { setError(big); setView("setup"); return; }
    setLightRun(false);
    if (fc && !fi && (!prof.trimW || !(prof.interiorPages || prof.spineMm))) { setCoverNeed({ file: fc, peekW: 0, peekH: 0 }); setView("setup"); return; }
    setFiles(p); setView("run"); setReports({}); setDiffs({}); setOrigs({}); setSince(performance.now());
    setProgress({ stage: "Abriendo el PDF", pct: 2 });
    const both = !!(fi && fc);
    try {
      await engine.ready;
      const out: Partial<Record<Key, Report>> = {};
      if (fi) {
        out.interior = await analyzeFile(fi, { ...prof, piece: "interior" },
          both ? "int" : "main", pr => setProgress(both ? { ...pr, stage: `Interior · ${pr.stage}`, pct: pr.pct * 0.62 } : pr));
      }
      if (fc) {
        const ip = out.interior?.pages[0];
        const cprof: Profile = { ...prof, piece: "cubierta",
          interiorPages: out.interior ? out.interior.file.pages : prof.interiorPages,
          trimW: ip && (!prof.trimW || both) ? Math.round(ip.wMm * 10) / 10 : prof.trimW,
          trimH: ip && (!prof.trimH || both) ? Math.round(ip.hMm * 10) / 10 : prof.trimH };
        out.cubierta = await analyzeFile(fc, cprof,
          both ? "cov" : "main", pr => setProgress(both ? { ...pr, stage: `Cubierta · ${pr.stage}`, pct: 62 + pr.pct * 0.38 } : pr));
      }
      if (out.interior && out.cubierta) {
        const x = crossCheck(out.interior, out.cubierta);
        out.interior = withExtra(out.interior, x); out.cubierta = withExtra(out.cubierta, x);
      }
      setReports(out); setActive(out.interior ? "interior" : "cubierta"); setView("results");
      for (const r of [out.interior, out.cubierta]) if (r) sendStat(reviewStat(r, { batch: false }));
    } catch (e: any) {
      if (isOom(e)) { setForceLight(true); setError(OOM_MSG); setView("setup"); return; }
      setError(/password|encrypt/i.test(String(e?.message)) ? "El PDF está protegido con contraseña." : "No pude leer este PDF. Puede estar dañado o no ser un PDF válido.");
      setView("setup");
    }
  };

  useEffect(() => { document.title = report ? `${report.file.name} · Pliego` : "Pliego · Preflight de imprenta"; }, [report]);

  if (!access.ok) return <Gate onCode={access.tryCode} />;
  const keys = (["interior", "cubierta"] as Key[]).filter(k => reports[k]);

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#" onClick={e => { e.preventDefault(); if (view !== "run") { setView("setup"); } }}>
          <Logo /><span><b>Pliego</b><em>Preflight de imprenta</em></span>
        </a>
        {report && view === "results" && (
          <div className="crumbs">
            {keys.length > 1 ? (
              <div className="docswitch" role="tablist" aria-label="Archivo">
                {keys.map(k => {
                  const r = reports[k]!;
                  return <button key={k} role="tab" aria-selected={active === k} className={active === k ? "on " + r.verdict : r.verdict} onClick={() => setActive(k)} title={r.file.name}>
                    <i />{k === "interior" ? "Interior" : "Cubierta"}<em>{r.counts.error ? `${r.counts.error} bloq.` : r.counts.warn ? `${r.counts.warn} a revisar` : "listo"}</em>
                  </button>;
                })}
              </div>
            ) : <span className="fname" title={report.file.name}>{report.file.name}</span>}
            <span>{report.file.formatMm}</span><span>{report.file.pages} pág.</span>
          </div>
        )}
        <span className="by">Academia Proyecto451</span>
      </header>

      {view === "setup" && <Setup profile={profile} setProfile={setProfile} onFiles={onFiles} coverNeed={coverNeed}
        onCoverReady={() => coverNeed && run({ cubierta: coverNeed.file })} onCoverCancel={() => setCoverNeed(null)}
        error={error || (engineState === "error" ? "El motor de análisis no pudo arrancar en este navegador. Probá con Chrome, Edge, Firefox o Safari actualizados." : "")} engineState={engineState} icc={icc} setIcc={setIcc} />}

      {pre && <PrecheckDialog profile={profile} items={pre.items} onRun={pre.go} onCancel={() => { setPre(null); setProgress(null); setView("setup"); }} />}
      {view === "run" && progress && (
        <main className="running" aria-live="polite">
          <div className="press">
            <div className="bars">{["c", "m", "y", "k"].map((k, i) => <i key={k} className={"ink" + k} style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress.pct / 100 * 1.15 - i * 0.05))})` }} />)}</div>
            <h1>{progress.stage}</h1>
            <p>{progress.page ? `Página ${progress.page} de ${progress.pages}` : [files.interior?.name, files.cubierta?.name].filter(Boolean).join(" · ")}</p>
            {lightRun && <p className="lightnote">Archivo pesado: la revisión se adapta a la memoria de este equipo. Puede tardar unos minutos; no cierres esta pestaña.</p>}
          </div>
          <Privacy since={since} />
        </main>
      )}

      {view === "results" && report && (
        <Results key={report.key + report.file.name + report.ms} engine={engine} report={report} since={since}
          diff={diffs[active]} setDiff={d => setDiffs(s => ({ ...s, [active]: d }))}
          orig={origs[active]} setOrig={o => setOrigs(s => ({ ...s, [active]: o }))}
          onReset={() => { setView("setup"); setReports({}); setBatch(null); }}
          onAddCover={files.interior && !files.cubierta && report.profile.piece === "interior" ? f => run({ interior: files.interior, cubierta: f }) : undefined}
          onPatch={r => setReports(s => ({ ...s, [active]: r }))}
          onRerun={batch ? undefined : patch => {
            const n: Profile = { ...profile, ...patch };
            if (patch.inks) { n.colorMode = patch.inks === "4" || patch.inks === "4+" ? "cmyk" : "mono"; }
            setProfile(n); run(files, n);
          }}
          onProfile={() => { setView("setup"); }} onBack={batch ? () => setView("batch") : undefined} />
      )}

      {view === "batch" && batch && (
        <main className="batch">
          <header>
            <div>
              <h1>{batch.length} archivos</h1>
              <p>{batch.every(b => b.status === "done" || b.status === "error") ? "Revisión terminada. Abrí cada uno para ver el detalle." : progress?.stage ?? "Revisando…"}</p>
            </div>
            <div className="bactions">
              <button className="btn" onClick={() => { setView("setup"); }}>Cambiar perfil</button>
              <button className="btn primary" disabled={batchPdf === "busy" || !batch.some(b => b.report)} onClick={downloadBatch}>{batchPdf === "busy" ? "Armando el informe…" : batchPdf === "done" ? "Informe descargado ✓" : "Informe del lote en PDF"}</button>
            </div>
          </header>
          <table>
            <thead><tr><th>Archivo</th><th>Págs.</th><th>Formato</th><th>Resultado</th><th /></tr></thead>
            <tbody>
              {batch.map(b => {
                const a = b.report ? applyReview(b.report.findings, loadReview(docKey(b.file.name, b.report.profile.piece))) : null;
                return (
                  <tr key={b.key} className={b.status} onClick={() => b.report && openBatchItem(b)}>
                    <td className="bname">{a ? <SevIcon sev={a.verdict} size={16} /> : <span className={"spin " + b.status} />}<span>{b.file.name}</span></td>
                    <td>{b.report?.file.pages ?? "—"}</td>
                    <td>{b.report?.file.formatMm ?? "—"}</td>
                    <td>{b.status === "error" ? (b.msg ?? "No pude leerlo") : a ? (a.counts.error ? `${a.counts.error} bloqueante${a.counts.error > 1 ? "s" : ""}` : a.counts.warn ? `${a.counts.warn} a revisar` : "Listo para imprenta") + (a.counts.error && a.counts.warn ? ` · ${a.counts.warn} a revisar` : "") : b.status === "run" ? "Revisando…" : "En espera"}</td>
                    <td>{b.report && <span className="open">Ver informe →</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Privacy since={since} />
        </main>
      )}
      {view === "setup" && batch && <div className="rerun"><span>Tenés abierto un lote de <b>{batch.length} archivos</b></span><button className="btn primary" onClick={() => runBatch(batch.map(b => b.file))}>Revisar de nuevo con este perfil</button><button className="btn" onClick={() => setView("batch")}>Volver al lote</button></div>}
      {view === "setup" && !batch && keys.length > 0 && (
        <div className="rerun"><span>Tenés abierto <b>{[files.interior?.name, files.cubierta?.name].filter(Boolean).join(" y ")}</b></span><button className="btn primary" onClick={() => run(files)}>Revisar de nuevo con este perfil</button><button className="btn" onClick={() => setView("results")}>Volver al informe</button></div>
      )}
    </div>
  );
}
