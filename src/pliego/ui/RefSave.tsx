// «Guardar como referencia»: toma la huella de un PDF que ya salió bien y la guarda como referencia
// de una imprenta, de una colección o de las dos. Muestra antes qué se guarda y pide confirmar los
// problemas que el archivo tiene, para no convertir un error en norma.
import { useEffect, useMemo, useState } from "react";
import type { Report } from "../engine/analyze";
import type { Profile } from "../engine/profiles";
import { describeMeasure, RefKind } from "../engine/reference";
import { loadPrinters, savePrinters, printerFromProfile, Printer } from "./printers";
import { loadCollections, saveCollections, Collection, RefMeasures, newId, today } from "./references";

export function RefSaveDialog({ reports, profile, onClose, onSaved }: {
  reports: { interior?: Report; cubierta?: Report }; profile: Profile;
  onClose: () => void; onSaved: (patch: Partial<Profile>, msg: string) => void;
}) {
  const printers = useMemo(() => loadPrinters(), []);
  const collections = useMemo(() => loadCollections(), []);
  const [kinds, setKinds] = useState<Record<RefKind, boolean>>({ imprenta: true, coleccion: true });
  const [pName, setPName] = useState(profile.printerName ?? "");
  const [cName, setCName] = useState(profile.collectionName ?? "");
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  const measures: RefMeasures = { interior: reports.interior?.measure, cubierta: reports.cubierta?.measure };
  const pieces = (["interior", "cubierta"] as const).filter(k => measures[k]);
  // lo que el archivo tiene marcado: si se guarda como referencia, deja de llamar la atención en los próximos
  const blocking = pieces.flatMap(k => reports[k]!.findings.filter(f => f.sev === "error" && f.group !== "referencia").map(f => `${pieces.length > 1 ? (k === "interior" ? "Interior: " : "Cubierta: ") : ""}${f.title}`));
  const existingP = printers.find(p => p.name.toLowerCase() === pName.trim().toLowerCase());
  const existingC = collections.find(c => c.name.toLowerCase() === cName.trim().toLowerCase());
  const can = pieces.length > 0 && (kinds.imprenta || kinds.coleccion) && (!kinds.imprenta || pName.trim()) && (!kinds.coleccion || cName.trim()) && (!blocking.length || ok);

  const save = () => {
    const patch: Partial<Profile> = {};
    const done: string[] = [];
    if (kinds.imprenta) {
      const name = pName.trim();
      const base: Printer = existingP ?? printerFromProfile(reports.interior?.profile ?? reports.cubierta!.profile, name, null);
      const merged: RefMeasures = { ...(existingP?.measures ?? {}), ...(measures.interior ? { interior: measures.interior } : {}), ...(measures.cubierta ? { cubierta: measures.cubierta } : {}) };
      const leaf = measures.cubierta?.cover?.mmPerLeaf ?? existingP?.mmPerLeaf;
      const pr: Printer = { ...base, name, measures: merged, refDate: today(), mmPerLeaf: leaf ?? undefined };
      const list = existingP ? printers.map(p => p.id === existingP.id ? pr : p) : [...printers, pr];
      savePrinters(list);
      Object.assign(patch, { printerId: pr.id, printerName: pr.name, ...(leaf ? { mmPerLeaf: leaf } : {}) });
      if (!existingP) Object.assign(patch, { press: pr.press, paperId: pr.paperId, inks: pr.inks, binding: pr.binding, spec: { ...pr.spec } });
      done.push(`la imprenta «${name}»`);
    }
    if (kinds.coleccion) {
      const name = cName.trim();
      const merged: RefMeasures = { ...(existingC?.measures ?? {}), ...(measures.interior ? { interior: measures.interior } : {}), ...(measures.cubierta ? { cubierta: measures.cubierta } : {}) };
      const c: Collection = { id: existingC?.id ?? newId(), name, measures: merged, refDate: today() };
      saveCollections(existingC ? collections.map(x => x.id === existingC.id ? c : x) : [...collections, c]);
      Object.assign(patch, { collectionId: c.id, collectionName: c.name });
      done.push(`la colección «${name}»`);
    }
    onSaved(patch, `Guardé este PDF como referencia de ${done.join(" y ")}. Los próximos que revises con ${done.length > 1 ? "ellas" : "ella"} van a mostrar lo que cambia.`);
  };

  const rows = (kind: RefKind) => pieces.flatMap(k => {
    const r = describeMeasure(measures[k]!, kind);
    return r.length ? [{ k, rows: r }] : [];
  });

  return (
    <div className="scopebg" onClick={onClose}>
      <div className="scope precheck refsave" role="dialog" aria-modal="true" aria-labelledby="ref-t" onClick={e => e.stopPropagation()}>
        <h2 id="ref-t">Guardar como referencia</h2>
        <p className="lead">Si este PDF ya salió bien, guardo sus medidas y los próximos archivos se revisan contra ellas: aparece lo que cambia respecto de la imprenta o de la colección. Guardo solo medidas y nombres de fuentes, en este navegador: nunca el PDF, su texto ni sus imágenes.</p>

        {(["imprenta", "coleccion"] as RefKind[]).map(kind => {
          const isP = kind === "imprenta";
          const list = isP ? printers.map(p => p.name) : collections.map(c => c.name);
          const exists = isP ? existingP : existingC;
          return (
            <section key={kind} className={"refkind" + (kinds[kind] ? " on" : "")}>
              <label className="check">
                <input type="checkbox" checked={kinds[kind]} onChange={e => setKinds({ ...kinds, [kind]: e.target.checked })} />
                <span><b>{isP ? "De la imprenta" : "De la colección"}</b>
                  <p>{isP ? "Cómo te pide los archivos: sangrado, PDF/X, perfil de salida, tinta, resolución y, con la cubierta, el papel real según el lomo." : "Cómo se ve la serie: formato, color, tipografía, cuerpo, interlineado, márgenes, folios, capítulos y cubierta."}</p></span>
              </label>
              {kinds[kind] && <>
                <label className="refname">
                  <span>{isP ? "Nombre de la imprenta" : "Nombre de la colección"}</span>
                  <input list={`ref-${kind}`} value={isP ? pName : cName} onChange={e => (isP ? setPName : setCName)(e.target.value)} placeholder={isP ? "Gráfica del Sur" : "Narrativa"} />
                  <datalist id={`ref-${kind}`}>{list.map(n => <option key={n} value={n} />)}</datalist>
                  {exists && <em>Ya existe: actualizo su referencia{isP ? " y conservo sus valores técnicos" : ""}.</em>}
                </label>
                {rows(kind).map(({ k, rows }) => (
                  <div key={k} className="refrows">
                    {pieces.length > 1 && <h3>{k === "interior" ? "Interior" : "Cubierta"}</h3>}
                    <dl>{rows.map(r => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}</dl>
                  </div>
                ))}
              </>}
            </section>
          );
        })}

        {blocking.length > 0 && (
          <div className="refwarn">
            <b>Este PDF tiene {blocking.length === 1 ? "un bloqueante" : `${blocking.length} bloqueantes`}</b>
            <ul>{blocking.slice(0, 6).map(t => <li key={t}>{t}</li>)}{blocking.length > 6 && <li>y {blocking.length - 6} más</li>}</ul>
            <p>Si lo guardás como referencia, lo que traiga igual los próximos archivos no va a aparecer como diferencia (los controles de siempre siguen funcionando).</p>
            <label className="check"><input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} /><span>Este archivo se imprimió bien o lo aprobó la imprenta</span></label>
          </div>
        )}

        <div className="pre-btns">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={!can} onClick={save}>Guardar referencia</button>
        </div>
      </div>
    </div>
  );
}
