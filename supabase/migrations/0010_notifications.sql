-- =============================================================
-- 0010 · Notificaciones in-app + triggers
-- =============================================================
--
-- Cada cliente recibe notificaciones cuando:
--  - el admin registra un abono a su apartado
--  - el apartado pasa a estado 'paid'
--  - el apartado es cancelado
--
-- Los admin reciben notificaciones cuando:
--  - se crea un apartado nuevo
--
-- IDEMPOTENTE.
-- =============================================================

-- ------------------------------------------------------------
-- 1. TABLA: notifications
-- ------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,                  -- a quién va dirigida
  recipient_role  text not null default 'client', -- 'client' | 'admin'
  type text not null,                             -- 'payment_added' | 'sale_paid' | 'sale_cancelled' | 'new_layaway'
  title text not null,
  body text,
  link text,                                      -- ruta interna (ej. /mis-pedidos) o externa (/ticket/:token)
  metadata jsonb,                                 -- payload libre
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ix_notifications_recipient
  on public.notifications (recipient_email, read_at, created_at desc);


-- ------------------------------------------------------------
-- 2. TRIGGER: payment_added → notificar al cliente
-- ------------------------------------------------------------
create or replace function public.notify_payment_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale sales;
begin
  select * into v_sale from public.sales where id = new.sale_id;
  if v_sale.id is null or v_sale.customer_email is null then
    return new;
  end if;

  insert into public.notifications (
    recipient_email, recipient_role, type, title, body, link, metadata
  ) values (
    v_sale.customer_email,
    'client',
    'payment_added',
    'Se registró un abono',
    'Recibimos $' || to_char(new.amount, 'FM999,999.00') ||
      ' a tu apartado.' ||
      ' Saldo actual: $' || to_char(greatest(0, v_sale.balance - new.amount), 'FM999,999.00') || '.',
    '/mis-pedidos',
    jsonb_build_object(
      'sale_id', v_sale.id,
      'public_token', v_sale.public_token,
      'amount', new.amount
    )
  );
  return new;
end$$;

drop trigger if exists trg_notify_payment_added on public.payments;
create trigger trg_notify_payment_added
  after insert on public.payments
  for each row execute function public.notify_payment_added();


-- ------------------------------------------------------------
-- 3. TRIGGER: sale status cambia → notificar
-- ------------------------------------------------------------
create or replace function public.notify_sale_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo nos interesan transiciones reales
  if old.status = new.status then return new; end if;
  if new.customer_email is null then return new; end if;

  if new.status = 'paid' then
    insert into public.notifications (
      recipient_email, recipient_role, type, title, body, link, metadata
    ) values (
      new.customer_email, 'client', 'sale_paid',
      '¡Apartado liquidado!',
      'Pagaste por completo. Gracias por tu compra ✨',
      '/mis-pedidos',
      jsonb_build_object('sale_id', new.id, 'public_token', new.public_token)
    );
  elsif new.status = 'cancelled' then
    insert into public.notifications (
      recipient_email, recipient_role, type, title, body, link, metadata
    ) values (
      new.customer_email, 'client', 'sale_cancelled',
      'Apartado cancelado',
      'Tu apartado fue cancelado. Si crees que es un error, contáctanos.',
      '/mis-pedidos',
      jsonb_build_object('sale_id', new.id)
    );
  end if;

  return new;
end$$;

drop trigger if exists trg_notify_sale_status on public.sales;
create trigger trg_notify_sale_status
  after update of status on public.sales
  for each row execute function public.notify_sale_status_change();


-- ------------------------------------------------------------
-- 4. TRIGGER: nuevo apartado → notificar admins
-- ------------------------------------------------------------
create or replace function public.notify_new_layaway()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
begin
  if new.is_layaway is not true then return new; end if;

  -- Notifica a todos los admin/staff (uno por usuario)
  for v_admin in
    select email
      from public.user_profiles
     where role in ('admin','staff')
       and email is not null
  loop
    insert into public.notifications (
      recipient_email, recipient_role, type, title, body, link, metadata
    ) values (
      v_admin.email, 'admin', 'new_layaway',
      'Nuevo apartado',
      coalesce(new.customer_name, 'Cliente') ||
        ' apartó $' || to_char(new.total, 'FM999,999.00') || '.',
      '/admin',
      jsonb_build_object(
        'sale_id', new.id,
        'public_token', new.public_token,
        'customer_phone', new.customer_phone
      )
    );
  end loop;

  return new;
end$$;

drop trigger if exists trg_notify_new_layaway on public.sales;
create trigger trg_notify_new_layaway
  after insert on public.sales
  for each row execute function public.notify_new_layaway();


-- ------------------------------------------------------------
-- 5. RLS: cada usuario ve SOLO sus notificaciones (por email)
-- ------------------------------------------------------------
alter table public.notifications enable row level security;

drop policy if exists "notif_select_own" on public.notifications;
create policy "notif_select_own"
  on public.notifications
  for select
  to authenticated
  using (recipient_email = auth.email());

-- Marcar como leído / borrar
drop policy if exists "notif_update_own" on public.notifications;
create policy "notif_update_own"
  on public.notifications
  for update
  to authenticated
  using (recipient_email = auth.email())
  with check (recipient_email = auth.email());

drop policy if exists "notif_delete_own" on public.notifications;
create policy "notif_delete_own"
  on public.notifications
  for delete
  to authenticated
  using (recipient_email = auth.email());


-- ------------------------------------------------------------
-- 6. Realtime: agregar tabla a la publicación
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end$$;


-- ------------------------------------------------------------
-- 7. Helper RPC: marcar todas como leídas
-- ------------------------------------------------------------
create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where recipient_email = auth.email()
     and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end$$;

grant execute on function public.mark_all_notifications_read to authenticated;


do $$ begin
  raise notice '0010: notifications + triggers listos.';
end $$;
