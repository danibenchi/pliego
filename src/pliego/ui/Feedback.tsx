// «¿Algo está mal? Contanos»: comentarios de la beta. Se abre desde el encabezado o desde un hallazgo
// (ahí ya viene marcado qué control y que es una posible falsa alarma).
import { useEffect, useState } from "react";
import type { Report } from "../engine/analyze";
import { COPY } from "../engine/copy";
import { sendFeedback, reviewStat, FeedbackKind, feedbackConfigured } from "./stats";

export interface FeedbackOpen { checkId?: string; kind?: FeedbackKind }
/** Abre el formulario desde cualquier parte de la interfaz. */
export const openFeedback = (o: FeedbackOpen = {}) => window.dispatchEvent(new CustomEvent("pliego-feedback", { detail: o }));

const KINDS: { id: FeedbackKind; t: string }[] = [
  { id: "falsa_alarma", t: "Marcó algo que está bien (falsa alarma)" },
  { id: "no_detecto", t: "No detectó un problema que sí había" },
  { id: "error", t: "Algo no funcionó (se colgó, un error, no abrió el archivo)" },
  { id: "idea", t: "Una idea o algo que falta" },
  { id: "otro", t: "Otra cosa" },
];

export function FeedbackHost({ report }: { report: Report | null }) {
  const [open, setOpen] = useState<FeedbackOpen | null>(null);
  useEffect(() => {
    const h = (e: Event) => setOpen((e as CustomEvent<FeedbackOpen>).detail ?? {});
    window.addEventListener("pliego-feedback", h); return () => window.removeEventListener("pliego-feedback", h);
  }, []);
  if (!open) return null;
  return <FeedbackDialog init={open} report={report} onClose={() => setOpen(null)} />;
}

function FeedbackDialog({ init, report, onClose }: { init: FeedbackOpen; report: Report | null; onClose: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>(init.kind ?? "falsa_alarma");
  const [msg, setMsg] = useState(""), [contact, setContact] = useState("");
  const [attach, setAttach] = useState(!!report);
  const [state, setState] = useState<"" | "sending" | "ok" | "error">("");
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  const check = init.checkId ? COPY[init.checkId]?.title : null;
  const send = async () => {
    setState("sending");
    const ok = await sendFeedback({ kind, message: msg.trim(), contact: contact.trim() || undefined, check_id: init.checkId,
      context: attach && report ? reviewStat(report, { batch: false }) : undefined });
    setState(ok ? "ok" : "error");
  };
  return (
    <div className="scopebg" onClick={onClose}>
      <div className="scope feedback" role="dialog" aria-modal="true" aria-labelledby="fb-t" onClick={e => e.stopPropagation()}>
        <h2 id="fb-t">¿Algo está mal? Contanos</h2>
        {state === "ok" ? (
          <>
            <p className="lead">Gracias. Lo vamos a revisar para ajustar Pliego. {contact.trim() ? "Si hace falta, te escribimos." : ""}</p>
            <button className="btn primary" onClick={onClose} autoFocus>Listo</button>
          </>
        ) : (
          <>
            <p className="lead">Pliego está en prueba: cada comentario nos ayuda a afinar los controles. No se envía tu PDF ni nada del libro; solo lo que escribas acá.</p>
            {check && <p className="fbcheck">Sobre: <b>{check}</b></p>}
            <label className="fbfield">Qué pasó
              <select value={kind} onChange={e => setKind(e.target.value as FeedbackKind)}>{KINDS.map(k => <option key={k.id} value={k.id}>{k.t}</option>)}</select>
            </label>
            <label className="fbfield">Contanos un poco más
              <textarea rows={5} value={msg} onChange={e => setMsg(e.target.value)} maxLength={4000} autoFocus
                placeholder={kind === "falsa_alarma" ? "Por ejemplo: marcó texto cerca del corte en las págs. 10–12, pero son los folios y están ahí a propósito." : kind === "no_detecto" ? "Por ejemplo: la imprenta nos rechazó el archivo por… y Pliego no lo marcó." : "Lo que viste, en qué página y qué esperabas."} />
            </label>
            <label className="fbfield">Tu correo, si querés que te respondamos (opcional)
              <input type="email" value={contact} onChange={e => setContact(e.target.value)} maxLength={200} placeholder="nombre@editorial.com" />
            </label>
            {report && (
              <label className="fbattach"><input type="checkbox" checked={attach} onChange={e => setAttach(e.target.checked)} />
                <span>Adjuntar el resumen técnico de esta revisión: qué controles fallaron, tipo de impresión y franjas de páginas y de peso. Sin nombres, textos ni el archivo.</span></label>
            )}
            {state === "error" && <p className="err">No se pudo enviar. Revisá la conexión y probá de nuevo.</p>}
            {!feedbackConfigured() && <p className="err">En esta versión no hay dónde recibir comentarios.</p>}
            <div className="pre-btns">
              <button className="btn" onClick={onClose}>Cancelar</button>
              <button className="btn primary" disabled={msg.trim().length < 3 || state === "sending" || !feedbackConfigured()} onClick={send}>{state === "sending" ? "Enviando…" : "Enviar"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
