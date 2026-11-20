// Documentación de Pliego: qué revisa, con qué valores, qué no hace y cómo cambió.
// Se arma con los mismos datos que usa el motor (textos de cada control, sistemas de impresión,
// papeles), así que cada control nuevo aparece acá sin escribirlo dos veces.
import { useEffect, useMemo, useState } from "react";
import { COPY, GROUPS, Group } from "../engine/copy";
import { SYSTEMS, PAPERS, CONTENTS, BINDINGS } from "../engine/profiles";
import { DICTS } from "../engine/lang";
import { SCOPE, SOURCE_URL, Logo } from "./bits";
import { NEVER_SENT } from "./stats";
import { VERSION, VERSION_DATE, CHANGELOG } from "../version";

const ORDER: Group[] = ["archivo", "paginas", "color", "imagenes", "texto", "libro", "ortotipografia", "composicion", "aparato", "cubierta", "versiones", "correcciones", "original"];
const GROUP_INTRO: Partial<Record<Group, string>> = {
  archivo: "El archivo como objeto: estándar PDF/X, perfil de salida, versión, seguridad, capas y elementos interactivos.",
  paginas: "Tamaños, cajas de corte y sangrado, márgenes de seguridad, lomo y pliegos.",
  color: "Tinta total, planchas, RGB, tintas planas, color de registro y sobreimpresión.",
  imagenes: "Resolución efectiva, compresión, profundidad de color y espacio de color de cada imagen.",
  texto: "Fuentes incrustadas, cuerpos mínimos, negros, textos calados y filetes.",
  libro: "Lo que se revisa leyendo el libro como libro: créditos, ISBN, folios, índice, cabeceras, capítulos, viudas, huérfanas, cortes de palabra y ortografía.",
  ortotipografia: "Comillas, rayas, espacios, signos y marcas de trabajo que quedaron en el texto.",
  composicion: "Calidad de la composición: líneas muy abiertas o apretadas y páginas que no terminan a la misma altura.",
  aparato: "Notas y llamadas, remisiones internas y numeración de figuras, tablas y láminas.",
  cubierta: "Medidas de la cubierta y del lomo, solapas, tapa dura, código de barras e ISBN, y cruce con el interior.",
  versiones: "Al comparar dos versiones del mismo PDF: qué texto, imágenes y paginación cambiaron.",
  correcciones: "Al subir la prueba anterior con comentarios de Acrobat: cuáles de las correcciones marcadas se aplicaron.",
  original: "Al subir el Word aprobado: texto que falta, sobra o cambió respecto del original, y notas.",
};

const SEVS = [
  { k: "error", t: "Bloqueante", d: "La imprenta lo va a rechazar o se va a ver mal en el papel. Hay que resolverlo antes de mandar el archivo." },
  { k: "warn", t: "Revisar", d: "Puede estar bien a propósito, pero conviene mirarlo. Si está bien, se marca como revisado o como falsa alarma." },
  { k: "info", t: "Para saber", d: "Información útil que no impide imprimir." },
];

const FEATURES: { t: string; d: string }[] = [
  { t: "Aviso antes de revisar", d: "Al soltar el PDF, Pliego mira una muestra de páginas, el ISBN y el idioma, y avisa si el perfil elegido no coincide (por ejemplo, un libro a cuatro colores revisado como interior a una tinta, o un ISBN de otro país)." },
  { t: "Interior y cubierta juntos", d: "Si se sueltan los dos PDF, Pliego reconoce cuál es cuál, calcula el lomo con las páginas y el papel, y cruza ISBN, título y medidas." },
  { t: "Perfil de la imprenta", d: "Los valores de la imprenta (sangrado, tinta máxima, resolución, pliego, márgenes y su perfil ICC) se guardan con un nombre y se pueden exportar para compartirlos." },
  { t: "Resumen de 30 segundos", d: "Arriba de los resultados, el veredicto y las tres primeras acciones para dejar el archivo listo." },
  { t: "Visor", d: "Cada hallazgo se marca en la página. Capas de cajas, tinta total, planchas, simulación del papel y doble página." },
  { t: "Comparar versiones", d: "Con el PDF anterior, muestra qué cambió y si se aplicaron las correcciones marcadas con comentarios de Acrobat." },
  { t: "Cotejo con el original", d: "Con el Word aprobado (.docx, .txt o .md), muestra el texto que falta, sobra o cambió, y las notas que no llegaron al libro." },
  { t: "Lote", d: "Con tres o más PDF, los revisa en tanda y arma un informe conjunto." },
  { t: "Informe en PDF", d: "Veredicto, huella del archivo (SHA-256) para que la imprenta compruebe que recibió el mismo PDF, hallazgos con los pasos según el programa de maquetación, costos y alcance." },
  { t: "Archivos pesados", d: "Hasta 500 MB. Si el archivo es pesado para el equipo, la revisión se adapta (la tinta total se mide con menos detalle y se avisa). La tinta se puede medir después en detalle, por las páginas que se acercan al límite, todo el libro o un rango de páginas." },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section id={id} className="dsec"><h2>{title}</h2>{children}</section>;
}

