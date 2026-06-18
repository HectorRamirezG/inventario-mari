-- ============================================================================
-- BEAUTY'S ME — Recalcular sales.total y sales.balance automáticamente
-- ============================================================================
-- Una de las fuentes de bugs más comunes era que `sales.total` y
-- `sales.balance` quedaban DESINCRONIZADOS contra los datos primarios:
--   - sale_items (subtotal real)
--   - payments (pagos reales)
--   - sales.adjustment_amount (descuento/cargo manual)
--   - sales.shipping_amount (envío)
--
-- Cualquier UI que escribía a alguna de esas tablas sin actualizar `sales`
-- dejaba al cliente viendo "Total $375 / Falta $440" o similar.
--
-- ESTE SCRIPT instala:
--   1. Función `public.recalc_sale(p_sale_id)` — fuente única de verdad
--   2. Trigger en sale_items (INSERT/UPDATE/DELETE) que llama recalc
--   3. Trigger en payments (INSERT/UPDATE/DELETE) que llama recalc
--   4. Trigger en sales BEFORE UPDATE: si cambia adjustment_amount o
--      shipping_amount, recalcula total y balance dentro del mismo UPDATE
--      (sin recursión)
--
-- FÓRMULA OFICIAL:
--   subtotal = SUM(sale_items.qty * sale_items.unit_price)
--   total    = MAX(0, subtotal - adjustment_amount + shipping_amount)
--             (adjustment_amount > 0 = DESCUENTO baja el total)
--             (adjustment_amount < 0 = CARGO sube el total)
--   paid     = SUM(payments.amount)
--   balance  = MAX(0, total - paid)
--   status   = 'cancelled' si ya estaba, sino:
--              'paid' si balance = 0,
--              'pending' en otro caso
--
-- Puedes correr este script las veces que quieras. NO borra datos.
-- ============================================================================

-- ─── 1. Función pública recalc_sale ───────────────────────────────────────
create or replace function public.recalc_sale(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subtotal numeric := 0;
  v_paid     numeric := 0;
  v_adj      numeric;
  v_ship     numeric;
  v_total    numeric;
  v_balance  numeric;
  v_status   text;
  v_old      record;
begin
  select status, adjustment_amount, shipping_amount
    into v_old
    from public.sales
   where id = p_sale_id;
  if not found then
    return;
  end if;

  -- Subtotal real desde sale_items
  select coalesce(sum(qty * unit_price), 0)
    into v_subtotal
    from public.sale_items
   where sale_id = p_sale_id;

  -- Pagado real desde payments
  select coalesce(sum(amount), 0)
    into v_paid
    from public.payments
   where sale_id = p_sale_id;

  v_adj  := coalesce(v_old.adjustment_amount, 0);
  v_ship := coalesce(v_old.shipping_amount, 0);

  v_total := greatest(0, v_subtotal - v_adj + v_ship);
  v_balance := greatest(0, v_total - v_paid);

  if v_old.status = 'cancelled' then
    v_status := 'cancelled';
  elsif v_balance <= 0 then
    v_status := 'paid';
  else
    v_status := 'pending';
  end if;

  update public.sales
     set total   = v_total,
         paid    = v_paid,
         balance = v_balance,
         status  = v_status
   where id = p_sale_id;
end;
$$;

grant execute on function public.recalc_sale(uuid) to authenticated, anon;

-- ─── 2. Trigger en sale_items ─────────────────────────────────────────────
create or replace function public.trg_recalc_sale_from_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_sale(old.sale_id);
    return old;
  else
    perform public.recalc_sale(new.sale_id);
    if tg_op = 'UPDATE' and old.sale_id <> new.sale_id then
      perform public.recalc_sale(old.sale_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists recalc_sale_on_items on public.sale_items;
create trigger recalc_sale_on_items
  after insert or update or delete on public.sale_items
  for each row
  execute function public.trg_recalc_sale_from_items();

-- ─── 3. Trigger en payments ───────────────────────────────────────────────
create or replace function public.trg_recalc_sale_from_payments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_sale(old.sale_id);
    return old;
  else
    perform public.recalc_sale(new.sale_id);
    if tg_op = 'UPDATE' and old.sale_id <> new.sale_id then
      perform public.recalc_sale(old.sale_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists recalc_sale_on_payments on public.payments;
create trigger recalc_sale_on_payments
  after insert or update or delete on public.payments
  for each row
  execute function public.trg_recalc_sale_from_payments();

-- ─── 4. Trigger BEFORE UPDATE en sales (sin recursión) ────────────────────
-- Cuando alguien actualiza adjustment_amount o shipping_amount directamente
-- (Mari aplicando descuento o cambiando envío), recalculamos total y balance
-- dentro del MISMO UPDATE para que la fila quede consistente al instante.
--
-- Usamos un guard `pg_trigger_depth() = 1` para no recursar si el UPDATE
-- viene del propio recalc_sale.
create or replace function public.trg_recalc_sale_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subtotal numeric := 0;
  v_paid     numeric := 0;
  v_adj      numeric;
  v_ship     numeric;
  v_total    numeric;
  v_balance  numeric;
begin
  -- Si recalc_sale ya está corriendo, no hagas nada.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  -- Si lo que cambió NO afecta el cálculo, salimos rápido.
  if new.adjustment_amount is not distinct from old.adjustment_amount
     and new.shipping_amount is not distinct from old.shipping_amount then
    return new;
  end if;

  select coalesce(sum(qty * unit_price), 0)
    into v_subtotal
    from public.sale_items
   where sale_id = new.id;

  select coalesce(sum(amount), 0)
    into v_paid
    from public.payments
   where sale_id = new.id;

  v_adj  := coalesce(new.adjustment_amount, 0);
  v_ship := coalesce(new.shipping_amount, 0);

  v_total := greatest(0, v_subtotal - v_adj + v_ship);
  v_balance := greatest(0, v_total - v_paid);

  new.total   := v_total;
  new.paid    := v_paid;
  new.balance := v_balance;
  if new.status <> 'cancelled' then
    new.status := case when v_balance <= 0 then 'paid' else 'pending' end;
  end if;

  return new;
end;
$$;

drop trigger if exists recalc_sale_on_change on public.sales;
create trigger recalc_sale_on_change
  before update on public.sales
  for each row
  execute function public.trg_recalc_sale_on_change();

-- ─── 5. Backfill: recalcular TODAS las ventas existentes para
--      arreglar los datos viejos que quedaron inconsistentes.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.sales loop
    perform public.recalc_sale(v_id);
  end loop;
end$$;
