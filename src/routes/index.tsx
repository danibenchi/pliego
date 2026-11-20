import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";

// Pliego corre entero en el navegador: la ruta no se renderiza en el servidor y el código de
// la herramienta (src/pliego) se carga recién en el cliente.
export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Pliego · Preflight de imprenta" },
      { name: "description", content: "Revisión previa del PDF de imprenta, en tu navegador. Academia Proyecto451." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Index,
});

function Index() {
  const [App, setApp] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (import.meta.env.SSR) return;
    import("../pliego/mount").then(m => setApp(() => m.default));
  }, []);
  return App ? <App /> : <div style={{ minHeight: "100vh", background: "#eceae4" }} />;
}
