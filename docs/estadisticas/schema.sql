-- Pliego · estadísticas anónimas de uso (Supabase / Lovable Cloud)
-- Una fila por revisión o por acción. Sin nombres de archivo, textos, huellas, IP ni identificadores.
-- Solo se guarda el día (no la hora) para que dos filas no se puedan asociar por cercanía en el tiempo.

create table if not exists public.pliego_stats (
  id           bigint generated always as identity primary key,
  day          date        not null default current_date,
  kind         text        not null check (kind in ('review', 'action')),
  v            text        not null,
  action       text        check (action in ('compare', 'original', 'report_pdf', 'batch', 'cover_added')),
  piece        text        check (piece in ('interior', 'cubierta')),
  press        text, inks text, paper text, binding text, country text,
  pages        text, size text, secs text,
  verdict      text        check (verdict in ('ok', 'warn', 'error')),
  errors       smallint, warns smallint, infos smallint,
  checks       text[]      not null default '{}',
  app          text,
  langs        text[]      not null default '{}',
  light        boolean, batch boolean, printer_saved boolean
);

-- Nadie lee ni escribe directo desde el navegador: la función pliego-stats inserta con la clave de servicio.
alter table public.pliego_stats enable row level security;

-- Vistas para el panel interno (solo administradores)
create or replace view public.pliego_uso_semanal as
  select date_trunc('week', day)::date as semana,
         count(*) filter (where kind = 'review') as revisiones,
         count(*) filter (where kind = 'review' and verdict = 'ok') as listas_para_imprenta,
         count(*) filter (where kind = 'action' and action = 'report_pdf') as informes_pdf,
         count(*) filter (where kind = 'action' and action = 'compare') as comparaciones,
         count(*) filter (where kind = 'action' and action = 'original') as cotejos
  from public.pliego_stats group by 1 order by 1 desc;

create or replace view public.pliego_controles_frecuentes as
  select split_part(c, ':', 1) as control, split_part(c, ':', 2) as gravedad, count(*) as veces,
         round(100.0 * count(*) / nullif((select count(*) from public.pliego_stats where kind = 'review'), 0), 1) as pct_revisiones
  from public.pliego_stats, unnest(checks) as c
  where kind = 'review' group by 1, 2 order by veces desc;

create or replace view public.pliego_programas as
  select app, count(*) as revisiones, round(avg(errors), 2) as bloqueantes_promedio
  from public.pliego_stats where kind = 'review' group by 1 order by 2 desc;

-- Retención: las filas de más de dos años se borran (programar con pg_cron si está disponible)
-- select cron.schedule('pliego-stats-retencion', '0 4 * * 1', $$delete from public.pliego_stats where day < current_date - interval '2 years'$$);
