-- =====================================================================
--  MARI INVENTARIO — ESQUEMA BASE (v2)
--  Ejecutar en: Supabase Dashboard → SQL Editor → New query
--  Idempotente: puedes correrlo varias veces sin romper nada.
-- =====================================================================

-- ---------- Extensiones ----------
create extension if not exists "pgcrypto";

-- =====================================================================
--  1. PRODUCTOS + VARIANTES
-- =====================================================================
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,
  cost        numeric(12,2) default 0,
  min_stock   integer default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.variants (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_name    text not null,
  sku             text unique,
  stock           integer not null default 0,
  cost_override   numeric(12,2),                -- si null, usa products.cost
  price           numeric(12,2) not null default 0,  -- precio actual (legacy / default)
  price_menudeo   numeric(12,2) not null default 0,
  price_medio     numeric(12,2) not null default 0,
  price_mayoreo   numeric(12,2) not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists ix_variants_product on public.variants(product_id);
create index if not exists ix_variants_active  on public.variants(is_active);

-- =====================================================================
--  2. CONFIGURACIÓN DE PRECIOS (singleton id=1)
-- =====================================================================
create table if not exists public.pricing_config (
  id              integer primary key default 1,
  margen_menudeo  numeric(6,2) not null default 30,
  margen_medio    numeric(6,2) not null default 25,
  margen_mayoreo  numeric(6,2) not null default 20,
  umbral_medio    integer       not null default 6,
  umbral_mayoreo  integer       not null default 12,
  costo_extra     numeric(12,2) not null default 0,
  created_at      timestamptz   not null default now(),
  constraint pricing_config_single check (id = 1)
);

insert into public.pricing_config (id) values (1)
on conflict (id) do nothing;

-- =====================================================================
--  3. PAQUETES (BUNDLES)
--  Un bundle es una colección de variantes que se vende como uno solo.
--  Las "quantity" de cada componente cuentan como piezas para mayoreo.
-- =====================================================================
create table if not exists public.bundles (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  description     text,
  price           numeric(12,2) not null default 0,
  counts_as_wholesale boolean not null default true, -- si true: las piezas internas cuentan para tiers
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table if not exists public.bundle_items (
  id          uuid primary key default gen_random_uuid(),
  bundle_id   uuid not null references public.bundles(id) on delete cascade,
  variant_id  uuid not null references public.variants(id) on delete restrict,
  qty         integer not null default 1 check (qty > 0)
);

create index if not exists ix_bundle_items_bundle on public.bundle_items(bundle_id);

-- =====================================================================
--  4. VENTAS
-- =====================================================================
create table if not exists public.sales (
  id            uuid primary key default gen_random_uuid(),
  customer_name text,
  total         numeric(12,2) not null default 0,
  paid          numeric(12,2) not null default 0,
  balance       numeric(12,2) not null default 0,
  status        text not null default 'paid' check (status in ('paid','pending','cancelled')),
  created_at    timestamptz not null default now()
);

create table if not exists public.sale_items (
  id             uuid primary key default gen_random_uuid(),
  sale_id        uuid not null references public.sales(id) on delete cascade,
  variant_id     uuid references public.variants(id) on delete set null,
  product_id     uuid references public.products(id) on delete set null,
  bundle_id      uuid references public.bundles(id)  on delete set null,
  product_name   text,
  variant_name   text,
  qty            integer not null check (qty > 0),
  tier           text not null default 'menudeo' check (tier in ('menudeo','medio','mayoreo')),
  unit_price     numeric(12,2) not null,
  cost_snapshot  numeric(12,2) not null default 0,
  profit         numeric(12,2) not null default 0,
  is_bundle      boolean not null default false
);

create index if not exists ix_sale_items_sale on public.sale_items(sale_id);

create table if not exists public.payments (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid not null references public.sales(id) on delete cascade,
  amount     numeric(12,2) not null,
  method     text default 'efectivo',
  created_at timestamptz not null default now()
);

-- =====================================================================
--  5. MOVIMIENTOS DE INVENTARIO
-- =====================================================================
create table if not exists public.movements (
  id          uuid primary key default gen_random_uuid(),
  variant_id  uuid references public.variants(id) on delete set null,
  product_id  uuid references public.products(id) on delete set null,
  sale_id     uuid references public.sales(id)    on delete set null,
  type        text not null check (type in ('entrada','salida','ajuste')),
  quantity    integer not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists ix_movements_variant on public.movements(variant_id);
create index if not exists ix_movements_date    on public.movements(created_at desc);

-- =====================================================================
--  6. HISTORIAL DE OPERACIONES DE PRICING
-- =====================================================================
create table if not exists public.pricing_operations (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid references public.products(id) on delete set null,
  variant_id             uuid references public.variants(id) on delete set null,
  product_name_snapshot  text,
  variant_name_snapshot  text,
  quantity               integer not null default 0,
  extra_cost             numeric(12,2) not null default 0,
  cost_unit              numeric(12,2) not null default 0,
  cost_final             numeric(12,2) not null default 0,
  price_menudeo          numeric(12,2) not null default 0,
  price_medio            numeric(12,2) not null default 0,
  price_mayoreo          numeric(12,2) not null default 0,
  price_applied          numeric(12,2) not null default 0,
  margin_percent         numeric(8,2)  not null default 0,
  tier                   text not null default 'menudeo' check (tier in ('menudeo','medio','mayoreo')),
  total                  numeric(12,2) not null default 0,
  created_at             timestamptz not null default now()
);

create index if not exists ix_pricing_ops_date on public.pricing_operations(created_at desc);

-- =====================================================================
--  RLS — abierto para anon (uso interno, sin login)
--  ⚠️ Si más adelante quieres login, basta cambiar las policies.
-- =====================================================================
alter table public.products            enable row level security;
alter table public.variants            enable row level security;
alter table public.pricing_config      enable row level security;
alter table public.bundles             enable row level security;
alter table public.bundle_items        enable row level security;
alter table public.sales               enable row level security;
alter table public.sale_items          enable row level security;
alter table public.payments            enable row level security;
alter table public.movements           enable row level security;
alter table public.pricing_operations  enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'products','variants','pricing_config','bundles','bundle_items',
    'sales','sale_items','payments','movements','pricing_operations'
  ])
  loop
    execute format('drop policy if exists "anon_all" on public.%I', t);
    execute format(
      'create policy "anon_all" on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end$$;
