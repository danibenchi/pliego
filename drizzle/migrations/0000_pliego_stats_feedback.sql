create table public.pliego_stats (
  id bigint generated always as identity primary key,
  day date not null default current_date,
  kind text not null check (kind in ('review','action')),
  v text not null check (char_length(v) <= 10),
  action text check (action in ('compare','original','report_pdf','batch','cover_added','tac_detail','precheck_fixed','precheck_ignored')),
  piece text check (piece in ('interior','cubierta')),
  press text check (char_length(press) <= 24), inks text check (char_length(inks) <= 4),
  paper text check (char_length(paper) <= 24), binding text check (char_length(binding) <= 24),
  country text check (char_length(country) <= 6), content text check (char_length(content) <= 24),
  pages text check (char_length(pages) <= 16), size text check (char_length(size) <= 16), secs text check (char_length(secs) <= 16),
  verdict text check (verdict in ('ok','warn','error')),
  errors smallint, warns smallint, infos smallint,
  checks text[] not null default '{}' check (cardinality(checks) <= 150),
  app text check (char_length(app) <= 24),
  langs text[] not null default '{}' check (cardinality(langs) <= 8),
  light boolean, batch boolean, printer_saved boolean
);
grant insert on public.pliego_stats to anon, authenticated;
grant all on public.pliego_stats to service_role;
alter table public.pliego_stats enable row level security;
create policy "insertar estadisticas anonimas" on public.pliego_stats for insert to anon, authenticated with check (true);

create table public.pliego_feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  v text not null check (char_length(v) <= 10),
  kind text not null check (kind in ('falsa_alarma','no_detecto','error','idea','otro')),
  message text not null check (char_length(message) between 3 and 4000),
  contact text check (char_length(contact) <= 200),
  check_id text check (char_length(check_id) <= 40),
  context jsonb check (pg_column_size(context) < 8000)
);
grant insert on public.pliego_feedback to anon, authenticated;
grant all on public.pliego_feedback to service_role;
alter table public.pliego_feedback enable row level security;
create policy "enviar comentarios" on public.pliego_feedback for insert to anon, authenticated with check (true);