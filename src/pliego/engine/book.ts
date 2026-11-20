// Controles del libro como objeto editorial: folios, capítulos, cabeceras, índice,
// viudas y huérfanas, cortes de palabra, créditos y ortografía. Todo con reglas, en el navegador.
import { PageText, Line, R, norm, sameTitle, romanValue } from "./text";
import type { Sev } from "./profiles";
import { detect, Family, FAMILY_NAME } from "./lang";

type Add = (check: string, sev: Sev, detail: string, page?: number, rect?: R | null, label?: string, item?: string, key?: string) => any;
export interface Speller { correct: (w: string) => boolean }
export interface BookOptions { country: string; chaptersOdd: boolean | "auto"; spellers: Partial<Record<Family, Speller>>; forceLang?: Family | null; spellRequested: boolean; year: number }
export interface Chapter { page: number; title: string; r: R }
export interface BookResult {
  bodySize: number; chapters: Chapter[]; folioOffset: number | null;
  toc: { title: string; folio: number; page: number | null; ok: boolean; real?: number | null }[];
  credits: { dl: string | null; dlOk: boolean | null; copyrightYears: number[] };
  spelling: { checked: boolean; reason?: string; words: number; unknown: number; langs?: string[] };
  title: string | null;
}

const P = (p: number) => `pág. ${p + 1}`;
const snip = (t: string) => { const s = t.trim(); return s.length > 42 ? s.slice(0, 40).trimEnd() + "…" : s; };

