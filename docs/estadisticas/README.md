# Estadísticas anónimas y comentarios de la beta

Pliego corre entero en el navegador. Lo único que sale del equipo es:

- **Estadísticas anónimas** (si la persona no las apaga): al terminar cada revisión, un resumen con la
  pieza, el tipo de impresión, tintas, familia de papel, encuadernación, país, tipo de libro, franjas de
  páginas, peso y duración, veredicto, cantidad de hallazgos por gravedad, los controles que fallaron
  (nombre interno y gravedad), el programa con que se exportó, los idiomas detectados y si se usó el modo
  liviano, el lote o una imprenta guardada. También avisos de uso de algunas funciones (comparar, cotejar,
  informe PDF, lote, cubierta, tinta en detalle, aviso previo aceptado o ignorado).
- **Comentarios de la beta**, solo cuando la persona los envía: tipo, texto, correo opcional, el control
  sobre el que comenta y, si lo acepta, el mismo resumen anónimo.

Nunca: el archivo ni su contenido, nombres de archivo, títulos, ISBN, la huella SHA-256, los valores o el
nombre de la imprenta, cookies ni identificadores. La fuente única de lo que se envía es `src/pliego/ui/stats.ts`.

## Dónde se guardan

En la base del proyecto (Lovable Cloud), tablas `pliego_stats` y `pliego_feedback`, creadas por la migración
de Lovable. Tienen RLS activado con una sola política: insertar. Nadie puede leerlas desde la página; se
consultan desde el panel de Lovable (Cloud › Database) o con SQL. Cada columna tiene límites de largo y
valores permitidos, así que no aceptan otra cosa que lo que manda Pliego.

El navegador escribe directo con la clave publicable del proyecto (`VITE_SUPABASE_URL` y
`VITE_SUPABASE_PUBLISHABLE_KEY`, públicas por diseño). Sin esas variables no se envía nada.

## Consultas útiles

```sql
-- revisiones por semana
select date_trunc('week', day)::date semana, count(*) revisiones,
       count(*) filter (where verdict = 'ok') listas
from pliego_stats where kind = 'review' group by 1 order by 1 desc;

-- controles que más fallan
select split_part(c, ':', 1) control, split_part(c, ':', 2) gravedad, count(*) veces
from pliego_stats, unnest(checks) c where kind = 'review' group by 1, 2 order by 3 desc limit 30;

-- comentarios de la beta
select created_at, kind, check_id, message, contact from pliego_feedback order by created_at desc;
```

Nota: Pliego no guarda la IP, pero la plataforma que aloja la base puede registrar las solicitudes en sus
propios registros técnicos durante un tiempo limitado. Conviene mencionarlo en la política de privacidad
de la Academia.
