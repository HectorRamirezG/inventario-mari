-- =============================================================
-- 0021_create_cycles_and_fix_approve.sql
-- Fecha: 2026-06-15
--
-- Arregla DOS cosas reales que detecté contra el dump completo:
--
--   1️⃣  Crea el módulo "Ciclos" que el frontend (cyclesService.ts +
--       CyclesPage.tsx) usa pero que NO existe en la DB:
--         - tabla inventory_cycles
--         - tabla capital_injections
--         - tabla operating_expenses
--         - RPC open_cycle(p_name, p_new_lot_cost,
--                          p_opening_inventory_cost, p_notes) → uuid
--         - RPC close_cycle(p_cycle_id, p_closing_inventory_cost,
--                           p_open_next) → jsonb
--         - RPC cycle_snapshot(p_cycle_id) → jsonb
--
--   2️⃣  Re-crea approve_payment_proof. La versión actual llama
--       internamente a `add_sale_payment(...)` que NO existe en la
--       DB → cualquier "aprobar comprobante" desde admin truena.
--       La nueva versión hace INSERT en payments + UPDATE de
--       sales.paid/balance/status inline (sin RPC inexistente).
--
-- Es 100% idempotente. Al final NOTIFY pgrst reload schema.
-- =============================================================

begin;

-- ─────────────────────────────────────────────────────────────
-- 1) Tabla inventory_cycles
-- ─────────────────────────────────────────────────────────────
create table if not exists public.inventory_cycles (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  status                  text not null default 'open'
                            check (status in ('open','closed')),
  started_at              timestamptz not null default now(),
  closed_at               timestamptz,
  opening_inventory_cost  numeric(14,2) not null default 0,
  new_lot_cost            numeric(14,2) not null default 0,
  closing_inventory_cost  numeric(14,2),
  total_revenue           numeric(14,2),
  total_cogs              numeric(14,2),
  total_expenses          numeric(14,2),
  break_even_at           timestamptz,
  net_profit              numeric(14,2),
  notes                   text,
  created_at              timestamptz not null default now()
);

create unique index if not exists ux_inventory_cycles_one_open
  on public.inventory_cycles (status)
  where status = 'open';

alter table public.inventory_cycles enable row level security;
do $$ begin
  create policy inventory_cycles_anon_all on public.inventory_cycles
    for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;


-- ─────────────────────────────────────────────────────────────
-- 2) Tabla capital_injections
-- ─────────────────────────────────────────────────────────────
create table if not exists public.capital_injections (
  id          uuid primary key default gen_random_uuid(),
  cycle_id    uuid not null references public.inventory_cycles(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  description text,
  created_at  timestamptz not null default now()
);

create index if not exists ix_capital_injections_cycle
  on public.capital_injections (cycle_id);

alter table public.capital_injections enable row level security;
do $$ begin
  create policy capital_injections_anon_all on public.capital_injections
    for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;


-- ─────────────────────────────────────────────────────────────
-- 3) Tabla operating_expenses
-- ─────────────────────────────────────────────────────────────
create table if not exists public.operating_expenses (
  id          uuid primary key default gen_random_uuid(),
  cycle_id    uuid not null references public.inventory_cycles(id) on delete cascade,
  category    text not null,
  amount      numeric(14,2) not null check (amount > 0),
  description text,
  occurred_on date not null default current_date,
  created_at  timestamptz not null default now()
);

create index if not exists ix_operating_expenses_cycle
  on public.operating_expenses (cycle_id, occurred_on desc);

alter table public.operating_expenses enable row level security;
do $$ begin
  create policy operating_expenses_anon_all on public.operating_expenses
    for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;


-- ─────────────────────────────────────────────────────────────
-- 4) RPC open_cycle
-- ─────────────────────────────────────────────────────────────
create or replace function public.open_cycle(
  p_name                    text,
  p_new_lot_cost            numeric default 0,
  p_opening_inventory_cost  numeric default null,
  p_notes                   text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id      uuid;
  v_opening numeric;
begin
  if not public.is_staff_or_admin() then
    raise exception 'Solo admin/staff puede abrir un ciclo';
  end if;

  -- Si ya hay uno abierto, lo cerramos virtualmente primero (snapshot)
  if exists (select 1 from public.inventory_cycles where status = 'open') then
    raise exception 'Ya hay un ciclo abierto. Ciérralo antes de abrir otro.';
  end if;

  -- opening_inventory_cost: si no lo dieron, calculamos desde inventario actual
  if p_opening_inventory_cost is null then
    select coalesce(sum(
             v.stock * coalesce(v.cost_override, p.cost, 0)
           ), 0)
      into v_opening
    from public.variants v
    join public.products p on p.id = v.product_id
    where v.is_active = true and p.is_active = true;
  else
    v_opening := p_opening_inventory_cost;
  end if;

  insert into public.inventory_cycles (
    name, status, started_at,
    opening_inventory_cost, new_lot_cost, notes
  ) values (
    coalesce(nullif(btrim(p_name), ''), 'Ciclo ' || to_char(now(),'YYYY-MM-DD')),
    'open', now(),
    coalesce(v_opening, 0), coalesce(p_new_lot_cost, 0), p_notes
  )
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.open_cycle(text, numeric, numeric, text)
  to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 5) RPC cycle_snapshot