export function bookChecks(pages: PageText[], o: BookOptions, add: Add): BookResult {
  const n = pages.length;
  // ---------- cuerpo de texto: el tamaño más usado, ponderado por caracteres ----------
  const hist = new Map<number, number>();
  for (const p of pages) for (const l of p.lines) { const k = Math.round(l.size * 2) / 2; hist.set(k, (hist.get(k) ?? 0) + l.text.length); }
  const bodySize = [...hist.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10;
  const isBody = (l: Line) => Math.abs(l.size - bodySize) <= Math.max(0.6, bodySize * 0.06);

  // ---------- bandas de cabecera/pie, folios y cabeceras ----------
  type FolioCand = { page: number; value: number; roman: boolean; line: Line; rest: string };
  const cands: FolioCand[] = [];
  const headers = new Map<number, { text: string; line: Line }>();
  const bandLines = new Set<Line>();
  for (const p of pages) {
    const [x0, y0, x1, y1] = p.trim, h = y1 - y0, w = x1 - x0;
    for (const l of p.lines) {
      const cy = (l.r[1] + l.r[3]) / 2, cx = (l.r[0] + l.r[2]) / 2;
      const top = cy < y0 + h * 0.1, bottom = cy > y1 - h * 0.1, side = cx < x0 + w * 0.1 || cx > x1 - w * 0.1;
      if (!(top || bottom || side)) continue;
      if (l.size > bodySize * 1.25 && !side) continue; // un título grande arriba no es cabecera
      bandLines.add(l);
      const t = l.text.trim();
      let m = t.match(/^(\d{1,4})$/) || t.match(/^([ivxlcdm]{1,7})$/i);
      let rest = "";
      if (!m && !side) { m = t.match(/^(\d{1,4})\s{1,}(.{3,})$/) || t.match(/^(.{3,}?)\s{1,}(\d{1,4})$/); if (m) { const numFirst = /^\d/.test(t); rest = numFirst ? m[2] : m[1]; m = [m[0], numFirst ? m[1] : m[2]] as any; } }
      if (m) {
        const raw = m[1]; const rv = /^\d+$/.test(raw) ? null : romanValue(raw);
        if (/^\d+$/.test(raw)) cands.push({ page: p.index, value: parseInt(raw), roman: false, line: l, rest });
        else if (rv) cands.push({ page: p.index, value: rv, roman: true, line: l, rest });
        if (rest && top) headers.set(p.index, { text: rest, line: l });
      } else if (top && t.length >= 3 && l.size <= bodySize * 1.15) headers.set(p.index, { text: t, line: l });
    }
  }
  // desplazamiento folio ↔ página más votado (folios arábigos)
  const votes = new Map<number, number>();
  for (const c of cands) if (!c.roman) votes.set(c.page + 1 - c.value, (votes.get(c.page + 1 - c.value) ?? 0) + 1);
  const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  const folioOffset = best && best[1] >= 3 ? best[0] : null;
  const folioOf = new Map<number, number>();
  if (folioOffset !== null) {
    // por página, el candidato que respeta algún desplazamiento coherente con sus vecinos
    const byPage = new Map<number, FolioCand[]>();
    cands.filter(c => !c.roman).forEach(c => byPage.set(c.page, [...(byPage.get(c.page) ?? []), c]));
    let d = folioOffset;
    const jumps: number[] = [];
    const sorted = [...byPage.keys()].sort((a, b) => a - b);
    for (const pg of sorted) {
      const cs = byPage.get(pg)!;
      const fit = cs.find(c => pg + 1 - c.value === d);
      if (fit) { folioOf.set(pg, fit.value); continue; }
      // ¿cambia el desplazamiento desde acá? solo si la página siguiente con folio lo confirma
      const alt = cs.find(c => { const nd = pg + 1 - c.value; const next = sorted.find(q => q > pg); return next !== undefined && byPage.get(next)!.some(x => next + 1 - x.value === nd); });
      if (alt) { jumps.push(pg); d = pg + 1 - alt.value; folioOf.set(pg, alt.value); }
    }
    if (folioOffset % 2 !== 0) add("folio", "error", "", undefined, undefined, undefined, `Los folios impares caen en páginas pares (a la izquierda): la numeración está corrida una página desde el comienzo`);
    for (const j of jumps) add("folio", "warn", "", j, cands.find(c => c.page === j)?.line.r, `Salto de numeración`, `Salto en la numeración en ${P(j)}: el folio ${folioOf.get(j)} no sigue al anterior`);
    // folios ausentes en páginas de texto corrido
    const missing = pages.filter(p => !folioOf.has(p.index) && p.lines.filter(isBody).length > 12 && p.index > 6 && !byPage.has(p.index)).map(p => p.index);
    if (missing.length && missing.length < n * 0.5) {
      const f = add("folio", "info", "");
      f.items.push(`Páginas de texto sin folio: ${missing.slice(0, 20).map(x => x + 1).join(", ")}${missing.length > 20 ? "…" : ""}`);
      missing.forEach(x => f.pages.push(x));
    }
  }
  // romanos de los preliminares
  const romans = cands.filter(c => c.roman && c.page < 40);
  if (romans.length >= 2) {
    const off = new Map<number, number>(); romans.forEach(c => off.set(c.page + 1 - c.value, (off.get(c.page + 1 - c.value) ?? 0) + 1));
    const main = [...off.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const bad = romans.filter(c => c.page + 1 - c.value !== main);
    for (const b of bad) add("folio", "warn", "", b.page, b.line.r, "Romano fuera de secuencia", `Folio romano fuera de secuencia en ${P(b.page)}`);
  }

  // ---------- capítulos: líneas grandes en la parte alta de la página ----------
  const chapters: Chapter[] = [];
  const big = Math.max(bodySize * 1.35, bodySize + 3);
  for (const p of pages) {
    const h = p.trim[3] - p.trim[1];
    const large = p.lines.filter(l => l.size >= big && !bandLines.has(l) && l.r[1] < p.trim[1] + h * 0.6);
    if (!large.length) continue;
    const first = large[0];
    const group = large.filter(l => l.r[1] - first.r[3] < first.size * 3);
    const title = group.map(l => l.text).join(" ").replace(/\s+/g, " ").trim();
    if (title.length < 1 || /^\d{1,3}$/.test(title) && group.length === 1 && p.lines.length < 3) { /* solo número suelto en página vacía: igual cuenta */ }
    const r = group.reduce<R>((a, l) => [Math.min(a[0], l.r[0]), Math.min(a[1], l.r[1]), Math.max(a[2], l.r[2]), Math.max(a[3], l.r[3])], group[0].r);
    chapters.push({ page: p.index, title, r });
  }
  // título del libro: la línea más grande de las primeras páginas
  let title: string | null = null;
  { let bestSize = 0; for (const p of pages.slice(0, 6)) for (const l of p.lines) if (l.size > bestSize && l.text.length > 2) { bestSize = l.size; title = l.text; } }
  const bodyChapters0 = chapters.filter(c => c.page > 3);
  // Si «capítulos» aparecen en una de cada pocas páginas, lo que se detectó son títulos de sección
  // (libros de texto, prácticos): los controles que dependen de los capítulos no son confiables.
  const chaptersReliable = bodyChapters0.length <= Math.max(15, pages.length * 0.12);
  const bodyChapters = chaptersReliable ? bodyChapters0 : [];
  // capítulos en impar: si el perfil lo pide, o si la mayoría del libro lo hace (y entonces las excepciones se señalan)
  const oddShare = bodyChapters.length ? bodyChapters.filter(c => c.page % 2 === 0).length / bodyChapters.length : 0;
  const ruleOdd = o.chaptersOdd === true || (o.chaptersOdd === "auto" && bodyChapters.length >= 3 && oddShare >= 0.75 && oddShare < 1);
  if (ruleOdd) for (const c of bodyChapters) if (c.page % 2 === 1) add("chapterOdd", o.chaptersOdd === true ? "error" : "warn", "", c.page, c.r, `«${c.title.slice(0, 40)}» empieza en página par${o.chaptersOdd === "auto" ? " (los demás capítulos empiezan en impar)" : ""}`);
  for (const c of bodyChapters) if (headers.has(c.page)) add("headOnOpening", "info", "", c.page, headers.get(c.page)!.line.r, "Cabecera en página de apertura");

  // ---------- cabeceras contra el capítulo en curso ----------
  if (bodyChapters.length >= 2) {
    for (const [pg, hd] of headers) {
      const cur = [...bodyChapters].reverse().find(c => c.page <= pg);
      if (!cur || cur.page === pg) continue;
      const matchOther = bodyChapters.find(c => c !== cur && sameTitle(hd.text, c.title));
      if (matchOther && !sameTitle(hd.text, cur.title)) add("runningHead", "error", "", pg, hd.line.r, `La cabecera dice «${hd.text.slice(0, 40)}»`, `${P(pg)}: la cabecera dice «${hd.text.slice(0, 50)}» pero el capítulo es «${cur.title.slice(0, 50)}»`);
    }
  }

  // ---------- índice ----------
  const toc: BookResult["toc"] = [];
  const entryRe = /^(.{2,}?)[\s.·…_\-–]{1,}(\d{1,4})$/;
  for (const p of pages) {
    const ent = p.lines.map(l => ({ l, m: l.text.match(entryRe) })).filter(x => x.m && !bandLines.has(x.l));
    const heading = p.lines.some(l => /^(índice|indice|sumario|contenido|contenidos|tabla de contenidos?)$/i.test(l.text.trim()));
    if (ent.length < (heading ? 3 : 6)) continue;
    // las entradas deben tener números crecientes
    const nums = ent.map(e => parseInt(e.m![2]));
    const inc = nums.filter((v, k) => k === 0 || v >= nums[k - 1]).length / nums.length;
    if (inc < 0.8) continue;
    for (const e of ent) toc.push({ title: e.m![1].replace(/[\s.·…_\-–]+$/, "").trim(), folio: parseInt(e.m![2]), page: null, ok: false, ...{ _src: p.index } } as any);
  }
  if (toc.length >= 3) {
    if (folioOffset === null) add("toc", "info", "", undefined, undefined, undefined, "Encontré un índice, pero no pude leer los folios del libro para comprobarlo");
    else {
      const findTitleNear = (t: string, from: number) => {
        const order = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 8, -8, 10, -10];
        for (const dlt of order) {
          const pg = pages[from + dlt]; if (!pg) continue;
          if (pg.lines.some(l => !bandLines.has(l) && (l.size > bodySize * 1.1 || l.bold) && sameTitle(t, l.text)) || chapters.some(c => c.page === pg.index && sameTitle(t, c.title))) return pg.index;
        }
        return null;
      };
      let ok = 0, bad = 0;
      for (const e of toc) {
        const target = e.folio - 1 + folioOffset;
        e.page = target;
        const found = findTitleNear(e.title, target);
        e.real = found === null ? null : found + 1 - folioOffset;
        if (found === target) { e.ok = true; ok++; }
        else if (found !== null) { bad++; const realFolio = found + 1 - folioOffset; add("toc", "error", "", (e as any)._src, null, undefined, `«${e.title.slice(0, 50)}»: el índice dice ${e.folio}, pero empieza en la ${realFolio}`); add("toc", "error", "", found, chapters.find(c => c.page === found)?.r ?? null, `El índice indica pág. ${e.folio}`); }
      }
      const unknown = toc.length - ok - bad;
      if (unknown > 0 && unknown >= toc.length * 0.5) add("toc", "info", "", undefined, undefined, undefined, `No encontré ${unknown} de las ${toc.length} entradas del índice como títulos en el libro (puede que en la página tengan otro texto)`);
    }
  }

  // ---------- viudas, huérfanas y cortes de palabra ----------
  type Body = { lines: Line[]; left: number; right: number };
  const body: (Body | null)[] = pages.map(p => {
    const ls = p.lines.filter(l => isBody(l) && !bandLines.has(l));
    if (ls.length < 6) return null;
    const lefts = ls.map(l => Math.round(l.r[0])), rights = ls.map(l => Math.round(l.r[2]));
    const mode = (a: number[]) => { const m = new Map<number, number>(); a.forEach(v => m.set(v, (m.get(v) ?? 0) + 1)); return [...m.entries()].sort((x, y) => y[1] - x[1])[0][0]; };
    return { lines: ls, left: Math.min(...lefts.filter(v => Math.abs(v - mode(lefts)) < 2)), right: mode(rights) };
  });
  const isStart = (b: Body, l: Line, prev?: Line) => l.r[0] > b.left + bodySize * 0.6 || (prev ? l.r[1] - prev.r[3] > bodySize * 1.2 : false);
  const isEnd = (b: Body, l: Line) => l.r[2] < b.right - bodySize * 1.5;
  const chapterPages = new Set(chapters.map(c => c.page));
  let ladderMarks = 0;
  for (let i = 0; i < n; i++) {
    const b = body[i]; if (!b) continue;
    const ls = b.lines;
    const last = ls[ls.length - 1];
    // huérfana: primera línea de un párrafo sola al pie
    const nb = body[i + 1];
    if (nb && !chapterPages.has(i + 1) && ls.length > 1 && isStart(b, last, ls[ls.length - 2]) && !isEnd(b, last))
      add("orphan", "warn", "", i, last.r, "Línea huérfana", `Pág. ${i + 1}: «${snip(last.text)}»`);
    // viuda: última línea de un párrafo sola arriba
    const first = ls[0];
    if (i > 0 && body[i - 1] && !chapterPages.has(i) && !isStart(b, first) && isEnd(b, first) && ls.length > 1 && isStart(b, ls[1], first))
      add("widow", "warn", "", i, first.r, "Línea viuda", `Pág. ${i + 1}: «${snip(first.text)}»`);
    // escaleras de guiones
    let run: Line[] = [];
    const flush = () => { if (run.length >= 4 && ladderMarks < 80) { ladderMarks++; const r = run.reduce<R>((a, l) => [Math.min(a[0], l.r[0]), Math.min(a[1], l.r[1]), Math.max(a[2], l.r[2]), Math.max(a[3], l.r[3])], run[0].r); add("hyphenLadder", "warn", "", i, r, `${run.length} líneas seguidas cortadas con guion`, `Pág. ${i + 1}: ${run.length} líneas seguidas, desde «${snip(run[0].text)}»`); } run = []; };
    for (const l of ls) { if (/[a-záéíóúñü]-$/i.test(l.text)) run.push(l); else flush(); }
    flush();
    // palabra cortada al dar vuelta la página (impar → par siguiente)
    if (i % 2 === 0 && nb && /[a-záéíóúñü]-$/i.test(last.text)) add("pageTurnHyphen", "warn", "", i, last.r, "Palabra cortada al pasar de página", `Pág. ${i + 1}: «…${last.text.slice(-28)}»`);
  }

  // ---------- créditos: depósito legal, prefijo del ISBN, años ----------
  const frontBack = [...pages.slice(0, 14), ...pages.slice(Math.max(14, n - 6))];
  const ftxt = frontBack.map(p => p.lines.map(l => l.text).join("\n")).join("\n");
  const PROV = new Set("A AB AL AV B BA BI BU C CA CC CE CO CR CS CU GC GI GR GU H HU IB J L LE LO LR LU M MA ML MU NA O OR OU P PM PO S SA SE SG SO SS T TE TF TO V VA VI Z ZA".split(" "));
  let dl: string | null = null, dlOk: boolean | null = null;
  const dlm = ftxt.match(/(?:dep[óo]sito\s+legal|\bD\.\s?L\.?)\s*(?:n\.?[ºo]\.?)?[:\s]*([A-Z]{1,2})[\s.\-]*(\d{1,6})[\s.\-/]*((?:19|20)\d{2}|\d{2})\b/i);
  if (dlm) {
    dl = `${dlm[1].toUpperCase()} ${dlm[2]}-${dlm[3]}`;
    const yr = dlm[3].length === 2 ? 2000 + parseInt(dlm[3]) : parseInt(dlm[3]);
    dlOk = PROV.has(dlm[1].toUpperCase()) && yr >= 1958 && yr <= o.year + 1;
    if (!PROV.has(dlm[1].toUpperCase())) add("credits", "warn", "", undefined, undefined, undefined, `El depósito legal «${dl}» usa un código de provincia que no existe`);
    if (yr > o.year + 1) add("credits", "error", "", undefined, undefined, undefined, `El depósito legal tiene un año futuro: ${yr}`);
  } else if (o.country === "es" && /dep[óo]sito\s+legal/i.test(ftxt)) add("credits", "warn", "", undefined, undefined, undefined, "Aparece «Depósito legal» pero sin un número con formato válido (por ejemplo, B 12345-2026)");
  const years = [...ftxt.matchAll(/(?:©|\(c\)|copyright)[^\n\d]{0,40}((?:19|20)\d{2})/gi)].map(m => parseInt(m[1]));
  for (const y of years) if (y > o.year + 1) add("credits", "error", "", undefined, undefined, undefined, `Año de copyright en el futuro: © ${y}`);
  const ed = ftxt.match(/primera edici[óo]n[^\n\d]{0,30}((?:19|20)\d{2})/i);
  if (ed && dlm) { const yr = dlm[3].length === 2 ? 2000 + parseInt(dlm[3]) : parseInt(dlm[3]); if (Math.abs(parseInt(ed[1]) - yr) > 1) add("credits", "info", "", undefined, undefined, undefined, `La primera edición figura en ${ed[1]} y el depósito legal es de ${yr}: si es una reimpresión, conviene indicarlo`); }

  // ---------- ortografía y palabras repetidas ----------
  const spelling: BookResult["spelling"] = { checked: false, words: 0, unknown: 0 };
  {
    // texto corrido con las palabras cortadas en fin de línea reunidas
    type Tok = { w: string; page: number; r: R; sentenceStart: boolean; afterPunct: boolean; lang: Family | null; block: number };
    const toks: Tok[] = [];
    let carry: { w: string; page: number; r: R } | null = null;
    let prevEnd = true, prevPunct = true, lang: Family | null = null;
    const L = /[\p{L}·]/u, NL = /[^\p{L}·]+/u;
    for (let i = 0; i < n; i++) {
      const b = body[i]; if (!b) continue;
      let block = -1;
      for (const l of b.lines) {
        if (l.block !== block) {
          // idioma de cada bloque de texto (para los libros bilingües o con citas en otra lengua)
          block = l.block;
          const bt = b.lines.filter(x => x.block === block).map(x => x.text).join(" ");
          lang = o.forceLang ?? detect(bt) ?? lang;
        }
        const ws = l.words;
        for (let k = 0; k < ws.length; k++) {
          let raw = ws[k].t;
          let r = ws[k].r;
          if (carry && k === 0) { raw = carry.w + raw; r = carry.r; carry = null; }
          const isLastHy = k === ws.length - 1 && /\p{Ll}-$/u.test(raw);
          if (isLastHy) { carry = { w: raw.slice(0, -1), page: i, r }; continue; }
          const parts = raw.split(NL).map(x => x.replace(/^·+|·+$/g, "")).filter(Boolean);
          parts.forEach((w, j) => toks.push({ w, page: i, r, lang, block: l.block, sentenceStart: prevEnd, afterPunct: j === 0 ? (prevPunct || !L.test(raw[0] ?? "")) : true }));
          prevEnd = /[.!?¡¿…:»—]$/.test(raw) || /^[—¿¡«]/.test(raw);
          prevPunct = !L.test(raw[raw.length - 1] ?? "");
        }
      }
    }
    const lower = toks.map(t => t.w.toLowerCase());
    spelling.words = toks.length;
    // palabras repetidas: tienen que ser vecinas en el mismo párrafo (en tablas, esquemas y columnas
    // dos rótulos iguales pueden quedar uno al lado del otro sin ser una errata)
    const adjacent = (a: Tok, b: Tok) => {
      if (a.block !== b.block) return false;
      const h = Math.max(a.r[3] - a.r[1], b.r[3] - b.r[1], 1);
      const sameLine = Math.abs((a.r[1] + a.r[3]) / 2 - (b.r[1] + b.r[3]) / 2) < h * 0.5;
      if (sameLine) return b.r[0] - a.r[2] < h * 1.2 && b.r[0] >= a.r[2] - 1;
      return b.r[1] > a.r[1] && b.r[1] - a.r[3] < h * 1.5 && b.r[0] < a.r[0];
    };
    let reps = 0;
    for (let k = 1; k < toks.length; k++) {
      if (lower[k] === lower[k - 1] && !toks[k].afterPunct && lower[k].length > 1 && !/^(no|sí|si|muy|ja|je|bla|tan|que|nous|vous|sehr|very|had|that)$/.test(lower[k]) && toks[k].page === toks[k - 1].page && reps < 60 && adjacent(toks[k - 1], toks[k])) {
        reps++; add("repeatedWord", "warn", "", toks[k].page, toks[k].r, `«${toks[k - 1].w} ${toks[k].w}»`, `«${toks[k - 1].w} ${toks[k].w}» en ${P(toks[k].page)}`);
      }
    }
    const byLang = new Map<Family, number>(); for (const t of toks) if (t.lang) byLang.set(t.lang, (byLang.get(t.lang) ?? 0) + 1);
    const main = [...byLang.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const avail = Object.keys(o.spellers) as Family[];
    if (!o.spellRequested) spelling.reason = "desactivado";
    else if (toks.length < 200) spelling.reason = "poco texto";
    else if (!avail.length || (main && !o.spellers[main])) { spelling.reason = "idioma"; add("spelling", "info", "", undefined, undefined, undefined, main ? `No revisé la ortografía: no tengo cargado el diccionario de ${FAMILY_NAME[main]}` : "No revisé la ortografía: no pude reconocer el idioma del texto"); }
    else {
      spelling.checked = true;
      spelling.langs = avail.filter(f => byLang.has(f) || f === main).map(f => FAMILY_NAME[f]);
      const seen = new Map<string, { n: number; pages: number[]; r: R; page: number; shown: string }>();
      for (const t of toks) {
        const sp = o.spellers[t.lang ?? main!] ?? (t.lang ? null : o.spellers[main!]);
        if (!sp) continue;
        const w = t.w;
        if (w.length < 3 || /^\p{Lu}{2,}$/u.test(w) || /\p{Lu}/u.test(w.slice(1))) continue;
        const cap = /^\p{Lu}/u.test(w);
        if (cap && !t.sentenceStart) continue; // nombre propio
        if (t.lang === "de" && cap) continue; // en alemán los sustantivos van con mayúscula
        const q = cap ? w.toLowerCase() : w;
        if (sp.correct(w) || sp.correct(q)) continue;
        const key = (t.lang ?? "") + ":" + q;
        const e = seen.get(key) ?? { n: 0, pages: [], r: t.r, page: t.page, shown: w };
        e.n++; if (!e.pages.includes(t.page)) e.pages.push(t.page);
        seen.set(key, e);
      }
      // lo que aparece muchas veces suele ser un nombre o un término del libro, no una errata
      const cands = [...seen.entries()].filter(([, e]) => e.n <= 3).sort((a, b) => a[1].page - b[1].page);
      spelling.unknown = cands.length;
      for (const [k, e] of cands.slice(0, 150)) { const lg = k.split(":")[0] as Family; add("spelling", "info", "", e.page, e.r, `¿«${e.shown}»?`, `«${e.shown}» (${e.pages.slice(0, 4).map(p => p + 1).join(", ")})${lg && lg !== main ? ` · ${FAMILY_NAME[lg]}` : ""}`); }
    }
  }

  return { bodySize, chapters, folioOffset, toc: toc.map(t => ({ title: t.title, folio: t.folio, page: t.page, ok: t.ok })), credits: { dl, dlOk, copyrightYears: years }, spelling, title };
}

// Prefijos de ISBN habituales por país (grupo de registro).
export const ISBN_PREFIX: Record<string, string[]> = { es: ["97884"], ar: ["978950", "978987"], mx: ["978607", "978968", "978970"], co: ["978958"], cl: ["978956"], uy: ["9789974"], pe: ["978612", "9789972"], ve: ["978980"] };
export const COUNTRY_NAME: Record<string, string> = { es: "España", ar: "Argentina", mx: "México", co: "Colombia", cl: "Chile", uy: "Uruguay", pe: "Perú", ve: "Venezuela" };
