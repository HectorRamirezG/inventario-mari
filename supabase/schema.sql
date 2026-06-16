create extension if not exists "pgcrypto";

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'client' check (role in ('admin','staff','client','anon')),
  avatar_url text,
  phone text,
  address text,
  location_url text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.user_profiles where id = auth.uid()), false);
$$;

create or replace function public.is_staff_or_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','staff') from public.user_profiles where id = auth.uid()), false);
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'client')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  cost numeric(12,2),
  price numeric(12,2),
  min_stock integer default 0,
  is_active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now()
);
create index on public.products (is_active);
create index on public.products (category);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_name text not null,
  sku text,
  stock integer not null default 0,
  is_active boolean not null default true,
  cost_override numeric(12,2),
  price numeric(12,2),
  price_menudeo numeric(12,2),
  price_medio numeric(12,2),
  price_mayoreo numeric(12,2),
  image_url text,
  image_urls jsonb default '[]'::jsonb
);
create index on public.variants (product_id);
create index on public.variants (is_active);
create unique index on public.variants (sku) where sku is not null;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  customer_phone text,
  customer_email text,
  customer_address text,
  customer_location text,
  payment_url text,
  public_token text unique default replace(gen_random_uuid()::text,'-',''),
  notes text,
  is_layaway boolean not null default false,
  total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','cancelled')),
  adjustment_amount numeric(12,2),
  adjustment_reason text,
  shipping_amount numeric(12,2) default 0,
  is_foreign_shipping boolean default false,
  created_at timestamptz not null default now()
);
create index on public.sales (status);
create index on public.sales (customer_email);
create index on public.sales (created_at desc);
create index on public.sales (public_token);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  variant_id uuid references public.variants(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  product_name text,
  variant_name text,
  qty integer not null,
  tier text not null default 'menudeo' check (tier in ('menudeo','medio','mayoreo')),
  unit_price numeric(12,2) not null default 0,
  cost_snapshot numeric(12,2) not null default 0,
  profit numeric(12,2) not null default 0,
  is_bundle boolean not null default false
);
create index on public.sale_items (sale_id);
create index on public.sale_items (variant_id);
create index on public.sale_items (product_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  amount numeric(12,2) not null,
  method text,
  created_at timestamptz not null default now()
);
create index on public.payments (sale_id);
create index on public.payments (created_at desc);

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.variants(id) on delete set null,
  type text not null check (type in ('entrada','salida','ajuste','devolucion')),
  quantity integer not null,
  sale_id uuid references public.sales(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index on public.movements (variant_id);
create index on public.movements (sale_id);
create index on public.movements (created_at desc);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  customer_email text,
  image_url text not null,
  amount numeric(12,2),
  method text,
  reference text,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.payment_proofs (sale_id);
create index on public.payment_proofs (status);
create index on public.payment_proofs (created_at desc);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete set null,
  customer_name text,
  customer_email text,
  customer_phone text,
  category text,
  description text not null,
  image_url text,
  status text not null default 'open',
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.support_tickets (sale_id);
create index on public.support_tickets (status);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_email text,
  recipient_role text check (recipient_role in ('admin','staff','client')),
  type text not null,
  title text not null,
  body text,
  link text,
  metadata jsonb default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (recipient_email);
create index on public.notifications (created_at desc);

create table public.pricing_config (
  id integer primary key default 1,
  margen_menudeo numeric(6,2) not null default 60,
  margen_medio numeric(6,2) not null default 40,
  margen_mayoreo numeric(6,2) not null default 25,
  umbral_medio integer not null default 6,
  umbral_mayoreo integer not null default 12,
  costo_extra numeric(12,2) not null default 0,
  constraint pricing_config_singleton check (id = 1)
);
insert into public.pricing_config (id) values (1) on conflict (id) do nothing;

create table public.pricing_operations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.variants(id) on delete set null,
  product_name_snapshot text,
  variant_name_snapshot text,
  quantity integer,
  extra_cost numeric(12,2),
  tier text check (tier in ('menudeo','medio','mayoreo')),
  cost_unit numeric(12,2),
  cost_final numeric(12,2),
  price_menudeo numeric(12,2),
  price_medio numeric(12,2),
  price_mayoreo numeric(12,2),
  price_applied numeric(12,2),
  total numeric(12,2),
  margin_percent numeric(6,2),
  created_at timestamptz not null default now()
);
create index on public.pricing_operations (created_at desc);

