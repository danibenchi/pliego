// Supabase Edge Function «pliego-stats»: recibe las estadísticas anónimas de Pliego.
// Valida cada campo contra una lista cerrada y descarta todo lo demás. No guarda la IP, ni cabeceras,
// ni la hora exacta. Desplegar con «verify_jwt = false» (el navegador no manda credenciales).
import { createClient } from "npm:@supabase/supabase-js@2";

const ORIGINS = (Deno.env.get("PLIEGO_ORIGINS") ?? "").split(",").map(s => s.trim()).filter(Boolean);
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const ACTIONS = ["compare", "original", "report_pdf", "batch", "cover_added"];
const short = (x: unknown, max = 24) => typeof x === "string" && x.length <= max && /^[\w .:>\-]*$/.test(x) ? x : null;
const int = (x: unknown) => Number.isInteger(x) && (x as number) >= 0 && (x as number) < 10000 ? x as number : null;
const bool = (x: unknown) => typeof x === "boolean" ? x : null;
const list = (x: unknown, max: number) => Array.isArray(x) ? x.slice(0, max).map(v => short(v, 40)).filter(Boolean) as string[] : [];

function clean(b: any) {
  if (!b || typeof b !== "object") return null;
  const v = short(b.v, 10); if (!v) return null;
  if (b.kind === "action") return ACTIONS.includes(b.action) ? { kind: "action", v, action: b.action } : null;
  if (b.kind !== "review") return null;
  return {
    kind: "review", v,
    piece: ["interior", "cubierta"].includes(b.piece) ? b.piece : null,
    press: short(b.press), inks: short(b.inks, 4), paper: short(b.paper), binding: short(b.binding), country: short(b.country, 4),
    pages: short(b.pages), size: short(b.size), secs: short(b.secs),
    verdict: ["ok", "warn", "error"].includes(b.verdict) ? b.verdict : null,
    errors: int(b.errors), warns: int(b.warns), infos: int(b.infos),
    checks: list(b.checks, 120), app: short(b.app), langs: list(b.langs, 6),
    light: bool(b.light), batch: bool(b.batch), printer_saved: bool(b.printerSaved),
  };
}

Deno.serve(async req => {
  const origin = req.headers.get("origin") ?? "";
  const allow = ORIGINS.length === 0 || ORIGINS.includes(origin);
  const cors = { "Access-Control-Allow-Origin": allow ? origin || "*" : "null", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST" || !allow) return new Response(null, { status: 405, headers: cors });
  const text = await req.text();
  if (text.length > 4096) return new Response(null, { status: 413, headers: cors });
  let row; try { row = clean(JSON.parse(text)); } catch { row = null; }
  if (!row) return new Response(null, { status: 400, headers: cors });
  const { error } = await db.from("pliego_stats").insert(row);
  return new Response(null, { status: error ? 500 : 204, headers: cors });
});
