// Ortotipografía, composición y aparato: reglas sobre el texto ya compuesto de cada página.
// Todo es heurístico y se informa como «revisar» o «para saber»: el editor decide.
import type { PageText, Line, R } from "./text";
import { romanValue } from "./text";
import type { Sev } from "./profiles";

type Add = (check: string, sev: Sev, detail: string, page?: number, rect?: R | null, label?: string, item?: string) => any;
export interface TypoOpts { bodySize: number; folioOffset: number | null; chapters: { page: number }[]; spanish: boolean }

const snip = (t: string, i: number, n = 34) => { const a = Math.max(0, i - n / 2), s = t.slice(a, a + n).trim(); return (a > 0 ? "…" : "") + s + (a + n < t.length ? "…" : ""); };
const pl = (n: number, s: string, p = s + "s") => `${n} ${n === 1 ? s : p}`;
const pagesTxt = (ps: number[]) => { const u = [...new Set(ps)].sort((a, b) => a - b).map(p => p + 1); return (u.length === 1 ? "pág. " : "págs. ") + (u.length > 10 ? u.slice(0, 10).join(", ") + "…" : u.join(", ")); };

export function typoChecks(pages: PageText[], o: TypoOpts, add: Add): string[] {
  const ran: string[] = [];
  const body = o.bodySize;
  const band = (p: PageText, l: Line) => { const h = p.trim[3] - p.trim[1], cy = (l.r[1] + l.r[3]) / 2; return (cy < p.trim[1] + h * 0.08 || cy > p.trim[3] - h * 0.08) && l.text.length < 90; };
  const isBody = (l: Line) => Math.abs(l.size - body) <= Math.max(0.6, body * 0.07);
  const small = (p: PageText, l: Line) => l.size < body * 0.93 && (l.r[1] + l.r[3]) / 2 > p.trim[1] + (p.trim[3] - p.trim[1]) * 0.45;

  // párrafos aproximados: bloques de texto de la página, con los cortes de palabra unidos
  type Para = { page: number; text: string; lines: Line[] };
  const paras: Para[] = [];
  for (const p of pages) {
    const byBlock = new Map<number, Line[]>();
    for (const l of p.lines) { const b = byBlock.get(l.block); if (b) b.push(l); else byBlock.set(l.block, [l]); }
    for (const ls of byBlock.values()) {
      // las cabeceras y los folios quedan afuera, salvo que la línea sea parte de un bloque del texto
      // (un título de dos líneas que empieza arriba de todo)
      if (ls.every(l => band(p, l))) continue;
      let text = "";
      for (const l of ls) text = text && /\p{L}-$/u.test(text) && /^\p{Ll}/u.test(l.text) ? text.slice(0, -1) + l.text : text ? text + " " + l.text : l.text;
      paras.push({ page: p.index, text, lines: ls });
    }
  }
  const rectAt = (pa: Para, idx: number): R => {
    // línea aproximada donde cae el carácter idx del párrafo
    let acc = 0;
    for (const l of pa.lines) { acc += l.text.length + 1; if (idx < acc) return l.r; }
    return pa.lines[pa.lines.length - 1].r;
  };

  // ---------- ortotipografía ----------
  const hits = new Map<string, { page: number; r: R; item: string }[]>();
  const hit = (k: string, pa: Para, i: number, what: string) => { const l = hits.get(k) ?? []; if (l.length < 80) l.push({ page: pa.page, r: rectAt(pa, i), item: `Pág. ${pa.page + 1}: ${what} «${snip(pa.text, i)}»` }); hits.set(k, l); };
  let latin = 0, english = 0, straight = 0;
  let openQ = false, openE = false, prevPage = -1;
  // contexto de fórmula o de unidades (m . c . ∆t, J/kg . K, te - t2): ahí el punto y el guion son operadores
  const mathy = (t: string, i: number) => /[=∆Δ°×·/+]|\d/.test(t.slice(Math.max(0, i - 12), i + 12));
  for (const pa of paras) {
    const t = pa.text;
    latin += (t.match(/[«»]/g) ?? []).length; english += (t.match(/[“”]/g) ?? []).length;
    for (const m of t.matchAll(/"/g)) { straight++; hit("straightQuotes", pa, m.index!, "comilla recta"); }
    for (const m of t.matchAll(/(?<=\p{L})'(?=\p{L})|(?<=\s)'(?=\p{L})/gu)) hit("straightQuotes", pa, m.index!, "apóstrofo o comilla simple recta");
    // diálogo: guion o semirraya al comienzo de párrafo, o raya separada del parlamento
    if (/^[-–]\s?\p{L}/u.test(t)) hit("dialogDash", pa, 0, "diálogo con guion en lugar de raya:");
    if (/^—\s+\p{L}/u.test(t)) hit("dialogDash", pa, 0, "espacio después de la raya de diálogo:");
    for (const m of t.matchAll(/\p{L} - \p{L}/gu)) if (!mathy(t, m.index!)) hit("dialogDash", pa, m.index! + 1, "guion entre espacios (¿raya o semirraya?):");
    for (const m of t.matchAll(/\p{L}[,.;:!?»)]?\s—\s\p{L}/gu)) if (!/^—/.test(t.slice(m.index!))) hit("dialogDash", pa, m.index! + 2, "raya de inciso con espacios a los dos lados:");
    // espacios mal puestos
    if (!/(\s\.){3}/.test(t)) for (const m of t.matchAll(/\p{L}\s+[,.;:!?](?!\.\.)/gu)) if (!mathy(t, m.index!)) hit("spacing", pa, m.index! + 1, "espacio antes del signo:");
    for (const m of t.matchAll(/[¿¡(«]\s+\p{L}|\p{L}\s+[)»]/gu)) hit("spacing", pa, m.index! + 1, "espacio de más junto al signo:");
    for (const m of t.matchAll(/\p{Ll}[,;:]\p{L}|\p{Ll}[.?!]\p{Lu}\p{Ll}/gu)) if (!/^(?:www|http)/.test(t.slice(Math.max(0, m.index! - 8)))) hit("spacing", pa, m.index! + 1, "falta espacio después del signo:");
    // puntuación doble
    for (const m of t.matchAll(/(?<![.…])\.\.(?!\.)|…\.|\.\.\.\./g)) hit("punctuation", pa, m.index!, "puntos de más:");
    for (const m of t.matchAll(/,,|;;|::/g)) hit("punctuation", pa, m.index!, "signo duplicado:");
    // signos de apertura en español
    if (o.spanish) {
      if (pa.page !== prevPage) { openQ = openE = false; prevPage = pa.page; }
      // también vale un bloque de la misma página que termina justo arriba con la pregunta abierta
      // (las sangrías francesas y los recuadros parten un mismo párrafo en dos bloques)
      const f0 = pa.lines[0].r, h0 = Math.max(4, f0[3] - f0[1]);
      const above = (sign: string, close: string) => paras.some(o => o !== pa && o.page === pa.page && o.text.lastIndexOf(sign) > o.text.lastIndexOf(close) && (() => {
        const lr = o.lines[o.lines.length - 1].r;
        return lr[1] < f0[1] - h0 * 0.3 && lr[3] <= f0[1] + h0 * 0.6 && f0[1] - lr[3] < h0 * 1.6 && lr[0] < f0[2] && f0[0] < lr[2];
      })());
      if (!openQ) openQ = above("¿", "?");
      if (!openE) openE = above("¡", "!");
      const segs = t.split(/(?<=[.!?…»])\s+(?=[¿¡«—\p{Lu}])/u);
      segs.forEach((s, k) => {
        const q = s.search(/\?(?=\s|$|[»”)"’.,;:])/), e = s.search(/!(?=\s|$|[»”)"’.,;:])/);
        // una pregunta que empezó en el bloque anterior (sangría francesa, columnas) ya tiene su ¿
        const carriedQ = k === 0 && openQ, carriedE = k === 0 && openE;
        if (q > 0 && !s.includes("¿") && !carriedQ && !/https?:|www\.|\.(com|org|ar|es|net)\b/.test(s)) hit("openingMarks", pa, t.indexOf(s) + q, "falta el signo de apertura ¿:");
        if (e > 0 && !s.includes("¡") && !carriedE) hit("openingMarks", pa, t.indexOf(s) + e, "falta el signo de apertura ¡:");
      });
      openQ = t.lastIndexOf("¿") > t.lastIndexOf("?"); openE = t.lastIndexOf("¡") > t.lastIndexOf("!");
    }
    // comillas y paréntesis sin cerrar en el mismo párrafo (salvo comillas de seguir)
    const op = (t.match(/«/g) ?? []).length, cl = (t.match(/»/g) ?? []).length;
    if (op !== cl && !/^»/.test(t) && t.length < 1600 && Math.abs(op - cl) >= 1) hit("unbalanced", pa, op > cl ? t.lastIndexOf("«") : t.lastIndexOf("»"), op > cl ? "comilla « sin cerrar:" : "comilla » sin abrir:");
    const po = (t.match(/\(/g) ?? []).length, pc = (t.match(/\)/g) ?? []).length;
    if (po !== pc && t.length < 1600 && !/\b\d+\)|\b[a-z]\)/.test(t)) hit("unbalanced", pa, po > pc ? t.lastIndexOf("(") : t.lastIndexOf(")"), po > pc ? "paréntesis sin cerrar:" : "paréntesis sin abrir:");
    // marcas de trabajo que quedaron en el texto
    for (const m of t.matchAll(/lorem ipsum|\[\s*(?:pág|p)\.?\s*\]|\bp(?:á|a)g(?:ina)?s?\.?\s*(?:00+|xx+|\?\?|#+)(?![\p{L}\d])|[¡!]?Error[!.]?\s+(?:Marcador no definido|No se encuentra el origen de la referencia|Bookmark not defined|Reference source not found)/giu)) hit("placeholder", pa, m.index!, "marca de trabajo:");
    for (const m of t.matchAll(/[\[(]\s*(?:REVISAR|PENDIENTE|OJO|FALTA|TK|NOTA DEL EDITOR|N\. ?del E\.)[^\])]{0,40}[\])]|\b(?:REVISAR|PENDIENTE|OJO):|\bTK\b/gu)) hit("placeholder", pa, m.index!, "marca de trabajo:");
  }
  if (latin > 5 && english > 5) {
    const main = latin >= english ? "angulares (« »)" : "inglesas (“ ”)";
    const other = latin >= english ? "“" : "«";
    const list: { page: number; r: R; item: string }[] = [];
    for (const pa of paras) { const i = pa.text.indexOf(other); if (i >= 0 && list.length < 40) list.push({ page: pa.page, r: rectAt(pa, i), item: `Pág. ${pa.page + 1}: «${snip(pa.text, i)}»` }); }
    // las inglesas dentro de angulares son la norma (comillas de segundo nivel): solo avisar si no están anidadas
    const nested = paras.filter(pa => /«[^»]*“[^”]*”[^»]*»/.test(pa.text)).length;
    if (list.length && (latin < english || nested < list.length / 2)) {
      add("quotesMixed", "warn", `El libro usa sobre todo comillas ${main}, pero en ${pl(list.length, "párrafo")} aparecen las otras como primer nivel.`);
      for (const h of list) add("quotesMixed", "warn", "", h.page, h.r, "Comillas de otro tipo", h.item);
    }
  }
  const DET: Record<string, (n: number, ps: number[]) => [Sev, string]> = {
    straightQuotes: (n, ps) => ["warn", `${pl(n, "comilla recta", "comillas rectas")} de máquina de escribir (${pagesTxt(ps)}).`],
    dialogDash: (n, ps) => ["warn", `${pl(n, "diálogo o inciso", "diálogos o incisos")} con el guion o el espacio mal puesto (${pagesTxt(ps)}).`],
    spacing: (n, ps) => ["warn", `${pl(n, "espacio mal puesto", "espacios mal puestos")} junto a signos de puntuación (${pagesTxt(ps)}).`],
    punctuation: (n, ps) => ["warn", `${pl(n, "signo duplicado", "signos duplicados")} o puntos de más (${pagesTxt(ps)}).`],
    openingMarks: (n, ps) => ["warn", `${pl(n, "pregunta o exclamación", "preguntas o exclamaciones")} sin el signo de apertura (${pagesTxt(ps)}).`],
    unbalanced: (n, ps) => ["info", `${pl(n, "párrafo")} con comillas o paréntesis que no cierran (${pagesTxt(ps)}).`],
    placeholder: (n, ps) => ["error", `${pl(n, "marca")} de trabajo que ${n === 1 ? "quedó" : "quedaron"} en el texto: relleno, referencias sin resolver o notas para el editor (${pagesTxt(ps)}).`],
  };
  for (const [k, f] of Object.entries(DET)) {
    ran.push(k);
    const l = hits.get(k); if (!l?.length) continue;
    const [sev, det] = f(l.length, l.map(h => h.page));
    add(k, sev, det);
    for (const h of l) add(k, sev, "", h.page, h.r, det.split(" (")[0], h.item);
  }
  ran.push("quotesMixed");

  // ---------- composición ----------
  // líneas abiertas o apretadas: espacio entre palabras en líneas justificadas del cuerpo
  const loose: { page: number; r: R; item: string }[] = [], tight: { page: number; r: R; item: string }[] = [];
  const cand: { page: number; l: Line; mean: number; n: number }[] = [];
  for (const p of pages) {
    const bodyLines = p.lines.filter(l => !band(p, l) && isBody(l) && l.words.length >= 5);
    if (bodyLines.length < 6) continue;
    const rights = bodyLines.map(l => l.r[2]).sort((a, b) => a - b), right = rights[Math.floor(rights.length * 0.8)];
    for (const l of bodyLines) {
      if (Math.abs(l.r[2] - right) > 1.2) continue; // última línea de párrafo o texto en bandera
      const gaps: number[] = [];
      for (let k = 1; k < l.words.length; k++) gaps.push(l.words[k].r[0] - l.words[k - 1].r[2]);
      cand.push({ page: p.index, l, mean: gaps.reduce((a, b) => a + b, 0) / gaps.length / l.size, n: gaps.length });
    }
  }
  if (cand.length >= 20) {
    // el espacio normal depende de la letra y del ajuste: se compara con la mediana del propio libro
    const med = [...cand].sort((a, b) => a.mean - b.mean)[Math.floor(cand.length / 2)].mean;
    for (const c of cand) {
      if (c.mean > Math.max(0.5, med * 1.75) && loose.length < 80) loose.push({ page: c.page, r: c.l.r, item: `Pág. ${c.page + 1}: «${c.l.text.slice(0, 46)}…» (espacios de ${Math.round(c.mean * 100)} % del cuerpo; lo normal en el libro es ${Math.round(med * 100)} %)` });
      else if (c.mean < Math.min(0.14, med * 0.45) && c.n >= 6 && tight.length < 80) tight.push({ page: c.page, r: c.l.r, item: `Pág. ${c.page + 1}: «${c.l.text.slice(0, 46)}…»` });
    }
  }
  ran.push("looseLines", "tightLines");
  if (loose.length >= 2) { const d = `${pl(loose.length, "línea")} justificada${loose.length !== 1 ? "s" : ""} con espacios muy abiertos entre palabras (${pagesTxt(loose.map(x => x.page))}).`; add("looseLines", "info", d); for (const x of loose) add("looseLines", "info", "", x.page, x.r, "Línea muy abierta", x.item); }
  if (tight.length >= 2) { const d = `${pl(tight.length, "línea")} con las palabras casi pegadas (${pagesTxt(tight.map(x => x.page))}).`; add("tightLines", "info", d); for (const x of tight) add("tightLines", "info", "", x.page, x.r, "Línea apretada", x.item); }

  // mancha: páginas de texto corrido más cortas o más largas que las demás, y pares enfrentados desparejos
  const chapterStart = new Set(o.chapters.map(c => c.page));
  const info = pages.map(p => {
    const bl = p.lines.filter(l => !band(p, l) && isBody(l));
    const notesTop = p.lines.filter(l => !band(p, l) && small(p, l)).reduce((m, l) => Math.min(m, l.r[1]), Infinity);
    const main = bl.filter(l => l.r[3] < notesTop);
    const all = p.lines.filter(l => !band(p, l) && (isBody(l) || small(p, l)));
    return { p, n: main.length, bottom: all.length && main.length ? Math.max(...all.map(l => l.r[3])) : null, top: main.length ? Math.min(...main.map(l => l.r[1])) : null, hasImage: false };
  });
  const lead = (() => {
    const d = new Map<number, number>();
    for (const p of pages) { const bl = p.lines.filter(l => !band(p, l) && isBody(l)).map(l => l.r[3]).sort((a, b) => a - b); for (let k = 1; k < bl.length; k++) { const v = Math.round((bl[k] - bl[k - 1]) * 2) / 2; if (v > body * 0.9 && v < body * 2) d.set(v, (d.get(v) ?? 0) + 1); } }
    return [...d.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? body * 1.3;
  })();
  const endsSection = (i: number) => { let j = i + 1; while (j < pages.length && info[j].n === 0) j++; return j >= pages.length || chapterStart.has(j) || j > i + 1; };
  const full = info.filter((x, i) => x.n >= 12 && !chapterStart.has(i) && !endsSection(i) && x.bottom !== null);
  ran.push("pageDepth");
  if (full.length >= 6) {
    const bottoms = full.map(x => x.bottom!).sort((a, b) => a - b), ref = bottoms[Math.floor(bottoms.length / 2)];
    const odd: { page: number; r: R; item: string }[] = [];
    for (const x of full) {
      const d = (x.bottom! - ref) / lead;
      if (Math.abs(d) >= 0.75) odd.push({ page: x.p.index, r: [x.p.trim[0] + 10, Math.min(x.bottom!, ref), x.p.trim[2] - 10, Math.max(x.bottom!, ref)], item: `Pág. ${x.p.index + 1}: ${d < 0 ? `${Math.round(-d)} línea${Math.round(-d) > 1 ? "s" : ""} más corta` : `${Math.round(d)} línea${Math.round(d) > 1 ? "s" : ""} más larga`} que las demás` });
    }
    // pares enfrentados (par a la izquierda, impar a la derecha)
    for (let i = 1; i + 1 < pages.length; i += 2) {
      const a = info[i], b = info[i + 1];
      if (!a.bottom || !b.bottom || a.n < 12 || b.n < 12 || chapterStart.has(i) || chapterStart.has(i + 1) || endsSection(i) || endsSection(i + 1)) continue;
      if (Math.abs(a.bottom - b.bottom) >= lead * 0.5 && !odd.some(x => x.page === i || x.page === i + 1)) odd.push({ page: i, r: [a.p.trim[0] + 10, Math.min(a.bottom, b.bottom), a.p.trim[2] - 10, Math.max(a.bottom, b.bottom)], item: `Págs. ${i + 1} y ${i + 2}: las páginas enfrentadas terminan a distinta altura` });
    }
    if (odd.length) { add("pageDepth", "warn", `${pl(odd.length, "página")} de texto corrido no termina${odd.length !== 1 ? "n" : ""} a la misma altura que las demás (${pagesTxt(odd.map(x => x.page))}).`); for (const x of odd.slice(0, 60)) add("pageDepth", "warn", "", x.page, x.r, "Altura de página distinta", x.item); }
  }

  // ---------- aparato ----------
  // notas al pie: números al pie en cuerpo menor, contra llamadas pegadas a una palabra en el texto
  const notesByPage = new Map<number, { n: number; r: R }[]>(), callsByPage = new Map<number, { n: number; r: R }[]>();
  for (const p of pages) {
    for (const l of p.lines) {
      if (band(p, l)) continue;
      const low = l.r[1] > p.trim[1] + (p.trim[3] - p.trim[1]) * 0.55;
      if (small(p, l)) { const m = l.text.match(/^(\d{1,3})[.\s)]/); if (m && low) (notesByPage.get(p.index) ?? notesByPage.set(p.index, []).get(p.index)!).push({ n: +m[1], r: l.r }); continue; }
      for (const w of l.words) { const m = w.t.match(/^\p{L}{2,}[.,;:!?»”)]?(\d{1,3})[.,;:]?$/u); if (m) (callsByPage.get(p.index) ?? callsByPage.set(p.index, []).get(p.index)!).push({ n: +m[1], r: w.r }); }
    }
  }
  const allNotes = [...notesByPage.entries()].flatMap(([pg, l]) => l.map(x => ({ ...x, page: pg }))).sort((a, b) => a.page - b.page || a.r[1] - b.r[1]);
  // ¿hay notas al pie de verdad? Si la mayoría de esos números no tiene su llamada en la página,
  // son otra cosa (actividades numeradas, listas, epígrafes): no se revisa como aparato.
  const matched = allNotes.filter(nt => (callsByPage.get(nt.page) ?? []).some(c => c.n === nt.n)).length;
  const hasNotes = allNotes.length >= 3 && matched >= Math.max(2, allNotes.length * 0.5);
  if (hasNotes) ran.push("noteSeq", "noteCallout");
  if (hasNotes) {
    const seq: { page: number; r: R; item: string }[] = [];
    for (let k = 1; k < allNotes.length; k++) {
      const a = allNotes[k - 1], b = allNotes[k];
      if (b.n === 1 || b.n === a.n + 1) continue; // la numeración puede volver a 1 en cada capítulo
      seq.push({ page: b.page, r: b.r, item: b.n === a.n ? `Pág. ${b.page + 1}: la nota ${b.n} está repetida` : b.n > a.n ? `Pág. ${b.page + 1}: después de la nota ${a.n} sigue la ${b.n}${b.n - a.n === 2 ? ` (falta la ${a.n + 1})` : ""}` : `Pág. ${b.page + 1}: la nota ${b.n} viene después de la ${a.n}` });
    }
    if (seq.length) { add("noteSeq", "warn", `${pl(seq.length, "salto")} en la numeración de las notas:`); for (const x of seq) add("noteSeq", "warn", "", x.page, x.r, "Numeración de notas", x.item); }
    const mis: { page: number; r: R; item: string }[] = [];
    for (const [pg, notes] of notesByPage) {
      const calls = new Set((callsByPage.get(pg) ?? []).map(c => c.n));
      for (const nt of notes) if (!calls.has(nt.n)) mis.push({ page: pg, r: nt.r, item: `Pág. ${pg + 1}: la nota ${nt.n} no tiene llamada en el texto de la página` });
    }
    for (const [pg, calls] of callsByPage) {
      const ns = new Set((notesByPage.get(pg) ?? []).map(c => c.n));
      if (!notesByPage.has(pg) && !notesByPage.has(pg + 1)) continue; // sin notas al pie cerca: puede ser otro número
      for (const c of calls) if (!ns.has(c.n) && !(notesByPage.get(pg + 1) ?? []).some(x => x.n === c.n)) mis.push({ page: pg, r: c.r, item: `Pág. ${pg + 1}: la llamada ${c.n} no tiene su nota al pie` });
    }
    if (mis.length) { add("noteCallout", "warn", `${pl(mis.length, "caso")} de notas y llamadas que no se corresponden en la misma página:`); for (const x of mis.slice(0, 60)) add("noteCallout", "warn", "", x.page, x.r, "Nota sin llamada o llamada sin nota", x.item); }
  }

  // referencias cruzadas a páginas que no existen
  ran.push("crossRef");
  const lastFolio = o.folioOffset !== null ? pages.length - o.folioOffset : pages.length;
  const refs: { page: number; r: R; item: string }[] = [];
  for (const pa of paras) {
    for (const m of pa.text.matchAll(/\b(?:v[ée]ase|ver|cf\.|cfr\.|en)\s+(?:la\s+)?(?:p[áa]g(?:ina)?s?\.?|p\.|pp\.)\s*(\d{1,4})(?:\s*[-–y]\s*(\d{1,4}))?/giu)) {
      const n1 = +m[1], n2 = m[2] ? +m[2] : n1;
      if (n1 > 0 && Math.max(n1, n2) > lastFolio) refs.push({ page: pa.page, r: rectAt(pa, m.index!), item: `Pág. ${pa.page + 1}: «${m[0]}» remite a una página que el libro no tiene (termina en la ${lastFolio})` });
    }
    for (const m of pa.text.matchAll(/\b(?:v[ée]ase|ver)\s+(?:el\s+)?cap[íi]tulo\s+(\d{1,2}|[ivxlc]{1,6})\b/giu)) {
      const v = /^\d+$/.test(m[1]) ? +m[1] : romanValue(m[1]) ?? 0;
      if (o.chapters.length >= 2 && v > o.chapters.length + 2) refs.push({ page: pa.page, r: rectAt(pa, m.index!), item: `Pág. ${pa.page + 1}: «${m[0]}», pero el libro tiene ${o.chapters.length} capítulos` });
    }
  }
  if (refs.length) { add("crossRef", "error", `${pl(refs.length, "referencia")} cruzada${refs.length !== 1 ? "s" : ""} a páginas o capítulos que no existen:`); for (const x of refs) add("crossRef", "error", "", x.page, x.r, "Referencia cruzada", x.item); }

  // figuras, tablas y láminas: numeración de los epígrafes y referencias a números que no existen
  ran.push("figureSeq");
  const KINDS = /^(Figura|Fig\.|Imagen|Ilustraci[óo]n|L[áa]mina|Tabla|Cuadro|Gr[áa]fico|Mapa|Foto(?:graf[íi]a)?)\s+(\d{1,3}(?:[.-]\d{1,3})?|[IVXLC]{1,6})\b/;
  const caps = new Map<string, { id: string; page: number; r: R }[]>();
  for (const p of pages) for (const l of p.lines) {
    if (band(p, l)) continue;
    const m = l.text.match(KINDS); if (!m) continue;
    const kind = m[1].replace(/^Fig\.$/, "Figura").replace(/^Foto.*/, "Fotografía").replace(/^Ilustraci.*/, "Ilustración").replace(/^L.mina/, "Lámina").replace(/^Gr.fico/, "Gráfico");
    (caps.get(kind) ?? caps.set(kind, []).get(kind)!).push({ id: m[2], page: p.index, r: l.r });
  }
  const figs: { page: number; r: R; item: string }[] = [];
  for (const [kind, list] of caps) {
    if (list.length < 2) continue;
    const seen = new Map<string, number>();
    const val = (id: string) => /^\d+$/.test(id) ? +id : romanValue(id) ?? null;
    const flat = list.every(x => val(x.id) !== null);
    let prev: number | null = null;
    for (const x of list) {
      if (seen.has(x.id) && Math.abs(seen.get(x.id)! - x.page) > 1) figs.push({ page: x.page, r: x.r, item: `Pág. ${x.page + 1}: ${kind.toLowerCase()} ${x.id} repetida (también en la pág. ${seen.get(x.id)! + 1})` });
      seen.set(x.id, x.page);
      const v = flat ? val(x.id) : null;
      if (v !== null && prev !== null && v !== prev && v !== prev + 1 && v !== 1) figs.push({ page: x.page, r: x.r, item: `Pág. ${x.page + 1}: después de ${kind.toLowerCase()} ${prev} sigue la ${x.id}` });
      if (v !== null) prev = v;
    }
    // referencias en el texto a números que no tienen epígrafe
    const ids = new Set(list.map(x => x.id.toLowerCase()));
    const re = new RegExp(`\\b(?:${kind === "Figura" ? "figura|fig\\." : kind.toLowerCase()})\\s+(\\d{1,3}(?:[.-]\\d{1,3})?|[ivxlc]{1,6})\\b`, "giu");
    for (const pa of paras) for (const m of pa.text.matchAll(re)) {
      if (KINDS.test(pa.text.slice(m.index!)) && m.index === 0) continue;
      if (!ids.has(m[1].toLowerCase())) figs.push({ page: pa.page, r: rectAt(pa, m.index!), item: `Pág. ${pa.page + 1}: el texto remite a «${m[0]}», pero no hay un epígrafe con ese número` });
    }
  }
  if (figs.length) { add("figureSeq", "warn", `${pl(figs.length, "problema")} de numeración en figuras, tablas o láminas:`); for (const x of figs.slice(0, 60)) add("figureSeq", "warn", "", x.page, x.r, "Numeración de figuras", x.item); }
  return ran;
}
