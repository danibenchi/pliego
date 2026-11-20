// Guardar un archivo generado: en un artefacto de Claude, con su capacidad de descargas
// (el visor confirma); en cualquier otro lugar, con una descarga común del navegador.
export async function saveFile(filename: string, data: Blob | string): Promise<"saved" | "declined" | "fallback"> {
  const c = (window as any).claude;
  if (c && typeof c.use === "function") {
    try {
      const dl = await Promise.race([c.use("downloads"), new Promise(r => setTimeout(() => r(null), 3000))]) as any;
      if (dl) {
        try { await dl.save({ filename, data }); return "saved"; }
        catch (e: any) { if (e?.code === "declined") return "declined"; if (e?.code === "rate_limited") throw e; }
      }
    } catch (e: any) { if (e?.code === "rate_limited") throw e; }
  }
  const blob = typeof data === "string" ? new Blob([data], { type: "application/json" }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "fallback";
}
