-- =====================================================================
-- 0007_auth_roles_images_public_ticket.sql
-- Migración consolidada del refactor "Mari v2":
--   1) Tabla user_profiles + trigger auto-asignación de roles.
--   2) Columna image_url en products (fotos de cosméticos).
--   3) Storage bucket "product-images" público.
--   4) RLS:
--      - Productos/variants: lectura pública (anon + cliente + staff).
--      - Costos: SOLO admin.
--      - Sales/sale_items: admin/staff = todo; cliente = sólo lo suyo
--                          (vía customer_email = auth.email()).
--      - Ticket público: SELECT abierto a anon sólo para lectura por id.
--
-- Ejecutar este script DESPUÉS de los 0001..0006 existentes desde el
-- Supabase SQL Editor. Es IDEMPOTENTE: puedes correrlo varias veces.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES & ROLES
-- ---------------------------------------------------------------------
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text unique,
  full_name   text,
  role        text not null default 'client'
              check (role in ('admin','staff','client')),
  created_at  timestamptz not null default now()
);

-- Lista cerrada de admins. Cualquier correo aquí se autoasigna como admin
-- al registrarse. El resto entra como 'client' (los puedes promover a
-- 'staff' manualmente desde SQL o desde la UI de Configuración).
create or replace function public.admin_emails()
returns text[] language sql immutable as $$
  select array[
    'mariamcontreras07@gmail.com',
    'zemog050301@gmail.com'
  ];
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := case
    when new.email = any(public.admin_emails()) then 'admin'
    else 'client'
  end;

  insert into public.user_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    v_role
  )
  on conflict (id) do update
    set email = excluded.email,
        role  = case
          when public.user_profiles.role = 'admin' then 'admin' -- nunca degradar
          else excluded.role
        end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper que consulta el rol actual sin necesidad de JOIN
create or replace function public.current_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role from public.user_profiles where id = auth.uid()),
    'anon'
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.current_role() = 'admin';
$$;

create or replace function public.is_staff_or_admin()
returns boolean language sql stable as $$
  select public.current_role() in ('admin','staff');
$$;

alter table public.user_profiles enable row level security;

drop policy if exists "perfil_propio_lectura" on public.user_profiles;
create policy "perfil_propio_lectura"
  on public.user_profiles for select
  using ( auth.uid() = id or public.is_staff_or_admin() );

drop policy if exists "admin_full_perfiles" on public.user_profiles;
create policy "admin_full_perfiles"
  on public.user_profiles for all
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- ---------------------------------------------------------------------
-- 2. FOTOS DE PRODUCTOS
-- ---------------------------------------------------------------------
alter table public.products
  add column if not exists image_url text;

alter table public.variants
  add column if not exists image_url text;

-- Bucket "product-images" público (lectura libre, escritura sólo staff/admin
-- vía RLS de storage.objects más abajo).
insert into storage.buckets (id, name, public)
values ('product-images','product-images', true)
on conflict (id) do nothing;

drop policy if exists "imagenes_lectura_publica" on storage.objects;
create policy "imagenes_lectura_publica"
  on storage.objects for select
  using ( bucket_id = 'product-images' );

drop policy if exists "imagenes_upload_staff" on storage.objects;
create policy "imagenes_upload_staff"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and public.is_staff_or_admin()
  );

drop policy if exists "imagenes_update_staff" on storage.objects;
create policy "imagenes_update_staff"
  on storage.objects for update
  using ( bucket_id = 'product-images' and public.is_staff_or_admin() );

drop policy if exists "imagenes_delete_admin" on storage.objects;
create policy "imagenes_delete_admin"
  on storage.objects for delete
  using ( bucket_id = 'product-images' and public.is_admin() );

-- ---------------------------------------------------------------------
-- 3. SALES: customer_email para self-shopping + ticket público
-- ---------------------------------------------------------------------
alter table public.sales
  add column if not exists customer_email text,
  add column if not exists public_token   text unique default encode(gen_random_bytes(9),'base64');

-- Backfill de public_token para ventas viejas (idempotente)
update public.sales
   set public_token = encode(gen_random_bytes(9),'base64')
 where public_token is null;

-- Asegura que cada venta nueva reciba su token
create or replace function public.ensure_sale_public_token()
returns trigger language plpgsql as $$
begin
  if new.public_token is null then
    new.public_token := encode(gen_random_bytes(9),'base64');
  end if;
  return new;
end;
$$;

drop trigger if exists sales_set_public_token on public.sales;
create trigger sales_set_public_token
  before insert on public.sales
  for each row execute function public.ensure_sale_public_token();

-- ---------------------------------------------------------------------
-- 4. RLS DE NEGOCIO
-- ---------------------------------------------------------------------
alter table public.products    enable row level security;
alter table public.variants    enable row level security;
alter table public.sales       enable row level security;
alter table public.sale_items  enable row level security;
alter table public.payments    enable row level security;
alter table public.movements   enable row level security;

-- ----- products (lectura pública, escritura staff/admin) -----
drop policy if exists "productos_lectura" on public.products;
create policy "productos_lectura"
  on public.products for select using ( true );

