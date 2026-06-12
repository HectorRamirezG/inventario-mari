-- =====================================================================
--  MARI INVENTARIO — APARTADOS + INFO DE CLIENTE
--  Agrega columnas opcionales a `sales` y una RPC para abonar a una
--  venta existente. IDEMPOTENTE — corre las veces que quieras.
-- =====================================================================

-- --- Columnas nuevas en sales ----------------------------------------
alter table public.sales
  add column if not exists customer_phone     text;
alter table public.sales
  add column if not exists customer_address   text;
alter table public.sales
  add column if not exists customer_location  text;   -- URL de Google Maps o coords "lat,lng"
alter table public.sales
  add column if not exists notes              text;
alter table public.sales
  add column if not exists due_date           timestamptz;
alter table public.sales
  add column if not exists is_layaway         boolean not null default false;

-- Índices para listados rápidos
create index if not exists ix_sales_status   on public.sales(status, created_at desc);
create index if not exists ix_sales_layaway  on public.sales(is_layaway) where is_layaway = true;
create index if not exists ix_payments_sale  on public.payments(sale_id);


-- --- RPC: registra un abono a una venta existente --------------------
-- Inserta en `payments`, recalcula paid/balance/status en `sales`.
-- Si el saldo queda en 0 → status = 'paid'.
-- Si llega a 'paid' y la venta era apartado → is_layaway sigue true
-- (es histórico — sirve para reportes "ventas que fueron apartado").
create or replace function public.add_sale_payment(
  p_sale_id uuid,
  p_amount  numeric,
  p_method  text default 'efectivo'
) returns void
language plpgsql
as $$
declare
  v_total       numeric;
  v_paid        numeric;
  v_status      text;
  v_new_paid    numeric;
  v_new_balance numeric;
  v_new_status  text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'El abono debe ser mayor a 0';
  end if;

  select total, paid, status into v_total, v_paid, v_status
    from public.sales
   where id = p_sale_id
   for update;

  if v_total is null then
    raise exception 'Venta % no encontrada', p_sale_id;
  end if;
  if v_status = 'cancelled' then
    raise exception 'No se puede abonar a una venta cancelada';
  end if;

  insert into public.payments(sale_id, amount, method)
  values (p_sale_id, p_amount, coalesce(p_method, 'efectivo'));

  v_new_paid    := v_paid + p_amount;
  v_new_balance := greatest(0, v_total - v_new_paid);
  v_new_status  := case when v_new_balance > 0 then 'pending' else 'paid' end;

  update public.sales
     set paid    = v_new_paid,
         balance = v_new_balance,
         status  = v_new_status
   where id = p_sale_id;
end$$;


-- --- RPC: cancela una venta y devuelve el stock ---------------------
-- Útil cuando se cancela un apartado y queremos regresar las piezas.
create or replace function public.cancel_sale(p_sale_id uuid)
returns void
language plpgsql
as $$
declare
  it record;
begin
  -- Devuelve stock por cada sale_item con variant_id no nulo (ignora bundles)
  for it in
    select variant_id, qty
      from public.sale_items
     where sale_id = p_sale_id
       and variant_id is not null
       and is_bundle = false
  loop
    update public.variants
       set stock = stock + it.qty
     where id = it.variant_id;

    insert into public.movements(variant_id, sale_id, type, quantity, note)
    values (it.variant_id, p_sale_id, 'entrada', it.qty, 'Cancelación de venta');
  end loop;

  update public.sales
     set status = 'cancelled'
   where id = p_sale_id;
end$$;
