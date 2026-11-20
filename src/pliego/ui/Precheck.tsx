// Antes de revisar: compara lo que el PDF muestra de sí mismo con el perfil elegido y, si algo no
// coincide (tintas, país del ISBN, idioma), lo avisa antes de gastar una revisión completa.
import { useEffect, useState } from "react";
import type { Inspect } from "../engine/analyze";
import { CONTENTS, PAPERS, Profile, systemIdFor } from "../engine/profiles";
import { COUNTRY_NAME } from "../engine/book";
import { DICTS, FAMILY_NAME } from "../engine/lang";

export interface PreItem { id: string; title: string; text: string; patch: Partial<Profile> }
type Piece = "interior" | "cubierta";

const INKS_NAME: Record<string, string> = { "1": "a una tinta", "2": "a dos tintas", "4": "a cuatro colores", "4+": "a cuatro colores más tintas planas" };
const MONO_CONTENT = new Set(["narrativa", "ensayo", "poesia"]);

export function compareProfile(profile: Profile, looks: { piece: Piece; insp: Inspect }[]): PreItem[] {
  const items: PreItem[] = [];
  const interior = looks.find(l => l.piece === "interior")?.insp;
  if (interior && interior.sampled >= 3) {
    const share = interior.colorPages / interior.sampled;
    const mono = profile.inks === "1" || profile.inks === "2";
    if (mono && share >= 0.5)
      items.push({ id: "inks", title: "Parece un libro a cuatro colores",
        text: `${interior.colorPages} de las ${interior.sampled} páginas que miré tienen color, y el perfil dice interior ${INKS_NAME[profile.inks ?? "1"]}.`,
        patch: { inks: "4", colorMode: "cmyk" } });
    else if (profile.inks === "1" && (interior.accentPages ?? 0) >= Math.max(2, interior.sampled * 0.25))
      items.push({ id: "inks", title: "Tiene detalles en color",
        text: `En ${interior.accentPages} de las ${interior.sampled} páginas que miré hay elementos en color (títulos, ornamentos, filetes), y el perfil dice interior a una tinta. Si se imprime a cuatro colores, cambialo; si va a una tinta, esos elementos tienen que pasar a negro.`,
        patch: { inks: "4", colorMode: "cmyk" } });
    if (!mono && interior.sampled >= 6 && interior.colorPages === 0 && !(interior.accentPages ?? 0))
      items.push({ id: "inks", title: "Parece un libro a una tinta",
        text: `Ninguna de las ${interior.sampled} páginas que miré tiene color, y el perfil dice ${INKS_NAME[profile.inks ?? "4"]}.`,
        patch: { inks: "1", colorMode: "mono" } });
  }
  const withIsbn = looks.find(l => l.insp.isbnCountry && l.insp.isbnCountry !== profile.country && COUNTRY_NAME[l.insp.isbnCountry]);
  if (withIsbn) {
    const c = withIsbn.insp.isbnCountry!;
    items.push({ id: "country", title: `El ISBN es de ${COUNTRY_NAME[c]}`,
      text: `El ISBN ${withIsbn.insp.isbn} tiene el prefijo de ${COUNTRY_NAME[c]}, y el perfil dice ${COUNTRY_NAME[profile.country] ?? profile.country}. Cambia lo que se pide en la página de créditos (depósito legal) y la variante del español.`,
      patch: { country: c as Profile["country"] } });
  }
  // tapa dura: la cubierta sobresale del interior por las vueltas (unos 15 mm) y la ceja de cada lado
  const cov = looks.find(l => l.piece === "cubierta")?.insp;
  if (interior && cov) {
    const dh = cov.hMm - interior.hMm;
    if (profile.coverType !== "tapadura" && dh >= 22 && dh <= 50)
      items.push({ id: "coverType", title: "La cubierta parece de tapa dura",
        text: `La cubierta mide ${Math.round(cov.hMm)} mm de alto y el interior ${Math.round(interior.hMm)} mm: los ${Math.round(dh)} mm de diferencia son las vueltas y la ceja de una tapa dura. El perfil dice ${profile.coverType === "sobrecubierta" ? "sobrecubierta" : "rústica"}.`,
        patch: { coverType: "tapadura", binding: "tapadura" } });
    else if (profile.coverType === "tapadura" && Math.abs(dh) <= 2)
      items.push({ id: "coverType", title: "La cubierta parece de rústica",
        text: `La cubierta tiene el mismo alto que el interior (${Math.round(cov.hMm)} mm): no tiene vueltas de tapa dura.`,
        patch: { coverType: "rustica", binding: "fresada" } });
  }
  if (interior && profile.language && profile.language !== "auto") {
    const fam = DICTS.find(d => d.id === profile.language)?.family;
    const top = interior.langs[0];
    if (fam && top && top.share >= 0.6 && top.family !== fam)
      items.push({ id: "lang", title: `El texto parece estar en ${FAMILY_NAME[top.family]}`,
        text: `El perfil fija el idioma en ${FAMILY_NAME[fam]}: la ortografía se revisaría con el diccionario equivocado.`,
        patch: { language: "auto" } });
  }
  return items;
}

