-- =============================================================
-- 0009 · Ciclos de Inventario (períodos contables)
-- =============================================================
--
-- Implementa el sistema de "ciclos" mensuales/temporada que la
-- dueña usa para saber cuándo recuperó la inversión y cuándo el
-- dinero entrante ya es ganancia neta libre.
--
-- Modelo:
--  1. inventory_cycles       → un ciclo abierto a la vez (lock por índice)
--  2. capital_injections     → dinero extra inyectado a mitad de ciclo
--  3. operating_expenses     → gastos del periodo (luz, sueldos, renta, etc.)
--  4. sales.cycle_id         → cada venta se ata al ciclo abierto
--
-- RPCs:
--  - open_cycle(name, new_lot_cost, opening?, notes?) → uuid
--  - cycle_snapshot(cycle_id) → jsonb  (preview en vivo, no muta)
--  - close_cycle(cycle_id, closing_inv?, open_next?) → jsonb
--
-- IDEMPOTENTE: puedes correrlo varias veces. Después de ejecutarlo,
-- bórralo del repo si quieres.
-- =============================================================


-- ------------------------------------------------------------
-- 1. TABLA: inventory_cycles
-- ------------------------------------------------------------
create table if not exists public.inventory_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'open' check (status in ('open','closed')),
  started_at timestamptz not null default now(),
  closed_at timestamptz,

  -- Inversión inicial (snapshot al abrir)
  opening_inventory_cost numeric(12,2) not null default 0,  -- costo del stock heredado
  new_lot_cost numeric(12,2) not null default 0,            -- compra de mercancía nueva

  -- Cierre (NULL mientras abierto)
  closing_inventory_cost numeric(12,2),
  total_revenue numeric(12,2),
  total_cogs numeric(12,2),
  total_expenses numeric(12,2),
  break_even_at timestamptz,
  net_profit numeric(12,2),

  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Solo puede haber UN ciclo abierto a la vez
create unique index if not exists ux_one_open_cycle
  on public.inventory_cycles (status)
  where status = 'open';


