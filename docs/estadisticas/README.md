# Estadísticas anónimas de Pliego

Pliego corre entero en el navegador. Lo único que sale del equipo, si la persona no lo apaga, es un
resumen anónimo al terminar cada revisión (y un aviso cuando usa ciertas funciones). Sirve para saber
si la herramienta se usa y qué problemas aparecen más.

## Qué se envía

Ver `src/ui/stats.ts`: es la única fuente de los envíos. Una revisión manda pieza, tipo de impresión,
tintas, familia de papel, encuadernación, país, franjas de páginas / peso / duración, veredicto, cantidad
de hallazgos por gravedad, los controles que fallaron (nombre interno y gravedad), el programa con que se
exportó, los idiomas detectados y si se usó el modo para archivos pesados, el lote o una imprenta guardada.

Nunca: el archivo ni su contenido, nombres de archivo, títulos, ISBN, la huella SHA-256, los valores o el
nombre de la imprenta, cookies ni identificadores. Cada persona puede ver lo que se envió y apagarlo desde
«Estadísticas anónimas de uso · Ver qué se envía».

## Puesta en marcha (Lovable / Supabase)

1. Ejecutar `schema.sql` (tabla con RLS activado y sin políticas públicas, más tres vistas).
2. Crear la función `pliego-stats` con `pliego-stats.function.ts` y `verify_jwt = false`.
   Variable opcional `PLIEGO_ORIGINS` con los dominios permitidos, separados por comas.
3. Compilar Pliego con `VITE_PLIEGO_STATS_URL=https://<proyecto>.supabase.co/functions/v1/pliego-stats`.

Sin esa variable no se envía nada (es lo que pasa en el prototipo publicado como artefacto).

Nota: la función no guarda la IP, pero la plataforma que la aloja puede registrar las solicitudes en sus
propios registros técnicos durante un tiempo limitado. Conviene mencionarlo en la política de privacidad
de la Academia.