-- ─────────────────────────────────────────────────────────────
create or replace function public.cycle_snapshot(p_cycle_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cycle           public.inventory_cycles;
  v_to              timestamptz;
  v_revenue         numeric := 0;
  v_cogs            numeric := 0;
  v_expenses        numeric := 0;
  v_injections      numeric := 0;
  v_inventory_cost  numeric := 0;
  v_total_invest    numeric;
  v_gross           numeric;
  v_net_proj        numeric;
  v_be_pct          numeric;
  v_remaining       numeric;
  v_be_at           timestamptz;
begin
  select * into v_cycle from public.inventory_cycles where id = p_cycle_id;
  if not found then raise exception 'Ciclo no encontrado'; end if;

  v_to := coalesce(v_cycle.closed_at, now());

  -- Ingresos: ventas no canceladas del rango
  select coalesce(sum(s.total), 0)
    into v_revenue
  from public.sales s
  where s.created_at >= v_cycle.started_at
    and s.created_at <= v_to
    and s.status <> 'cancelled';

  -- COGS: costos vendidos (qty * cost_snapshot) de esas ventas
  select coalesce(sum(si.qty * si.cost_snapshot), 0)
    into v_cogs
  from public.sale_items si
  join public.sales s on s.id = si.sale_id
  where s.created_at >= v_cycle.started_at
    and s.created_at <= v_to
    and s.status <> 'cancelled';

  -- Gastos operativos del ciclo
  select coalesce(sum(amount), 0)
    into v_expenses
  from public.operating_expenses
  where cycle_id = p_cycle_id;

  -- Inyecciones de capital
  select coalesce(sum(amount), 0)
    into v_injections
  from public.capital_injections
  where cycle_id = p_cycle_id;

  -- Costo del inventario actual (valor del stock que queda)
  select coalesce(sum(
           v.stock * coalesce(v.cost_override, p.cost, 0)
         ), 0)
    into v_inventory_cost
  from public.variants v
  join public.products p on p.id = v.product_id
  where v.is_active = true and p.is_active = true;

  v_total_invest := v_cycle.opening_inventory_cost
                    + v_cycle.new_lot_cost
                    + v_injections
                    + v_expenses;

  v_gross    := v_revenue - v_cogs;
  v_net_proj := v_revenue - v_cogs - v_expenses;

  if v_total_invest > 0 then
    v_be_pct := round((v_revenue / v_total_invest) * 100, 2);
  else
    v_be_pct := 0;
  end if;

  v_remaining := greatest(0, v_total_invest - v_revenue);

  -- Punto de equilibrio: primera fecha donde el acumulado de ventas
  -- alcanza la inversión total. Usamos window function.
  with running as (
    select s.created_at,
           sum(s.total) over (order by s.created_at) as cum
    from public.sales s
    where s.created_at >= v_cycle.started_at
      and s.created_at <= v_to
      and s.status <> 'cancelled'
  )
  select min(created_at) into v_be_at
  from running
  where cum >= v_total_invest;

  return jsonb_build_object(
    'cycle', to_jsonb(v_cycle),
    'total_investment',         v_total_invest,
    'capital_injections',       v_injections,
    'revenue',                  v_revenue,
    'cogs',                     v_cogs,
    'expenses',                 v_expenses,
    'gross_profit',             v_gross,
    'net_profit_projection',    v_net_proj,
    'current_inventory_cost',   v_inventory_cost,
    'break_even_at',            v_be_at,
    'break_even_pct',           v_be_pct,
    'remaining_to_be',          v_remaining
  );
end $$;

grant execute on function public.cycle_snapshot(uuid)
  to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 6) RPC close_cycle
