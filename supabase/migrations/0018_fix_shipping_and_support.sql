-- =============================================================
-- 0018_fix_shipping_and_support.sql
-- Fecha: 2026-06-15
--
-- Sincroniza el schema de Supabase con lo que el frontend YA
-- está leyendo y escribiendo:
--   1. sales.is_foreign_shipping  (boolean)
--   2. sales.shipping_amount      (numeric)  ← NO shipping_cost
--   3. tabla support_tickets       (idempotente)
--   4. RPC create_support_ticket   (devuelve uuid, no json)
--   5. RPC update_support_ticket_status
--
-- Es idempotente: se puede correr varias veces sin romper nada.
-- Al final hace NOTIFY pgrst para que PostgREST refresque su
-- schema cache y desaparezcan los 400 / 404.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Columnas faltantes en sales
-- -------------------------------------------------------------
-- El cart del cliente (ClientShopPage) y los tickets (TicketView,
-- PublicTicketPage, receipt.ts) ya leen/escriben estos campos.
alter table public.sales
  add column if not exists is_foreign_shipping boolean not null default false;

alter table public.sales
  add column if not exists shipping_amount numeric(12, 2) not null default 0;

-- Backfill defensivo por si la columna existía sin NOT NULL:
update public.sales set is_foreign_shipping = coalesce(is_foreign_shipping, false);
update public.sales set shipping_amount     = coalesce(shipping_amount, 0);

comment on column public.sales.is_foreign_shipping is
  'Switch del cart del cliente para envío foráneo (mensajería/paquetería).';
comment on column public.sales.shipping_amount is
  'Costo de envío sumado al total. Lo calcula el cart y lo usa receipt.ts y TicketView.';


-- -------------------------------------------------------------
-- 2) Tabla support_tickets (sólo se crea si no existe)
-- -------------------------------------------------------------
create table if not exists public.support_tickets (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid null references public.sales(id) on delete set null,
  customer_name  text null,
  customer_email text null,
  customer_phone text null,
  category      text not null check (category in ('damaged','shipping','comment')),
  description   text not null,
  image_url     text null,
  status        text not null default 'open'
                check (status in ('open','in_progress','resolved')),
  resolved_at   timestamptz null,
  resolved_by   uuid null,
  created_at    timestamptz not null default now()
);

create index if not exists support_tickets_status_created_idx
  on public.support_tickets (status, created_at desc);

create index if not exists support_tickets_sale_idx
  on public.support_tickets (sale_id);

alter table public.support_tickets enable row level security;

-- Lectura autenticada (la UI admin filtra por rol en cliente; si
-- ya tienes una política de role=admin más fina, déjala y borra ésta).
do $$
begin
  create policy support_tickets_authed_read
    on public.support_tickets for select
    to authenticated
    using (true);
exception when duplicate_object then null;
end $$;


-- -------------------------------------------------------------
-- 3) RPC create_support_ticket
--    Firma EXACTA que llama src/features/support/supportService.ts:
--      supabase.rpc("create_support_ticket", {
--        p_sale_id, p_category, p_description, p_image_url
--      })
--    El frontend hace `return data as string` → debe devolver uuid.
--    SECURITY DEFINER para permitir que clientes anónimos del ticket
--    público (rol `anon`) puedan reportar sin tocar la tabla directo.
-- -------------------------------------------------------------
create or replace function public.create_support_ticket(
  p_sale_id     uuid,
  p_category    text,
  p_description text,
  p_image_url   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id  uuid;
  v_name  text;
  v_email text;
  v_phone text;
begin
  -- Validaciones
  if p_category is null or p_category not in ('damaged','shipping','comment') then
    raise exception 'Categoría inválida: %', p_category;
  end if;

  if p_description is null or length(btrim(p_description)) < 3 then
    raise exception 'Descripción muy corta';
  end if;

  -- Hidrata datos de contacto desde la venta enlazada (si viene).
  -- Así la bandeja admin (SupportPage) ve nombre/email/teléfono sin
  -- pedirlos otra vez al cliente.
  if p_sale_id is not null then
    select customer_name, customer_email, customer_phone
      into v_name, v_email, v_phone
    from public.sales
    where id = p_sale_id;
  end if;

  insert into public.support_tickets (
    sale_id, customer_name, customer_email, customer_phone,
    category, description, image_url, status
  ) values (
    p_sale_id, v_name, v_email, v_phone,
    p_category, btrim(p_description), p_image_url, 'open'
  )
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.create_support_ticket(uuid, text, text, text)
  to anon, authenticated;


-- -------------------------------------------------------------
-- 4) RPC update_support_ticket_status (admin marca como atendido)
--    src/features/support/supportService.ts → updateSupportStatus()
-- -------------------------------------------------------------
create or replace function public.update_support_ticket_status(
  p_ticket_id uuid,
  p_status    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('open','in_progress','resolved') then
    raise exception 'Status inválido: %', p_status;
  end if;

  update public.support_tickets
     set status      = p_status,
         resolved_at = case when p_status = 'resolved' then now() else resolved_at end,
         resolved_by = case when p_status = 'resolved' then auth.uid() else resolved_by end
   where id = p_ticket_id;
end;
$$;

grant execute on function public.update_support_ticket_status(uuid, text)
  to authenticated;


-- -------------------------------------------------------------
-- 5) Refresca el schema cache de PostgREST → quita los 400/404
-- -------------------------------------------------------------
notify pgrst, 'reload schema';