export function PrecheckDialog({ profile, items, onRun, onCancel }: {
  profile: Profile; items: PreItem[]; onRun: (p: Profile) => void; onCancel: () => void;
}) {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map(i => [i.id, true])));
  // solo un libro con mucho color pide cambiar tipo de libro y papel; unos títulos en color, no
  const colorItem = items.find(i => i.id === "inks" && i.patch.inks === "4" && i.title.startsWith("Parece"));
  const [contentId, setContentId] = useState(colorItem && MONO_CONTENT.has(profile.contentId) ? "escolar" : profile.contentId);
  const [paperId, setPaperId] = useState(colorItem && !PAPERS.find(p => p.id === profile.paperId)?.coated ? "estucado115" : profile.paperId);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  const apply = () => {
    let n: Profile = { ...profile };
    for (const it of items) if (on[it.id]) n = { ...n, ...it.patch };
    if (colorItem && on[colorItem.id]) n = { ...n, contentId, paperId };
    n.systemId = systemIdFor(n.press ?? "offset", n.paperId);
    onRun(n);
  };
  const any = items.some(i => on[i.id]);
  return (
    <div className="scopebg" onClick={onCancel}>
      <div className="scope precheck" role="dialog" aria-modal="true" aria-labelledby="pre-t" onClick={e => e.stopPropagation()}>
        <h2 id="pre-t">Antes de revisar</h2>
        <p className="lead">Miré el PDF por arriba y hay datos del perfil que no coinciden con lo que veo. Si se corrigen ahora, la revisión sale bien de entrada.</p>
        <ul>
          {items.map(it => (
            <li key={it.id}>
              <label className="check">
                <input type="checkbox" checked={!!on[it.id]} onChange={e => setOn({ ...on, [it.id]: e.target.checked })} />
                <span><b>{it.title}</b><p>{it.text}</p></span>
              </label>
              {it === colorItem && on[it.id] && (
                <div className="pre-sel">
                  <label>Tipo de libro
                    <select value={contentId} onChange={e => setContentId(e.target.value)}>
                      {CONTENTS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </label>
                  <label>Papel
                    <select value={paperId} onChange={e => setPaperId(e.target.value)}>
                      {PAPERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="pre-btns">
          <button className="btn" onClick={() => onRun(profile)}>Revisar con mi perfil como está</button>
          <button className="btn primary" disabled={!any} onClick={apply} autoFocus>Corregir y revisar</button>
        </div>
        <span className="pre-note">Los cambios quedan guardados en tu perfil. Podés volver a cambiarlos cuando quieras.</span>
      </div>
    </div>
  );
}