drop policy if exists "productos_escritura_staff" on public.products;
create policy "productos_escritura_staff"
  on public.products for all
  using ( public.is_staff_or_admin() )
  with check ( public.is_staff_or_admin() );

-- ----- variants -----
drop policy if exists "variants_lectura" on public.variants;
create policy "variants_lectura"
  on public.variants for select using ( true );

drop policy if exists "variants_escritura_staff" on public.variants;
create policy "variants_escritura_staff"
  on public.variants for all
  using ( public.is_staff_or_admin() )
  with check ( public.is_staff_or_admin() );

-- Vista pública SIN costos para clientes y anon. La UI del cliente sólo
-- consume esta vista; el costo nunca viaja al browser del cliente.
create or replace view public.products_public as
  select id, name, category, price, min_stock, is_active, image_url
    from public.products
   where coalesce(is_active, true) = true;

create or replace view public.variants_public as
  select id, product_id, sku, variant_name, stock, is_active,
         price, price_menudeo, price_medio, price_mayoreo, image_url
    from public.variants
   where coalesce(is_active, true) = true;

grant select on public.products_public to anon, authenticated;
grant select on public.variants_public to anon, authenticated;

-- ----- sales (admin/staff todo; cliente sólo lo suyo) -----
drop policy if exists "sales_staff_full" on public.sales;
create policy "sales_staff_full"
  on public.sales for all
  using ( public.is_staff_or_admin() )
  with check ( public.is_staff_or_admin() );

drop policy if exists "sales_cliente_propias" on public.sales;
create policy "sales_cliente_propias"
  on public.sales for select
  using ( customer_email = auth.email() );

drop policy if exists "sales_cliente_crear" on public.sales;
create policy "sales_cliente_crear"
  on public.sales for insert
  with check (
    customer_email = auth.email()
    and public.current_role() in ('client','staff','admin')
  );

-- ----- sale_items -----
drop policy if exists "sale_items_staff_full" on public.sale_items;
create policy "sale_items_staff_full"
  on public.sale_items for all
  using ( public.is_staff_or_admin() )
  with check ( public.is_staff_or_admin() );

drop policy if exists "sale_items_cliente_lectura" on public.sale_items;
create policy "sale_items_cliente_lectura"
  on public.sale_items for select
  using (
    exists (
      select 1 from public.sales s
       where s.id = sale_items.sale_id
         and s.customer_email = auth.email()
    )
  );

drop policy if exists "sale_items_cliente_crear" on public.sale_items;
create policy "sale_items_cliente_crear"
  on public.sale_items for insert
  with check (
    exists (
      select 1 from public.sales s
       where s.id = sale_items.sale_id
         and s.customer_email = auth.email()
    )
  );

-- ----- payments -----
drop policy if exists "payments_staff_full" on public.payments;
create policy "payments_staff_full"
  on public.payments for all
  using ( public.is_staff_or_admin() )
  with check ( public.is_staff_or_admin() );

drop policy if exists "payments_cliente_lectura" on public.payments;
create policy "payments_cliente_lectura"
  on public.payments for select
  using (
    exists (
      select 1 from public.sales s
       where s.id = payments.sale_id
         and s.customer_email = auth.email()
    )
  );

-- ----- movements (sólo staff/admin) -----
drop policy if exists "movements_staff_full" on public.movements;
create policy "movements_staff_full"
  on public.movements for all
  using ( public.is_staff_or_admin() )
  with check ( public.is_staff_or_admin() );

-- ---------------------------------------------------------------------
-- 5. RPC PÚBLICA: get_public_ticket(token)
--    Permite ver un recibo por token sin estar logueado.
--    SECURITY DEFINER → bypasa RLS pero sólo expone columnas seguras.
-- ---------------------------------------------------------------------
create or replace function public.get_public_ticket(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale jsonb;
begin
  select jsonb_build_object(
    'id',              s.id,
    'public_token',    s.public_token,
    'customer_name',   s.customer_name,
    'customer_phone',  s.customer_phone,
    'total',           s.total,
    'paid',            s.paid,
    'balance',         s.balance,
    'status',          s.status,
    'is_layaway',      s.is_layaway,
    'payment_url',     s.payment_url,
    'notes',           s.notes,
    'created_at',      s.created_at,
    'items', coalesce((
       select jsonb_agg(jsonb_build_object(
         'id',           i.id,
         'product_name', i.product_name,
         'variant_name', i.variant_name,
         'qty',          i.qty,
         'unit_price',   i.unit_price,
         'tier',         i.tier
       ) order by i.id)
       from public.sale_items i where i.sale_id = s.id
    ), '[]'::jsonb),
    'payments', coalesce((
       select jsonb_agg(jsonb_build_object(
         'amount',     p.amount,
         'method',     p.method,
         'created_at', p.created_at
       ) order by p.created_at)
       from public.payments p where p.sale_id = s.id
    ), '[]'::jsonb)
  ) into v_sale
  from public.sales s
  where s.public_token = p_token;

  return v_sale;
end;
$$;

grant execute on function public.get_public_ticket(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- FIN
-- ---------------------------------------------------------------------