-- ------------------------------------------------------------
-- 2. TABLA: capital_injections
-- ------------------------------------------------------------
create table if not exists public.capital_injections (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.inventory_cycles(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  description text,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists ix_injections_cycle on public.capital_injections(cycle_id);


-- ------------------------------------------------------------
-- 3. TABLA: operating_expenses
-- ------------------------------------------------------------
create table if not exists public.operating_expenses (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.inventory_cycles(id) on delete cascade,
  category text not null,                                    -- 'renta', 'luz', 'sueldos', 'transporte', 'otros'
  amount numeric(12,2) not null check (amount > 0),
  description text,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists ix_expenses_cycle on public.operating_expenses(cycle_id);


-- ------------------------------------------------------------
-- 4. FK en sales → ciclo
-- ------------------------------------------------------------
alter table public.sales
  add column if not exists cycle_id uuid references public.inventory_cycles(id);

create index if not exists ix_sales_cycle on public.sales(cycle_id);


-- ------------------------------------------------------------
-- 5. TRIGGER: auto-asignar venta al ciclo abierto
-- ------------------------------------------------------------
create or replace function public.auto_assign_sale_to_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active uuid;
begin
  if new.cycle_id is null then
    select id into v_active
      from public.inventory_cycles
     where status = 'open'
     limit 1;
    new.cycle_id := v_active;  -- queda null si no hay ciclo, no rompe nada
  end if;
  return new;
end$$;

drop trigger if exists trg_sales_assign_cycle on public.sales;
create trigger trg_sales_assign_cycle
  before insert on public.sales
  for each row execute function public.auto_assign_sale_to_cycle();


-- ------------------------------------------------------------
-- 6. RPC: open_cycle
-- ------------------------------------------------------------
create or replace function public.open_cycle(
  p_name text,
  p_new_lot_cost numeric default 0,
  p_opening_inventory_cost numeric default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_opening numeric(12,2);
  v_cycle uuid;
begin
  if exists (select 1 from public.inventory_cycles where status = 'open') then
    raise exception 'Ya hay un ciclo abierto. Ciérralo antes de abrir otro.';
  end if;

  -- Si no se pasa opening, lo calculamos del stock vivo a costo
  if p_opening_inventory_cost is null then
    select coalesce(sum(
      coalesce(v.stock, 0) *
      coalesce(v.cost_override, p.cost, 0)
    ), 0)
      into v_opening
      from public.variants v
      left join public.products p on p.id = v.product_id
     where coalesce(v.is_active, true) = true;
  else
    v_opening := p_opening_inventory_cost;
  end if;

  insert into public.inventory_cycles (
    name, opening_inventory_cost, new_lot_cost, notes, created_by
  ) values (
    p_name, v_opening, coalesce(p_new_lot_cost, 0), p_notes, auth.uid()
  )
  returning id into v_cycle;

  -- Retroactivo: asignar al nuevo ciclo las ventas SIN ciclo
  -- (solo si el operador quiere; por defecto NO, para no contaminar)
  -- update public.sales set cycle_id = v_cycle where cycle_id is null;

  return v_cycle;
end$$;


-- ------------------------------------------------------------
-- 7. RPC: cycle_snapshot  (preview en vivo, NO muta)
-- ------------------------------------------------------------
create or replace function public.cycle_snapshot(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle inventory_cycles;
  v_total_investment numeric(12,2);
  v_revenue numeric(12,2);
  v_cogs numeric(12,2);
  v_expenses numeric(12,2);
  v_injections numeric(12,2);
  v_current_inv_cost numeric(12,2);
  v_break_even_at timestamptz;
begin
  select * into v_cycle from public.inventory_cycles where id = p_cycle_id;
  if v_cycle.id is null then
    return jsonb_build_object('error', 'ciclo no encontrado');
  end if;

  select coalesce(sum(amount), 0) into v_injections
    from public.capital_injections where cycle_id = p_cycle_id;

  v_total_investment := v_cycle.opening_inventory_cost
                      + v_cycle.new_lot_cost
                      + v_injections;

  -- Revenue = dinero realmente cobrado (paid), no ventas a crédito todavía sin abonar
  select coalesce(sum(s.paid), 0) into v_revenue
    from public.sales s
   where s.cycle_id = p_cycle_id and s.status != 'cancelled';

  -- COGS = costo real de la mercancía vendida (snapshot al momento de la venta)
  select coalesce(sum(si.qty * si.cost_snapshot), 0) into v_cogs
    from public.sales s
    join public.sale_items si on si.sale_id = s.id
   where s.cycle_id = p_cycle_id and s.status != 'cancelled';

  select coalesce(sum(amount), 0) into v_expenses
    from public.operating_expenses where cycle_id = p_cycle_id;

  -- Inventario actual (al momento del snapshot)
  select coalesce(sum(
    coalesce(v.stock, 0) * coalesce(v.cost_override, p.cost, 0)
  ), 0) into v_current_inv_cost
    from public.variants v
    left join public.products p on p.id = v.product_id
   where coalesce(v.is_active, true) = true;

  -- Punto de equilibrio: primera venta cuya suma acumulada de `paid`
  -- alcanza/supera la inversión total.
  with ventas as (
    select s.created_at,
           sum(s.paid) over (order by s.created_at) as cumulative
      from public.sales s
     where s.cycle_id = p_cycle_id and s.status != 'cancelled'
  )
  select created_at into v_break_even_at
    from ventas
   where cumulative >= v_total_investment
   order by created_at
   limit 1;

  return jsonb_build_object(
    'cycle', row_to_json(v_cycle),
    'total_investment', v_total_investment,
    'capital_injections', v_injections,
    'revenue', v_revenue,
    'cogs', v_cogs,
    'expenses', v_expenses,
    'gross_profit', v_revenue - v_cogs,
    'net_profit_projection', v_revenue - v_cogs - v_expenses,
    'current_inventory_cost', v_current_inv_cost,
    'break_even_at', v_break_even_at,
    'break_even_pct', case
      when v_total_investment > 0
      then least(100, round((v_revenue / v_total_investment) * 100, 2))
      else 0
    end,
    'remaining_to_be', greatest(0, v_total_investment - v_revenue)
  );
end$$;


-- ------------------------------------------------------------
-- 8. RPC: close_cycle  (snapshot inmutable + opcionalmente abre next)
-- ------------------------------------------------------------
create or replace function public.close_cycle(
  p_cycle_id uuid,
  p_closing_inventory_cost numeric default null,
  p_open_next text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle inventory_cycles;
  v_snapshot jsonb;
  v_closing numeric(12,2);
  v_next uuid;
begin
  select * into v_cycle from public.inventory_cycles where id = p_cycle_id;
  if v_cycle.id is null then
    raise exception 'Ciclo no encontrado';
  end if;
  if v_cycle.status = 'closed' then
    raise exception 'El ciclo ya está cerrado';
  end if;

  v_snapshot := public.cycle_snapshot(p_cycle_id);

  if p_closing_inventory_cost is null then
    v_closing := (v_snapshot->>'current_inventory_cost')::numeric;
  else
    v_closing := p_closing_inventory_cost;
  end if;

  update public.inventory_cycles set
    status                 = 'closed',
    closed_at              = now(),
    closing_inventory_cost = v_closing,
    total_revenue          = (v_snapshot->>'revenue')::numeric,
    total_cogs             = (v_snapshot->>'cogs')::numeric,
    total_expenses         = (v_snapshot->>'expenses')::numeric,
    break_even_at          = nullif((v_snapshot->>'break_even_at'), '')::timestamptz,
    net_profit             = (v_snapshot->>'revenue')::numeric
                           - (v_snapshot->>'cogs')::numeric
                           - (v_snapshot->>'expenses')::numeric
   where id = p_cycle_id;

  if p_open_next is not null and length(trim(p_open_next)) > 0 then
    v_next := public.open_cycle(
      p_open_next,
      0,
      v_closing,
      'Heredado de ' || v_cycle.name
    );
  end if;

  return jsonb_build_object(
    'cycle_id', p_cycle_id,
    'snapshot', v_snapshot,
    'next_cycle_id', v_next
  );
end$$;


-- ------------------------------------------------------------
-- 9. RLS — solo staff/admin pueden ver/operar ciclos.
-- ------------------------------------------------------------
alter table public.inventory_cycles   enable row level security;
alter table public.capital_injections enable row level security;
alter table public.operating_expenses enable row level security;

-- Helper. Si la 0007 ya creó is_staff_or_admin() usamos esa. Si no,
-- caemos a un fallback inline.
do $$
declare v_has_helper boolean;
begin
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_staff_or_admin'
  ) into v_has_helper;

  if not v_has_helper then
    execute $f$
      create or replace function public.is_staff_or_admin() returns boolean
      language sql stable security definer set search_path = public as $body$
        select coalesce(
          (select role in ('admin','staff')
             from public.user_profiles where id = auth.uid()),
          false
        );
      $body$;
    $f$;
  end if;
end$$;

drop policy if exists "cycles_staff_all"     on public.inventory_cycles;
create policy "cycles_staff_all"
  on public.inventory_cycles
  for all to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists "injections_staff_all" on public.capital_injections;
create policy "injections_staff_all"
  on public.capital_injections
  for all to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists "expenses_staff_all"   on public.operating_expenses;
create policy "expenses_staff_all"
  on public.operating_expenses
  for all to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

grant execute on function public.open_cycle      to authenticated;
grant execute on function public.close_cycle     to authenticated;
grant execute on function public.cycle_snapshot  to authenticated;


-- ------------------------------------------------------------
-- Final
-- ------------------------------------------------------------
do $$ begin
  raise notice '0009: ciclos de inventario listos. Abre tu primer ciclo desde la app.';
end $$;
