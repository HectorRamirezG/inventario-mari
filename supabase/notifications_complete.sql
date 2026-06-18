-- ============================================================================
-- BEAUTY'S ME — Notifications complete (idempotente)
-- ============================================================================
-- Este script ASEGURA que el sistema de notificaciones funcione 100%:
--   1. Tabla `notifications` con todas las columnas correctas
--   2. RLS abierto para INSERT desde cliente o admin (cross-role)
--   3. RLS para SELECT solo del recipiente correcto (rol + email)
--   4. Realtime habilitado (publication supabase_realtime)
--   5. RPC `mark_all_notifications_read` (idempotente)
--
-- Puedes correr este script las veces que quieras. NO borra datos.
-- ============================================================================

-- 1. Tabla
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text,
  recipient_role text not null check (recipient_role in ('client','admin')),
  type text not null,
  title text not null,
  body text,
  link text,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_role, recipient_email, created_at desc);

create index if not exists notifications_unread_idx
  on public.notifications (recipient_role, read_at)
  where read_at is null;

-- 2. Habilita RLS
alter table public.notifications enable row level security;

-- 3. Policies (drop+create para garantizar el estado final)
do $$
begin
  -- INSERT: cualquiera autenticado o anon puede crear (necesario porque el
  -- cliente público crea notifs para admins y viceversa). El contenido se
  -- valida por el check constraint del rol.
  drop policy if exists "notif_insert_any" on public.notifications;
  create policy "notif_insert_any"
    on public.notifications
    for insert
    to anon, authenticated
    with check (true);

  -- SELECT: el admin/staff lee SOLO notifs con role='admin'.
  -- El cliente lee SOLO notifs con role='client' Y su email.
  -- Si la función `is_staff_or_admin` no existe, hacemos una versión
  -- inline basada en el JWT.
  drop policy if exists "notif_select_role" on public.notifications;
  create policy "notif_select_role"
    on public.notifications
    for select
    to anon, authenticated
    using (
      case
        when recipient_role = 'admin'
          then coalesce(
            (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','staff'),
            false
          )
        when recipient_role = 'client'
          then recipient_email is not null
           and lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        else false
      end
    );

  -- UPDATE: solo el destinatario puede marcar como leída.
  drop policy if exists "notif_update_role" on public.notifications;
  create policy "notif_update_role"
    on public.notifications
    for update
    to anon, authenticated
    using (
      case
        when recipient_role = 'admin'
          then coalesce(
            (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','staff'),
            false
          )
        when recipient_role = 'client'
          then recipient_email is not null
           and lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        else false
      end
    );

  -- DELETE: solo el destinatario puede borrarla.
  drop policy if exists "notif_delete_role" on public.notifications;
  create policy "notif_delete_role"
    on public.notifications
    for delete
    to anon, authenticated
    using (
      case
        when recipient_role = 'admin'
          then coalesce(
            (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','staff'),
            false
          )
        when recipient_role = 'client'
          then recipient_email is not null
           and lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        else false
      end
    );
end$$;

-- 4. Realtime (replica identity + publication)
alter table public.notifications replica identity full;

do $$
declare
  pub_exists boolean;
  in_pub boolean;
begin
  select exists(
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) into pub_exists;
  if not pub_exists then
    -- No existe la publication (instalación rara). No es crítico.
    return;
  end if;

  select exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) into in_pub;

  if not in_pub then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end$$;

-- 5. RPC mark_all_notifications_read (idempotente)
create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  jwt_role  text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
begin
  if jwt_role in ('admin','staff') then
    update public.notifications
       set read_at = now()
     where recipient_role = 'admin'
       and read_at is null;
  elsif jwt_email <> '' then
    update public.notifications
       set read_at = now()
     where recipient_role = 'client'
       and lower(recipient_email) = jwt_email
       and read_at is null;
  end if;
end;
$$;

grant execute on function public.mark_all_notifications_read() to anon, authenticated;