export function Docs({ onBack }: { onBack: () => void }) {
  const [q, setQ] = useState("");
  // al imprimir, todos los controles se muestran abiertos
  const openAll = () => document.querySelectorAll<HTMLDetailsElement>("details.dcheck").forEach(d => { d.open = true; });
  useEffect(() => { window.addEventListener("beforeprint", openAll); window.scrollTo(0, 0); return () => window.removeEventListener("beforeprint", openAll); }, []);
  const checks = useMemo(() => Object.entries(COPY).map(([id, c]) => ({ id, ...c })), []);
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const shown = q.trim() ? checks.filter(c => norm(c.title + " " + c.impact + " " + c.fix).includes(norm(q.trim()))) : checks;
  return (
    <div className="docs">
      <header className="dtop">
        <a className="brand" href="#" onClick={e => { e.preventDefault(); onBack(); }}><Logo /><span><b>Pliego <i className="beta">beta</i></b><em>Documentación</em></span></a>
        <div className="dact"><button className="btn" onClick={() => { openAll(); setTimeout(() => window.print(), 50); }}>Imprimir o guardar en PDF</button><button className="btn primary" onClick={onBack}>Volver a Pliego</button></div>
      </header>
      <main className="dmain">
        <div className="dhero">
          <h1>Qué revisa Pliego</h1>
          <p className="dver">Versión {VERSION} · {VERSION_DATE} · {checks.length} controles</p>
          <p>Pliego es una revisión automática previa del PDF de imprenta de un libro, hecha en el navegador: el archivo no sale de la computadora. Revisa lo técnico (lo que mira una imprenta) y lo editorial (lo que mira un corrector o un editor de mesa), y dice qué pasa en imprenta con cada problema y cómo se arregla. Es una herramienta de la Academia Proyecto451.</p>
        </div>
        <nav className="dtoc" aria-label="Contenido">
          {[["uso", "Cómo funciona"], ["gravedad", "Gravedades"], ["controles", "Controles"], ["valores", "Valores de referencia"], ["funciones", "Funciones"], ["alcance", "Qué no hace"], ["privacidad", "Privacidad"], ["versiones", "Historial de versiones"], ["licencia", "Licencia"]].map(([id, t]) => <a key={id} href={`#documentacion/${id}`} onClick={e => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); }}>{t}</a>)}
        </nav>

        <Section id="uso" title="Cómo funciona">
          <ol className="dsteps">
            <li><b>Elegí cómo se imprime.</b> Dónde (offset, digital, bajo demanda), papel, tintas, encuadernación y país. Si tenés los valores de tu imprenta, cargalos y guardalos.</li>
            <li><b>Soltá el PDF.</b> El interior, la cubierta o los dos. Pliego mira el archivo por arriba y avisa si algo del perfil no coincide.</li>
            <li><b>Leé el veredicto.</b> Listo para imprenta, para revisar o no listo, con las primeras acciones a resolver.</li>
            <li><b>Recorré los hallazgos.</b> Cada uno se marca en la página, explica qué pasa en imprenta y cómo se arregla en tu programa. Los que estén bien a propósito se marcan como revisados.</li>
            <li><b>Descargá el informe.</b> Para el equipo o para la imprenta, con la huella del archivo.</li>
          </ol>
        </Section>

        <Section id="gravedad" title="Gravedades">
          <ul className="dsev">{SEVS.map(s => <li key={s.k}><span className={"dot " + s.k} /><b>{s.t}.</b> {s.d}</li>)}</ul>
          <p className="dnote">La misma situación puede ser bloqueante o para revisar según el perfil: por ejemplo, el color en un interior a una tinta es bloqueante; en un libro a cuatro colores, no se revisa.</p>
        </Section>

        <Section id="controles" title={`Controles (${checks.length})`}>
          <input className="dsearch" type="search" placeholder="Buscar un control: sangrado, tinta, viudas, ISBN…" value={q} onChange={e => setQ(e.target.value)} />
          {ORDER.map(g => {
            const list = shown.filter(c => c.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="dgroup">
                <h3>{GROUPS[g]} <span>{list.length}</span></h3>
                {!q && GROUP_INTRO[g] && <p className="dintro">{GROUP_INTRO[g]}</p>}
                {list.map(c => (
                  <details key={c.id} className="dcheck" open={!!q}>
                    <summary>{c.title}</summary>
                    <p><b>Qué pasa en imprenta.</b> {c.impact}</p>
                    <p><b>Cómo se arregla.</b> {c.fix}</p>
                  </details>
                ))}
              </div>
            );
          })}
          {!shown.length && <p className="dnote">Ningún control coincide con «{q}».</p>}
        </Section>

        <Section id="valores" title="Valores de referencia">
          <p>Son valores habituales del sector. Si la imprenta te pasa los suyos, cargalos en «Valores de la imprenta»: mandan los de ella.</p>
          <h3>Según dónde se imprime</h3>
          <div className="dtable"><table>
            <thead><tr><th>Sistema</th><th>Tinta máx.</th><th>Sangrado</th><th>Resolución</th><th>Bloqueante bajo</th><th>Arte lineal</th><th>Filete mín.</th><th>Pliego</th></tr></thead>
            <tbody>{SYSTEMS.map(s => <tr key={s.id}><td>{s.name}</td><td>{s.tac} %</td><td>{String(s.bleedMm).replace(".", ",")} mm</td><td>{s.minPpi} ppi</td><td>{s.hardPpi} ppi</td><td>{s.lineArtPpi} ppi</td><td>{String(s.minLinePt).replace(".", ",")} pt</td><td>{s.signature > 2 ? `${s.signature} págs.` : "por hoja"}</td></tr>)}</tbody>
          </table></div>
          <h3>Según el papel (offset)</h3>
          <div className="dtable"><table>
            <thead><tr><th>Papel</th><th>Tinta máx.</th><th>Espesor por hoja</th><th>Perfil de referencia</th></tr></thead>
            <tbody>{PAPERS.map(p => <tr key={p.id}><td>{p.name}</td><td>{p.tac} %</td><td>{String(p.mmPerLeaf).replace(".", ",")} mm</td><td>{p.icc}</td></tr>)}</tbody>
          </table></div>
          <h3>Según el tipo de libro</h3>
          <div className="dtable"><table>
            <thead><tr><th>Tipo</th><th>Zona segura</th><th>Texto al lomo</th><th>Qué se cuida</th></tr></thead>
            <tbody>{CONTENTS.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.safetyMm} mm</td><td>{c.gutterMm} mm</td><td>{c.hint}</td></tr>)}</tbody>
          </table></div>
          <h3>Según la encuadernación</h3>
          <div className="dtable"><table>
            <thead><tr><th>Encuadernación</th><th>Margen mínimo al lomo</th></tr></thead>
            <tbody>{BINDINGS.map(b => <tr key={b.id}><td>{b.name}</td><td>{b.gutterMm} mm</td></tr>)}</tbody>
          </table></div>
          <h3>Ortografía</h3>
          <p>Diccionarios libres de LibreOffice/Hunspell: {DICTS.map(d => d.name).join(", ")}. El idioma se reconoce solo, también en libros con partes en otra lengua.</p>
        </Section>

        <Section id="funciones" title="Funciones">
          <dl className="dfeat">{FEATURES.map(f => <div key={f.t}><dt>{f.t}</dt><dd>{f.d}</dd></div>)}</dl>
        </Section>

        <Section id="alcance" title="Qué no hace">
          <dl className="dfeat">{SCOPE.map(s => <div key={s.t}><dt>{s.t}</dt><dd>{s.d}</dd></div>)}</dl>
          <p className="dnote">Tampoco revisa PDF escaneados (sin texto real), no corrige el archivo (solo diagnostica) y no evalúa el contenido del libro.</p>
        </Section>

        <Section id="privacidad" title="Privacidad">
          <p>El análisis corre entero en el navegador, con el motor MuPDF compilado a WebAssembly. Los PDF y los Word no se suben a ningún servidor: se puede cortar internet después de abrir Pliego y sigue funcionando. Abajo de cada revisión, un contador muestra cuántas solicitudes de red hizo la página desde que se abrió el archivo.</p>
          <p>Lo único que puede salir son estadísticas anónimas de uso (qué controles fallan, franjas de páginas y de peso, tipo de impresión), que se pueden ver tal cual y apagar desde «Estadísticas anónimas de uso». Nunca se envía:</p>
          <ul className="dlist">{NEVER_SENT.map(t => <li key={t}>{t}</li>)}</ul>
          <p>Durante la beta, «¿Algo está mal? Contanos» permite enviar un comentario: se guarda lo que escribís, el correo si lo dejás y, si lo aceptás, el mismo resumen anónimo de la revisión. Los datos se guardan en la base del proyecto, que solo acepta envíos: nadie puede leerlos desde la página.</p>
        </Section>

        <Section id="versiones" title="Historial de versiones">
          {CHANGELOG.map(r => (
            <div key={r.version} className="drel">
              <h3>Versión {r.version} <span>{r.date}{r.status ? ` · ${r.status}` : ""}</span></h3>
              <ul className="dlist">{r.notes.map(n => <li key={n}>{n}</li>)}</ul>
            </div>
          ))}
        </Section>

        <Section id="licencia" title="Licencia">
          <p>Pliego es software libre bajo la licencia GNU Affero General Public License, versión 3 o posterior (AGPL-3.0-or-later). Copyright © 2026 Daniel Benchimol (Proyecto451).{SOURCE_URL && <> Código fuente: <a href={SOURCE_URL} target="_blank" rel="noreferrer">{SOURCE_URL.replace("https://", "")}</a>.</>}</p>
          <p>Usa MuPDF (AGPL), Hunspell (hunspell-asm, MIT), pdf-lib (MIT), fflate (MIT), ZXing (Apache 2.0), las tipografías Geist (OFL), el perfil FOGRA39L y diccionarios de LibreOffice con sus propias licencias.</p>
        </Section>
      </main>
    </div>
  );
}