-- ─────────────────────────────────────────────────────────────
create or replace function public.close_cycle(
  p_cycle_id                uuid,
  p_closing_inventory_cost  numeric default null,
  p_open_next               text    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_snap          jsonb;
  v_closing       numeric;
  v_next_id       uuid;
begin
  if not public.is_staff_or_admin() then
    raise exception 'Solo admin/staff puede cerrar un ciclo';
  end if;

  -- Tomamos snapshot final ANTES de cerrar
  v_snap := public.cycle_snapshot(p_cycle_id);

  -- closing_inventory_cost: si no dieron, usamos el current_inventory_cost del snapshot
  v_closing := coalesce(
    p_closing_inventory_cost,
    (v_snap->>'current_inventory_cost')::numeric,
    0
  );

  update public.inventory_cycles
     set status                 = 'closed',
         closed_at              = now(),
         closing_inventory_cost = v_closing,
         total_revenue          = (v_snap->>'revenue')::numeric,
         total_cogs             = (v_snap->>'cogs')::numeric,
         total_expenses         = (v_snap->>'expenses')::numeric,
         net_profit             = (v_snap->>'net_profit_projection')::numeric,
         break_even_at          = nullif(v_snap->>'break_even_at','')::timestamptz
   where id = p_cycle_id;

  -- Abrir siguiente ciclo si lo pidieron
  if p_open_next is not null and btrim(p_open_next) <> '' then
    v_next_id := public.open_cycle(p_open_next, 0, v_closing, null);
  end if;

  return jsonb_build_object(
    'cycle_id',      p_cycle_id,
    'snapshot',      v_snap,
    'next_cycle_id', v_next_id
  );
end $$;

grant execute on function public.close_cycle(uuid, numeric, text)
  to authenticated;


-- ─────────────────────────────────────────────────────────────
-- 7) FIX approve_payment_proof
--    La versión actual llama a `add_sale_payment(...)` que NO existe.
--    Reescribimos para hacer INSERT en payments + UPDATE de sales
--    inline, manteniendo la firma exacta (jsonb_build_object al final).
-- ─────────────────────────────────────────────────────────────
create or replace function public.approve_payment_proof(
  p_proof_id uuid,
  p_amount   numeric default null,
  p_method   text    default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_proof       record;
  v_amount      numeric;
  v_method      text;
  v_payment_id  uuid;
  v_sale_total  numeric;
  v_sale_paid   numeric;
  v_new_paid    numeric;
  v_new_balance numeric;
  v_new_status  text;
begin
  if not public.is_staff_or_admin() then
    raise exception 'Solo admin/staff puede aprobar';
  end if;

  select * into v_proof from public.payment_proofs where id = p_proof_id;
  if not found then raise exception 'Comprobante no encontrado'; end if;
  if v_proof.status = 'approved' then
    raise exception 'Ya estaba aprobado';
  end if;

  v_amount := coalesce(p_amount, v_proof.amount, 0);
  if v_amount <= 0 then raise exception 'Monto inválido'; end if;

  v_method := coalesce(p_method, v_proof.method, 'transferencia');

  -- 1) Insertar el pago en payments
  insert into public.payments (sale_id, amount, method)
  values (v_proof.sale_id, v_amount, v_method)
  returning id into v_payment_id;

  -- 2) Recalcular paid/balance/status en sales
  select total, paid
    into v_sale_total, v_sale_paid
  from public.sales
  where id = v_proof.sale_id;

  v_new_paid    := coalesce(v_sale_paid, 0) + v_amount;
  v_new_balance := greatest(0, coalesce(v_sale_total, 0) - v_new_paid);
  v_new_status  := case when v_new_balance <= 0 then 'paid' else 'pending' end;

  update public.sales
     set paid    = v_new_paid,
         balance = v_new_balance,
         status  = case when status = 'cancelled' then 'cancelled' else v_new_status end
   where id = v_proof.sale_id;

  -- 3) Marcar el comprobante como aprobado
  update public.payment_proofs
     set status      = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         payment_id  = v_payment_id,
         amount      = v_amount,
         method      = v_method
   where id = p_proof_id;

  return jsonb_build_object(
    'ok',         true,
    'amount',     v_amount,
    'payment_id', v_payment_id
  );
end $$;

grant execute on function public.approve_payment_proof(uuid, numeric, text)
  to authenticated;


commit;

-- ─────────────────────────────────────────────────────────────
-- Refresca el cache de PostgREST → quita 400/404 inmediatamente
-- ─────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';