create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.inventory_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'open' check (status in ('open','closed')),
  started_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_inventory_cost numeric(14,2) not null default 0,
  new_lot_cost numeric(14,2) not null default 0,
  closing_inventory_cost numeric(14,2),
  total_revenue numeric(14,2) not null default 0,
  total_cogs numeric(14,2) not null default 0,
  total_expenses numeric(14,2) not null default 0,
  break_even_at timestamptz,
  net_profit numeric(14,2),
  notes text,
  created_at timestamptz not null default now()
);
create unique index only_one_open_cycle on public.inventory_cycles (status) where status = 'open';

create table public.capital_injections (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.inventory_cycles(id) on delete cascade,
  amount numeric(14,2) not null,
  description text,
  created_at timestamptz not null default now()
);
create index on public.capital_injections (cycle_id);

create table public.operating_expenses (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.inventory_cycles(id) on delete cascade,
  category text not null,
  amount numeric(14,2) not null,
  description text,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index on public.operating_expenses (cycle_id);

create or replace function public.decrease_variant_stock(p_variant_id uuid, p_qty integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_new integer;
begin
  update public.variants set stock = stock - p_qty where id = p_variant_id returning stock into v_new;
  if v_new is null then raise exception 'Variante no encontrada'; end if;
  return v_new;
end; $$;

create or replace function public.apply_movement(p_variant_id uuid, p_type text, p_qty integer)
returns integer language plpgsql security definer set search_path = public as $$
declare v_delta integer; v_new integer; v_product uuid;
begin
  select product_id into v_product from public.variants where id = p_variant_id;
  if v_product is null then raise exception 'Variante no encontrada'; end if;
  if p_type in ('entrada','devolucion') then v_delta := p_qty;
  elsif p_type = 'salida' then v_delta := -p_qty;
  elsif p_type = 'ajuste' then v_delta := p_qty;
  else raise exception 'Tipo de movimiento inválido: %', p_type;
  end if;
  update public.variants set stock = stock + v_delta where id = p_variant_id returning stock into v_new;
  insert into public.movements (product_id, variant_id, type, quantity) values (v_product, p_variant_id, p_type, p_qty);
  return v_new;
end; $$;

create or replace function public.create_sale_atomic(payload jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_sale_id uuid; v_item jsonb; v_paid numeric; v_balance numeric; v_total numeric;
begin
  v_total := coalesce((payload->>'total')::numeric, 0);
  v_paid := coalesce((payload->>'paid')::numeric, 0);
  v_balance := coalesce((payload->>'balance')::numeric, v_total - v_paid);
  insert into public.sales (customer_name, customer_phone, customer_email, customer_address, customer_location,
    payment_url, notes, is_layaway, total, paid, balance, status, shipping_amount, is_foreign_shipping)
  values (
    payload->>'customer_name', payload->>'customer_phone', payload->>'customer_email',
    payload->>'customer_address', payload->>'customer_location', payload->>'payment_url',
    payload->>'notes', coalesce((payload->>'is_layaway')::boolean, false),
    v_total, v_paid, v_balance,
    case when v_balance > 0 then 'pending' else 'paid' end,
    coalesce((payload->>'shipping_amount')::numeric, 0),
    coalesce((payload->>'is_foreign_shipping')::boolean, false)
  ) returning id into v_sale_id;
  for v_item in select * from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop
    insert into public.sale_items (sale_id, variant_id, product_id, product_name, variant_name, qty, tier, unit_price, cost_snapshot, profit, is_bundle)
    values (v_sale_id,
      nullif(v_item->>'variant_id','')::uuid,
      nullif(v_item->>'product_id','')::uuid,
      v_item->>'product_name', v_item->>'variant_name',
      (v_item->>'qty')::integer, coalesce(v_item->>'tier','menudeo'),
      (v_item->>'unit_price')::numeric, coalesce((v_item->>'cost_snapshot')::numeric,0),
      coalesce((v_item->>'profit')::numeric,0), coalesce((v_item->>'is_bundle')::boolean,false));
    perform public.apply_movement(nullif(v_item->>'variant_id','')::uuid, 'salida', (v_item->>'qty')::integer);
    update public.movements set sale_id = v_sale_id
      where id = (select id from public.movements where variant_id = nullif(v_item->>'variant_id','')::uuid order by created_at desc limit 1);
  end loop;
  if v_paid > 0 then
    insert into public.payments (sale_id, amount, method) values (v_sale_id, v_paid, payload->>'payment_method');
  end if;
  return v_sale_id;
end; $$;

create or replace function public.restock_on_sale_cancelled() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for r in select variant_id, qty from public.sale_items where sale_id = new.id and variant_id is not null loop
      update public.variants set stock = stock + r.qty where id = r.variant_id;
      insert into public.movements (variant_id, type, quantity, sale_id, note)
      values (r.variant_id, 'devolucion', r.qty, new.id, 'Cancelación de venta');
    end loop;
  end if;
  return new;
end; $$;

drop trigger if exists trg_restock_on_sale_cancelled on public.sales;
create trigger trg_restock_on_sale_cancelled after update on public.sales
  for each row execute function public.restock_on_sale_cancelled();

create or replace function public.recalc_sale_totals(p_sale_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_paid numeric; v_total numeric;
begin
  select coalesce(sum(amount),0) into v_paid from public.payments where sale_id = p_sale_id;
  select total into v_total from public.sales where id = p_sale_id;
  update public.sales set paid = v_paid,
    balance = greatest(v_total - coalesce((select adjustment_amount from public.sales where id = p_sale_id),0) - v_paid, 0),
    status = case when v_paid >= v_total - coalesce((select adjustment_amount from public.sales where id = p_sale_id),0) then 'paid' else status end
  where id = p_sale_id and status <> 'cancelled';
end; $$;

create or replace function public.admin_adjust_sale(p_sale_id uuid, p_adjustment numeric, p_reason text, p_force_tier text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_paid numeric; v_balance numeric;
begin
  if not public.is_staff_or_admin() then raise exception 'No autorizado'; end if;
  update public.sales set adjustment_amount = p_adjustment, adjustment_reason = p_reason where id = p_sale_id
    returning total, paid into v_total, v_paid;
  v_balance := greatest(v_total - coalesce(p_adjustment,0) - coalesce(v_paid,0), 0);
  update public.sales set balance = v_balance,
    status = case when v_balance <= 0 then 'paid' else 'pending' end
  where id = p_sale_id and status <> 'cancelled';
  return jsonb_build_object('sale_id', p_sale_id, 'total', v_total, 'paid', v_paid, 'balance', v_balance, 'adjustment', p_adjustment);
end; $$;

create or replace function public.add_sale_payment(p_sale_id uuid, p_amount numeric, p_method text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.payments (sale_id, amount, method) values (p_sale_id, p_amount, p_method) returning id into v_id;
  perform public.recalc_sale_totals(p_sale_id);
  return v_id;
end; $$;

create or replace function public.approve_payment_proof(p_proof_id uuid, p_amount numeric default null, p_method text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sale uuid; v_amount numeric; v_method text;
begin
  if not public.is_staff_or_admin() then raise exception 'No autorizado'; end if;
  select sale_id, coalesce(p_amount, amount), coalesce(p_method, method)
    into v_sale, v_amount, v_method
    from public.payment_proofs where id = p_proof_id;
  if v_sale is null then raise exception 'Comprobante no encontrado'; end if;
  update public.payment_proofs
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(),
        amount = v_amount, method = v_method
    where id = p_proof_id;
  perform public.add_sale_payment(v_sale, v_amount, v_method);
  return jsonb_build_object('proof_id', p_proof_id, 'sale_id', v_sale, 'amount', v_amount);
end; $$;

create or replace function public.reject_payment_proof(p_proof_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_or_admin() then raise exception 'No autorizado'; end if;
  update public.payment_proofs
    set status = 'rejected', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_proof_id;
end; $$;

create or replace function public.create_support_ticket(p_sale_id uuid, p_category text, p_description text, p_image_url text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text; v_email text; v_phone text;
begin
  select customer_name, customer_email, customer_phone into v_name, v_email, v_phone
    from public.sales where id = p_sale_id;
  insert into public.support_tickets (sale_id, customer_name, customer_email, customer_phone, category, description, image_url, status)
  values (p_sale_id, v_name, v_email, v_phone, p_category, p_description, p_image_url, 'open')
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.update_support_ticket_status(p_ticket_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_or_admin() then raise exception 'No autorizado'; end if;
  update public.support_tickets
    set status = p_status,
        resolved_at = case when p_status in ('resolved','closed') then now() else resolved_at end,
        resolved_by = case when p_status in ('resolved','closed') then auth.uid() else resolved_by end
    where id = p_ticket_id;
end; $$;

create or replace function public.get_public_ticket(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sale jsonb;
begin
  select jsonb_build_object(
    'sale', to_jsonb(s.*),
    'items', coalesce((select jsonb_agg(to_jsonb(si.*)) from public.sale_items si where si.sale_id = s.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(p.*) order by p.created_at) from public.payments p where p.sale_id = s.id), '[]'::jsonb)
  ) into v_sale
  from public.sales s where s.public_token = p_token;
  return v_sale;
end; $$;

create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = public as $$
declare v_email text; v_count integer;
begin
  select email into v_email from auth.users where id = auth.uid();
  update public.notifications set read_at = now()
    where read_at is null and recipient_email = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

create or replace function public.cycle_snapshot(p_cycle_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cycle public.inventory_cycles%rowtype; v_revenue numeric; v_cogs numeric; v_expenses numeric; v_injections numeric; v_inventory numeric;
begin
  select * into v_cycle from public.inventory_cycles where id = p_cycle_id;
  if v_cycle.id is null then raise exception 'Ciclo no encontrado'; end if;
  select coalesce(sum(s.total - coalesce(s.adjustment_amount,0)),0) into v_revenue
    from public.sales s where s.status <> 'cancelled' and s.created_at >= v_cycle.started_at
      and (v_cycle.closed_at is null or s.created_at <= v_cycle.closed_at);
  select coalesce(sum(si.cost_snapshot * si.qty),0) into v_cogs
    from public.sale_items si join public.sales s on s.id = si.sale_id
    where s.status <> 'cancelled' and s.created_at >= v_cycle.started_at
      and (v_cycle.closed_at is null or s.created_at <= v_cycle.closed_at);
  select coalesce(sum(amount),0) into v_expenses from public.operating_expenses where cycle_id = p_cycle_id;
  select coalesce(sum(amount),0) into v_injections from public.capital_injections where cycle_id = p_cycle_id;
  select coalesce(sum(coalesce(v.cost_override, p.cost, 0) * v.stock),0) into v_inventory
    from public.variants v join public.products p on p.id = v.product_id where v.is_active = true;
  return jsonb_build_object(
    'cycle', to_jsonb(v_cycle),
    'revenue', v_revenue, 'cogs', v_cogs, 'gross_profit', v_revenue - v_cogs,
    'expenses', v_expenses, 'capital_injections', v_injections,
    'current_inventory_cost', v_inventory,
    'net_profit', v_revenue - v_cogs - v_expenses
  );
end; $$;

create or replace function public.open_cycle(p_name text, p_new_lot_cost numeric, p_opening_inventory_cost numeric, p_notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  if exists (select 1 from public.inventory_cycles where status = 'open') then
    raise exception 'Ya existe un ciclo abierto';
  end if;
  insert into public.inventory_cycles (name, status, new_lot_cost, opening_inventory_cost, notes)
  values (p_name, 'open', coalesce(p_new_lot_cost,0), coalesce(p_opening_inventory_cost,0), p_notes)
  returning id into v_id;
  return v_id;
end; $$;

create or replace function public.close_cycle(p_cycle_id uuid, p_closing_inventory_cost numeric, p_open_next text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_snap jsonb; v_next uuid;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  v_snap := public.cycle_snapshot(p_cycle_id);
  update public.inventory_cycles
    set status = 'closed', closed_at = now(),
        closing_inventory_cost = p_closing_inventory_cost,
        total_revenue = (v_snap->>'revenue')::numeric,
        total_cogs = (v_snap->>'cogs')::numeric,
        total_expenses = (v_snap->>'expenses')::numeric,
        net_profit = (v_snap->>'net_profit')::numeric
    where id = p_cycle_id;
  if p_open_next is not null and length(p_open_next) > 0 then
    insert into public.inventory_cycles (name, status, opening_inventory_cost)
    values (p_open_next, 'open', p_closing_inventory_cost) returning id into v_next;
  end if;
  return jsonb_build_object('closed', p_cycle_id, 'next', v_next, 'snapshot', v_snap);
end; $$;

alter table public.user_profiles enable row level security;
alter table public.products enable row level security;
alter table public.variants enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.movements enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.support_tickets enable row level security;
alter table public.notifications enable row level security;
alter table public.pricing_config enable row level security;
alter table public.pricing_operations enable row level security;
alter table public.app_settings enable row level security;
alter table public.inventory_cycles enable row level security;
alter table public.capital_injections enable row level security;
alter table public.operating_expenses enable row level security;

create policy "profiles_self_select" on public.user_profiles for select using (auth.uid() = id or public.is_staff_or_admin());
create policy "profiles_self_update" on public.user_profiles for update using (auth.uid() = id or public.is_admin());
create policy "profiles_insert" on public.user_profiles for insert with check (auth.uid() = id or public.is_admin());
create policy "profiles_admin_delete" on public.user_profiles for delete using (public.is_admin());

create policy "products_read_all" on public.products for select using (true);
create policy "products_write_staff" on public.products for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "variants_read_all" on public.variants for select using (true);
create policy "variants_write_staff" on public.variants for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "sales_read" on public.sales for select using (
  public.is_staff_or_admin()
  or customer_email = (select email from auth.users where id = auth.uid())
);
create policy "sales_insert" on public.sales for insert with check (
  public.is_staff_or_admin()
  or customer_email = (select email from auth.users where id = auth.uid())
);
create policy "sales_update_staff" on public.sales for update using (public.is_staff_or_admin());
create policy "sales_delete_staff" on public.sales for delete using (public.is_admin());

create policy "sale_items_read" on public.sale_items for select using (
  public.is_staff_or_admin()
  or exists (select 1 from public.sales s where s.id = sale_id and s.customer_email = (select email from auth.users where id = auth.uid()))
);
create policy "sale_items_write_staff" on public.sale_items for all using (
  public.is_staff_or_admin()
  or exists (select 1 from public.sales s where s.id = sale_id and s.customer_email = (select email from auth.users where id = auth.uid()))
) with check (
  public.is_staff_or_admin()
  or exists (select 1 from public.sales s where s.id = sale_id and s.customer_email = (select email from auth.users where id = auth.uid()))
);

create policy "payments_read" on public.payments for select using (
  public.is_staff_or_admin()
  or exists (select 1 from public.sales s where s.id = sale_id and s.customer_email = (select email from auth.users where id = auth.uid()))
);
create policy "payments_write_staff" on public.payments for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "movements_staff" on public.movements for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "payment_proofs_read" on public.payment_proofs for select using (
  public.is_staff_or_admin()
  or customer_email = (select email from auth.users where id = auth.uid())
);
create policy "payment_proofs_insert" on public.payment_proofs for insert with check (
  public.is_staff_or_admin()
  or customer_email = (select email from auth.users where id = auth.uid())
);
create policy "payment_proofs_update_staff" on public.payment_proofs for update using (public.is_staff_or_admin());

create policy "support_read" on public.support_tickets for select using (
  public.is_staff_or_admin()
  or customer_email = (select email from auth.users where id = auth.uid())
);
create policy "support_insert" on public.support_tickets for insert with check (
  public.is_staff_or_admin()
  or customer_email = (select email from auth.users where id = auth.uid())
  or customer_email is not null
);
create policy "support_update_staff" on public.support_tickets for update using (public.is_staff_or_admin());

create policy "notifications_read" on public.notifications for select using (
  public.is_staff_or_admin()
  or recipient_email = (select email from auth.users where id = auth.uid())
);
create policy "notifications_update_own" on public.notifications for update using (
  public.is_staff_or_admin()
  or recipient_email = (select email from auth.users where id = auth.uid())
);
create policy "notifications_insert_staff" on public.notifications for insert with check (public.is_staff_or_admin());
create policy "notifications_delete_own" on public.notifications for delete using (
  public.is_staff_or_admin()
  or recipient_email = (select email from auth.users where id = auth.uid())
);

create policy "pricing_config_read" on public.pricing_config for select using (true);
create policy "pricing_config_write" on public.pricing_config for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "pricing_ops_staff" on public.pricing_operations for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "app_settings_read" on public.app_settings for select using (true);
create policy "app_settings_write" on public.app_settings for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "cycles_admin" on public.inventory_cycles for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());
create policy "injections_admin" on public.capital_injections for all using (public.is_admin()) with check (public.is_admin());
create policy "expenses_admin" on public.operating_expenses for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

grant usage on schema public to anon, authenticated;
grant select on public.products, public.variants, public.pricing_config, public.app_settings to anon, authenticated;
grant select, insert, update, delete on
  public.user_profiles, public.products, public.variants, public.sales, public.sale_items,
  public.payments, public.movements, public.payment_proofs, public.support_tickets,
  public.notifications, public.pricing_config, public.pricing_operations, public.app_settings,
  public.inventory_cycles, public.capital_injections, public.operating_expenses
  to authenticated;
grant insert on public.payment_proofs, public.support_tickets, public.sales, public.sale_items to anon;
grant select on public.sales, public.sale_items, public.payments to anon;

grant execute on function
  public.is_admin(), public.is_staff_or_admin(),
  public.decrease_variant_stock(uuid, integer),
  public.apply_movement(uuid, text, integer),
  public.create_sale_atomic(jsonb),
  public.admin_adjust_sale(uuid, numeric, text, text),
  public.add_sale_payment(uuid, numeric, text),
  public.approve_payment_proof(uuid, numeric, text),
  public.reject_payment_proof(uuid, text),
  public.create_support_ticket(uuid, text, text, text),
  public.update_support_ticket_status(uuid, text),
  public.get_public_ticket(text),
  public.mark_all_notifications_read(),
  public.cycle_snapshot(uuid),
  public.open_cycle(text, numeric, numeric, text),
  public.close_cycle(uuid, numeric, text),
  public.recalc_sale_totals(uuid)
  to anon, authenticated;

alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.payment_proofs;
alter publication supabase_realtime add table public.notifications;

insert into storage.buckets (id, name, public) values ('product-images','product-images', true)
  on conflict (id) do update set public = true;

create policy "product_images_read" on storage.objects for select using (bucket_id = 'product-images');
create policy "product_images_upload" on storage.objects for insert with check (bucket_id = 'product-images' and auth.role() = 'authenticated');
create policy "product_images_update" on storage.objects for update using (bucket_id = 'product-images' and auth.role() = 'authenticated');
create policy "product_images_delete" on storage.objects for delete using (bucket_id = 'product-images' and (public.is_staff_or_admin() or owner = auth.uid()));

notify pgrst, 'reload schema';
