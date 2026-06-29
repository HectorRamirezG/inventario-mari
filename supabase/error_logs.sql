-- ════════════════════════════════════════════════════════════════════
-- 2026-06-29 — Tabla error_logs para logger remoto del cliente
--
-- Componente: src/lib/logger.ts envía aquí los errores que captura
-- ErrorBoundary (frontend) + cualquier service que llame
-- `logErrorRemote(err, scope, extra)`. Útil para ver qué se rompe en
-- producción sin tener que pedirle al cliente que pegue logs.
--
-- Cap implícito: el logger ya throttlea 1 error/10s por scope. Si quieres
-- limitar duro, agrega un cron que borre filas > 30 días o cap 10k filas.
--
-- Ejecutar UNA vez en Supabase Dashboard → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  scope text not null,
  message text not null,
  stack text,
  user_email text,
  user_agent text,
  route text,
  extra jsonb
);

create index if not exists error_logs_created_at_idx
  on public.error_logs (created_at desc);
create index if not exists error_logs_scope_idx
  on public.error_logs (scope);

-- RLS: cualquier sesión (anon o authenticated) puede INSERTAR errores
-- (sino no podríamos capturarlos antes del login). Solo admin lee.
alter table public.error_logs enable row level security;

drop policy if exists "error_logs_insert_any" on public.error_logs;
create policy "error_logs_insert_any" on public.error_logs
  for insert to anon, authenticated
  with check (true);

drop policy if exists "error_logs_select_admin" on public.error_logs;
create policy "error_logs_select_admin" on public.error_logs
  for select to authenticated
  using (public.is_admin());

grant insert on public.error_logs to anon, authenticated;
grant select on public.error_logs to authenticated;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- LIMPIEZA OPCIONAL (Mari ejecuta cuando crezca demasiado):
-- delete from error_logs where created_at < now() - interval '30 days';
-- ════════════════════════════════════════════════════════════════════
