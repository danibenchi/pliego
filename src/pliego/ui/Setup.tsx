import { useEffect, useRef, useState } from "react";
import { SYSTEMS, CONTENTS, PAPERS, FORMATS, PRESSES, INKS, BINDINGS, Profile, Press, Inks, Binding, PrinterSpec, systemIdFor, resolve } from "../engine/profiles";
import { Privacy, SOURCE_URL, ScopeDialog } from "./bits";
import { DICTS } from "../engine/lang";
import { Printer, loadPrinters, savePrinters, printerFromProfile, putIcc, getIcc, exportPrinter, importPrinter } from "./printers";
import { saveFile } from "./save";

type Icc = { data: ArrayBuffer; name: string } | null;
export interface CoverNeed { file: File; peekW: number; peekH: number }
const FINISHES = ["Laminado", "Barniz selectivo", "Stamping", "Relieve"];
const fmt = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

export function Setup({ profile, setProfile, onFiles, error, engineState, icc, setIcc, coverNeed, onCoverReady, onCoverCancel }: {
  profile: Profile; setProfile: (p: Profile) => void; onFiles: (f: File[]) => void;
  error: string; engineState: string; icc: Icc; setIcc: (v: Icc) => void;
  coverNeed: CoverNeed | null; onCoverReady: () => void; onCoverCancel: () => void;
}) {
  const set = (patch: Partial<Profile>) => {
    const n = { ...profile, ...patch };
    n.systemId = systemIdFor(n.press ?? "offset", n.paperId);
    n.colorMode = n.inks === "4" || n.inks === "4+" ? "cmyk" : "mono";
    n.coverType = n.binding === "tapadura" ? (n.coverType === "sobrecubierta" ? "sobrecubierta" : "tapadura") : n.coverType === "sobrecubierta" ? "sobrecubierta" : "rustica";
    setProfile(n);
  };
  const setSpec = (patch: Partial<PrinterSpec>) => set({ spec: { ...(profile.spec ?? {}), ...patch }, printerId: profile.printerId });
  const [printers, setPrinters] = useState<Printer[]>(() => loadPrinters());
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [scope, setScope] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null), iccInput = useRef<HTMLInputElement>(null), impInput = useRef<HTMLInputElement>(null);
  const { system, content, paper, binding } = resolve(profile);
  const press = profile.press ?? "offset";
  const fmtKey = profile.trimW ? `${profile.trimW}x${profile.trimH}` : "auto";
  const isCustom = profile.trimW && !FORMATS.some(f => `${f.w}x${f.h}` === fmtKey);
  const [custom, setCustom] = useState(!!isCustom);
  const printer = printers.find(p => p.id === profile.printerId) ?? null;

  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent); window.addEventListener("drop", prevent);
    return () => { window.removeEventListener("dragover", prevent); window.removeEventListener("drop", prevent); };
  }, []);

  const take = (files: File[]) => { const pdfs = files.filter(f => /\.pdf$/i.test(f.name) || f.type === "application/pdf"); if (pdfs.length) onFiles(pdfs); else if (files.length) onFiles(files); };
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };

  const loadIcc = async (f?: File | null) => {
    if (!f) return;
    const buf = await f.arrayBuffer(), b = new Uint8Array(buf);
    const sig = String.fromCharCode(...b.slice(36, 40)), space = String.fromCharCode(...b.slice(16, 20));
    if (sig !== "acsp") return flash("Ese archivo no es un perfil ICC.");
    if (space !== "CMYK") return flash("Ese perfil no es CMYK. Pedile a la imprenta su perfil de salida CMYK.");
    setIcc({ data: buf, name: f.name.replace(/\.(icc|icm)$/i, "") });
  };
  const choosePrinter = async (id: string) => {
    if (!id) { set({ printerId: undefined, printerName: undefined, spec: {}, finishes: undefined }); setIcc(null); return; }
    const pr = printers.find(p => p.id === id); if (!pr) return;
    set({ printerId: pr.id, printerName: pr.name, press: pr.press, paperId: pr.paperId, inks: pr.inks ?? profile.inks, binding: pr.binding ?? profile.binding, spec: { ...pr.spec }, finishes: pr.finishes });
    const data = pr.iccName ? await getIcc(pr.id) : null;
    setIcc(data && pr.iccName ? { data, name: pr.iccName } : null);
  };
  const savePrinter = async (name: string) => {
    const existing = printers.find(p => p.name.toLowerCase() === name.toLowerCase());
    const pr = printerFromProfile(profile, name, icc?.name ?? null, existing?.id);
    const list = existing ? printers.map(p => p.id === existing.id ? pr : p) : [...printers, pr];
    savePrinters(list); setPrinters(list); setSaving(null);
    if (icc) await putIcc(pr.id, icc.data.slice(0));
    set({ printerId: pr.id, printerName: pr.name }); flash(`Guardé «${name}». La próxima vez elegila de la lista.`);
  };
  const removePrinter = () => {
    if (!printer) return;
    const list = printers.filter(p => p.id !== printer.id); savePrinters(list); setPrinters(list); putIcc(printer.id, null);
    set({ printerId: undefined, printerName: undefined }); flash(`Borré «${printer.name}».`);
  };
  const doExport = async () => {
    const pr = printer ?? printerFromProfile(profile, "Mi imprenta", icc?.name ?? null);
    try { await saveFile(`Imprenta - ${pr.name}.json`, exportPrinter(pr)); } catch { flash("No pude exportar el archivo."); }
  };
  const doImport = async (f?: File | null) => {
    if (!f) return;
    const pr = importPrinter(await f.text());
    if (!pr) return flash("Ese archivo no es una imprenta de Pliego.");
    const list = [...printers, pr]; savePrinters(list); setPrinters(list);
    set({ printerId: pr.id, printerName: pr.name, press: pr.press, paperId: pr.paperId, inks: pr.inks ?? profile.inks, binding: pr.binding ?? profile.binding, spec: { ...pr.spec }, finishes: pr.finishes });
    flash(`Importé «${pr.name}».${pr.notes ? " " + pr.notes : ""}`);
  };

  const sig = system.signature;
  const effect = [
    press === "offset" && paper ? `tinta máxima ${system.tac} %` : `tinta máxima ${system.tac} %`,
    paper && press === "offset" ? `condición de referencia ${paper.icc}` : null,
    paper ? `${fmt(paper.mmPerLeaf)} mm por hoja para el lomo` : null,
  ].filter(Boolean).join(" · ");

  return (
    <main className="setup">
      <section className={"drop" + (drag ? " on" : "")}
        onDragEnter={e => { e.preventDefault(); setDrag(true); }} onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); take([...e.dataTransfer.files]); }}
        onClick={e => { if ((e.target as HTMLElement).closest(".coverneed")) return; input.current?.click(); }}
        role="button" tabIndex={0} onKeyDown={e => (e.key === "Enter" || e.key === " ") && input.current?.click()} aria-label="Elegir el PDF de imprenta">
        <svg className="sheet" viewBox="0 0 320 220" aria-hidden="true">
          <defs><g id="rm"><circle r="9" fill="none" stroke="currentColor" strokeWidth="1" /><circle r="4.5" fill="none" stroke="currentColor" strokeWidth="1" /><path d="M-14 0H14M0-14V14" stroke="currentColor" strokeWidth="1" /></g></defs>
          <rect x="62" y="30" width="96" height="150" rx="2" className="pg" />
          <rect x="162" y="30" width="96" height="150" rx="2" className="pg" />
          <line x1="160" y1="26" x2="160" y2="184" className="gut" />
          {[0, 1, 2, 3, 4, 5, 6].map(i => <rect key={i} x="176" y={52 + i * 12} width={i === 6 ? 40 : 68} height="4" rx="2" className="ln" />)}
          {[0, 1, 2, 3, 4, 5, 6].map(i => <rect key={"l" + i} x="76" y={52 + i * 12} width={i === 0 ? 30 : 68} height="4" rx="2" className="ln" />)}
          <rect x="76" y="140" width="68" height="28" rx="2" className="img" />
          <use href="#rm" x="30" y="105" /><use href="#rm" x="290" y="105" /><use href="#rm" x="160" y="12" /><use href="#rm" x="160" y="200" />
          {[["#00a3e0", 0], ["#e5007d", 1], ["#ffd400", 2], ["#141618", 3]].map(([c, i]) => <rect key={c as string} x={110 + (i as number) * 26} y="192" width="22" height="14" fill={c as string} className="strip" style={{ animationDelay: `${(i as number) * 120}ms` }} />)}
        </svg>
        {coverNeed ? (
          <div className="coverneed" onClick={e => e.stopPropagation()}>
            <h1>Es una cubierta</h1>
            <p>Para calcular el lomo y las medidas necesito dos datos del interior. Si tenés el PDF del interior, soltalo junto con la cubierta y los tomo de ahí.</p>
            <div className="row2">
              <label className="field"><span className="lab">Formato final del libro</span>
                <select value={fmtKey} onChange={e => { const v = e.target.value; if (v === "auto") return; const [w, h] = v.split("x").map(Number); set({ trimW: w, trimH: h }); }}>
                  <option value="auto">Elegí el formato…</option>
                  {FORMATS.map(f => <option key={f.name} value={`${f.w}x${f.h}`}>{f.name}</option>)}
                </select>
              </label>
              <label className="field"><span className="lab">Páginas del interior</span>
                <input type="number" inputMode="numeric" min={2} value={profile.interiorPages ?? ""} placeholder="240" onChange={e => set({ interiorPages: e.target.value ? +e.target.value : undefined })} />
              </label>
            </div>
            <label className="field"><span className="lab">o el lomo que te indicó la imprenta (mm)</span>
              <input type="number" inputMode="decimal" step="0.1" value={profile.spineMm ?? ""} placeholder="Opcional" onChange={e => set({ spineMm: e.target.value ? +e.target.value : undefined })} />
            </label>
            <div className="row">
              <button className="btn" onClick={onCoverCancel}>Cancelar</button>
              <button className="btn primary" disabled={!profile.trimW || !(profile.interiorPages || profile.spineMm)} onClick={onCoverReady}>Revisar la cubierta</button>
            </div>
          </div>
        ) : <>
          <h1>Soltá acá el PDF de imprenta</h1>
          <p>El interior, la cubierta o los dos juntos. Si son varios libros, los reviso en tanda.</p>
          <span className="btn primary">Elegir PDF</span>
        </>}
        <span className={"engine " + engineState}><i />{engineState === "ready" ? "Motor de análisis listo, en tu equipo" : engineState === "error" ? "El motor no pudo arrancar" : "Cargando el motor de análisis…"}</span>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="scopelink" onClick={e => { e.stopPropagation(); setScope(true); }}>Qué hace y qué no hace Pliego</button>
        <a className="scopelink" href="#documentacion" onClick={e => e.stopPropagation()}>Documentación completa</a>
        <input ref={input} type="file" accept="application/pdf,.pdf" multiple hidden onChange={e => { take([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </section>

      <section className="profile" aria-label="Cómo se imprime">
        <header>
          <h2>Cómo se imprime</h2>
          <p>Lo demás lo saco del PDF: formato, páginas, color, idioma y programa.</p>
        </header>

        <div className="printerbar">
          <select value={profile.printerId ?? ""} onChange={e => choosePrinter(e.target.value)} aria-label="Imprenta">
            <option value="">Valores típicos del sector</option>
            {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {saving === null
            ? <button className="btn" onClick={() => setSaving(printer?.name ?? "")}>{printer ? "Guardar cambios" : "Guardar como mi imprenta"}</button>
            : <form className="savename" onSubmit={e => { e.preventDefault(); if (saving.trim()) savePrinter(saving.trim()); }}>
                <input autoFocus value={saving} onChange={e => setSaving(e.target.value)} placeholder="Nombre de la imprenta" />
                <button className="btn primary" disabled={!saving.trim()}>Guardar</button>
                <button type="button" className="x" onClick={() => setSaving(null)}>Cancelar</button>
              </form>}
        </div>
        {msg && <p className="hint ok" role="status">{msg}</p>}

        <Field label="Dónde se imprime" hint={PRESSES.find(p => p.id === press)?.note}>
          <div className="cards four">
            {PRESSES.map(p => <button key={p.id} className={"card" + (p.id === press ? " on" : "")} aria-pressed={p.id === press} onClick={() => set({ press: p.id as Press })}><b>{p.name}</b></button>)}
          </div>
        </Field>

        <Field label="Papel del interior" hint={effect}>
          <select value={profile.paperId ?? "ahuesado80"} onChange={e => set({ paperId: e.target.value, mmPerLeaf: undefined })}>
            {PAPERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>

        <Field label="Tintas del interior">
          <div className="seg" role="radiogroup">
            {INKS.map(k => <button key={k.id} role="radio" aria-checked={(profile.inks ?? "1") === k.id} className={(profile.inks ?? "1") === k.id ? "on" : ""} onClick={() => set({ inks: k.id as Inks })}>{k.name}</button>)}
          </div>
        </Field>

        <div className="row2">
          <Field label="Encuadernación" hint={binding ? `Margen mínimo hacia el lomo: ${content.gutterMm} mm${sig > 2 ? ` · pliegos de ${sig}` : ""}` : undefined}>
            <select value={profile.binding ?? "fresada"} onChange={e => set({ binding: e.target.value as Binding })}>
              {BINDINGS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="País de edición" hint="Para el depósito legal, el ISBN y la variante del español.">
            <select value={profile.country} onChange={e => set({ country: e.target.value as Profile["country"] })}>
              <option value="es">España</option><option value="ar">Argentina</option><option value="mx">México</option><option value="co">Colombia</option>
              <option value="cl">Chile</option><option value="uy">Uruguay</option><option value="pe">Perú</option><option value="ve">Venezuela</option><option value="otro">Otro</option>
            </select>
          </Field>
        </div>

        <details className="more">
          <summary>Valores de la imprenta</summary>
          <p className="hint">Si tu imprenta te dio una ficha técnica, cargá sus valores: pisan los típicos. Dejá vacío lo que no sepas.</p>
          <div className="row4">
            <Num label="Sangrado (mm)" value={profile.spec?.bleedMm} ph={system.bleedMm} step={0.5} onChange={v => setSpec({ bleedMm: v })} />
            <Num label="Tinta máxima (%)" value={profile.spec?.tac} ph={system.tac} step={10} onChange={v => setSpec({ tac: v })} />
            <Num label="Resolución mínima (ppp)" value={profile.spec?.minPpi} ph={system.minPpi} step={25} onChange={v => setSpec({ minPpi: v })} />
            <Num label="Páginas por pliego" value={profile.spec?.signature} ph={sig} step={4} onChange={v => setSpec({ signature: v })} />
            <Num label="Margen al lomo (mm)" value={profile.spec?.gutterMm} ph={content.gutterMm} step={1} onChange={v => setSpec({ gutterMm: v })} />
            <Num label="Margen al corte (mm)" value={profile.spec?.safetyMm} ph={content.safetyMm} step={1} onChange={v => setSpec({ safetyMm: v })} />
          </div>
          <Field label="Perfil de color de la imprenta" hint={icc ? "Se usa para convertir el RGB y para simular el papel. No sale de tu equipo." : paper && press === "offset" ? `Si no lo tenés, uso el que traiga el PDF o FOGRA39 de referencia. Para este papel lo habitual es ${paper.icc}.` : "Si no lo tenés, uso el que traiga el PDF o FOGRA39 de referencia."}>
            <div className="icc">
              <div className="row"><b>{icc ? icc.name : "Automático"}</b></div>
              <div className="row">
                <button className="btn" onClick={() => iccInput.current?.click()}>{icc ? "Cambiar perfil" : "Cargar perfil .icc"}</button>
                {icc && <button className="x" onClick={() => setIcc(null)}>Volver a automático</button>}
              </div>
              <input ref={iccInput} type="file" accept=".icc,.icm" hidden onChange={e => { loadIcc(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </Field>
          <div className="row printeractions">
            <button className="btn" onClick={doExport}>Exportar imprenta</button>
            <button className="btn" onClick={() => impInput.current?.click()}>Importar imprenta</button>
            {printer && <button className="x" onClick={removePrinter}>Borrar «{printer.name}»</button>}
            <input ref={impInput} type="file" accept=".json,application/json" hidden onChange={e => { doImport(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <p className="hint">Exportada, la imprenta es un archivo que podés pasarle a otros editores de la Academia.</p>
        </details>

        <details className="more">
          <summary>Cubierta</summary>
          <div className="checks">
            <label><input type="checkbox" checked={profile.coverType === "sobrecubierta"} onChange={e => set({ coverType: e.target.checked ? "sobrecubierta" : profile.binding === "tapadura" ? "tapadura" : "rustica" })} /> Lleva sobrecubierta</label>
          </div>
          <div className="row2">
            {profile.coverType !== "tapadura" && <Num label="Solapas (mm, 0 si no tiene)" value={profile.flapMm} ph={0} step={5} onChange={v => set({ flapMm: v ?? 0 })} />}
            <Num label="Lomo que indica la imprenta (mm)" value={profile.spineMm} ph={undefined} step={0.1} onChange={v => set({ spineMm: v })} />
          </div>
          {profile.coverType !== "rustica" && (
            <div className="row4">
              <Num label="Cartón (mm)" value={profile.boardMm} ph={2.5} step={0.1} onChange={v => set({ boardMm: v })} />
              <Num label="Ceja (mm)" value={profile.cejaMm} ph={3} step={0.5} onChange={v => set({ cejaMm: v })} />
              {profile.coverType === "tapadura" && <Num label="Vuelta (mm)" value={profile.turnInMm} ph={15} step={1} onChange={v => set({ turnInMm: v })} />}
              {profile.coverType === "tapadura" && <Num label="Cajo (mm)" value={profile.hingeMm} ph={8} step={1} onChange={v => set({ hingeMm: v })} />}
            </div>
          )}
          <Field label="Acabados" hint="Las capas de barniz, stamping o relieve dejan de marcarse como tintas inesperadas.">
            <div className="chips">{FINISHES.map(f => { const on = profile.finishes?.includes(f); return <button key={f} className={on ? "on" : ""} aria-pressed={on} onClick={() => set({ finishes: on ? profile.finishes!.filter(x => x !== f) : [...(profile.finishes ?? []), f] })}>{f}</button>; })}</div>
          </Field>
        </details>

        <details className="more">
          <summary>Libro y revisión</summary>
          <Field label="Tipo de libro" hint={content.hint}>
            <div className="chips">{CONTENTS.map(c => <button key={c.id} className={c.id === profile.contentId ? "on" : ""} aria-pressed={c.id === profile.contentId} onClick={() => set({ contentId: c.id })}>{c.name}</button>)}</div>
          </Field>
          <div className="row2">
            <Field label="Formato final">
              <select value={custom ? "custom" : fmtKey} onChange={e => {
                const v = e.target.value;
                if (v === "custom") { setCustom(true); set({ trimW: profile.trimW ?? 150, trimH: profile.trimH ?? 225 }); return; }
                setCustom(false);
                if (v === "auto") set({ trimW: undefined, trimH: undefined }); else { const [w, h] = v.split("x").map(Number); set({ trimW: w, trimH: h }); }
              }}>
                <option value="auto">El del PDF</option>
                {FORMATS.map(f => <option key={f.name} value={`${f.w}x${f.h}`}>{f.name}</option>)}
                <option value="custom">Otro…</option>
              </select>
              {custom && <div className="dims"><label><input type="number" value={profile.trimW ?? ""} onChange={e => set({ trimW: +e.target.value })} /> ancho</label><span>×</span><label><input type="number" value={profile.trimH ?? ""} onChange={e => set({ trimH: +e.target.value })} /> alto (mm)</label></div>}
            </Field>
            <Field label="Capítulos">
              <select value={profile.chaptersOdd === true ? "odd" : profile.chaptersOdd === false ? "any" : "auto"} onChange={e => set({ chaptersOdd: e.target.value === "odd" ? true : e.target.value === "any" ? false : "auto" })}>
                <option value="auto">Seguir la regla del libro</option><option value="odd">Siempre en página impar</option><option value="any">No importa</option>
              </select>
            </Field>
          </div>
          <div className="checks">
            <label><input type="checkbox" checked={profile.spell !== false} onChange={e => set({ spell: e.target.checked })} /> Revisar ortografía</label>
            <label><input type="checkbox" checked={profile.typo !== false} onChange={e => set({ typo: e.target.checked })} /> Revisar ortotipografía, composición y aparato</label>
          </div>
          {profile.spell !== false && (
            <Field label="Idioma del texto" hint={(profile.language ?? "auto") === "auto" ? "Lo reconozco solo, también si el libro tiene partes en otra lengua." : undefined}>
              <select value={profile.language ?? "auto"} onChange={e => set({ language: e.target.value })}>
                <option value="auto">Automático</option>
                {DICTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
        </details>

        <Privacy />
        <ScopeDialog open={scope} onClose={() => setScope(false)} />
        <p className="legal">Revisión automática previa: no es una certificación ni reemplaza la preimpresión ni las pruebas de la imprenta. Pliego es software libre (AGPL-3.0){SOURCE_URL ? <> · <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">Código fuente</a></> : null}. Motor: MuPDF (AGPL). Códigos de barras: ZXing (Apache 2.0). Ortografía: Hunspell con diccionarios libres de LibreOffice (MPL, LGPL, GPL). Perfil de referencia: FOGRA39L.</p>
      </section>
    </main>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string | null; children: React.ReactNode }) {
  return <div className="field"><div className="lab">{label}</div>{children}{hint && <p className="hint">{hint}</p>}</div>;
}
function Num({ label, value, ph, step, onChange }: { label: string; value?: number; ph?: number; step: number; onChange: (v: number | undefined) => void }) {
  return (
    <label className="field"><span className="lab">{label}</span>
      <input type="number" inputMode="decimal" step={step} value={value ?? ""} placeholder={ph !== undefined ? String(ph).replace(".", ",") : ""} onChange={e => onChange(e.target.value === "" ? undefined : +e.target.value)} />
    </label>
  );
}
export { SYSTEMS };
