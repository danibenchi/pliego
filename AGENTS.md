<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Pliego (reglas del proyecto)

- La herramienta vive en `src/pliego/` y tiene su propio diseño en `src/pliego/pliego.css`. No la
  reescribas con Tailwind, shadcn ni componentes de `src/components/ui`: el diseño es intencional.
- El análisis corre entero en el navegador (MuPDF en WebAssembly dentro de un Web Worker). No muevas
  ningún análisis al servidor ni subas archivos: la promesa a los usuarios es que su PDF no sale del equipo.
- `src/routes/index.tsx` carga Pliego solo en el cliente (`ssr: false` e import dinámico). No lo importes
  de forma estática ni en otra ruta que se renderice en el servidor.
- `src/pliego/` tiene su propio `tsconfig.json` (no estricto) y está excluido del de la raíz y de ESLint.
  No hace falta «arreglar» sus tipos para el modo estricto.
- Los archivos de `src/pliego/assets/dict/`, `fonts.ts` y `fogra39.ts` son generados por
  `scripts/generate-assets.mjs`: no los edites a mano.
- Licencia AGPL-3.0-or-later: cualquier cambio mantiene esa licencia y los avisos de `THIRD_PARTY_NOTICES.md`.
