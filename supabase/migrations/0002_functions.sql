-- =====================================================================
--  MARI INVENTARIO — FUNCIONES (RPC)
--  Ejecutar después de 0001_schema.sql
-- =====================================================================

-- ---------- decrease_variant_stock ----------
create or replace function public.decrease_variant_stock(
  p_variant_id uuid,
  p_qty        integer
) returns integer
language plpgsql
as $$
declare
  v_new integer;
begin
  update public.variants
     set stock = stock - p_qty
   where id = p_variant_id
   returning stock into v_new;

  if v_new is null then
    raise exception 'Variante % no encontrada', p_variant_id;
  end if;

  return v_new;
end$$;

-- ---------- apply_movement ----------
create or replace function public.apply_movement(
  p_variant_id uuid,
  p_type       text,
  p_qty        integer
) returns integer
language plpgsql
as $$
declare
  v_new integer;
  v_product uuid;
begin
  if p_type not in ('entrada','salida','ajuste') then
    raise exception 'Tipo de movimiento inválido: %', p_type;
  end if;

  select product_id into v_product from public.variants where id = p_variant_id;

  if p_type = 'entrada' then
    update public.variants set stock = stock + p_qty
     where id = p_variant_id returning stock into v_new;
  elsif p_type = 'salida' then
    update public.variants set stock = stock - p_qty
     where id = p_variant_id returning stock into v_new;
  else
    update public.variants set stock = p_qty
     where id = p_variant_id returning stock into v_new;
  end if;

  insert into public.movements(variant_id, product_id, type, quantity)
  values (p_variant_id, v_product, p_type, p_qty);

  return v_new;
end$$;

-- =====================================================================
--  create_sale_atomic
--  Procesa una venta completa en una sola transacción.
--  payload es un JSONB con la forma:
--  {
--    "customer": "Cliente",
--    "paid": 100,
--    "items": [
--       { "variant_id": "uuid", "qty": 3, "unit_price": 50, "cost": 30, "tier": "menudeo", "product_id": "uuid", "name": "x", "variant_name": "y" },
--       ...
--    ],
--    "bundles": [
--       { "bundle_id": "uuid", "qty": 1, "unit_price": 250, "name": "Pack X" }
--    ]
--  }
-- =====================================================================
create or replace function public.create_sale_atomic(payload jsonb)
returns uuid
language plpgsql
as $$
declare
  v_sale_id  uuid;
  v_total    numeric(12,2) := 0;
  v_paid     numeric(12,2) := coalesce((payload->>'paid')::numeric, 0);
  v_balance  numeric(12,2);
  v_status   text;
  it         jsonb;
  comp       record;
  v_qty      integer;
  v_unit     numeric(12,2);
  v_cost     numeric(12,2);
  v_profit   numeric(12,2);
  v_bid      uuid;
begin
  -- Totales de items sueltos
  if jsonb_typeof(payload->'items') = 'array' then
    for it in select * from jsonb_array_elements(payload->'items')
    loop
      v_qty  := coalesce((it->>'qty')::int, 0);
      v_unit := coalesce((it->>'unit_price')::numeric, 0);
      v_total := v_total + (v_qty * v_unit);
    end loop;
  end if;

  -- Totales de bundles
  if jsonb_typeof(payload->'bundles') = 'array' then
    for it in select * from jsonb_array_elements(payload->'bundles')
    loop
      v_qty  := coalesce((it->>'qty')::int, 0);
      v_unit := coalesce((it->>'unit_price')::numeric, 0);
      v_total := v_total + (v_qty * v_unit);
    end loop;
  end if;

  v_balance := greatest(0, v_total - v_paid);
  v_status  := case when v_balance > 0 then 'pending' else 'paid' end;

  insert into public.sales (customer_name, total, paid, balance, status)
  values (nullif(payload->>'customer',''), v_total, v_paid, v_balance, v_status)
  returning id into v_sale_id;

  -- Items sueltos
  if jsonb_typeof(payload->'items') = 'array' then
    for it in select * from jsonb_array_elements(payload->'items')
    loop
      v_qty  := coalesce((it->>'qty')::int, 0);
      v_unit := coalesce((it->>'unit_price')::numeric, 0);
      v_cost := coalesce((it->>'cost')::numeric, 0);
      v_profit := (v_unit - v_cost) * v_qty;

      insert into public.sale_items(
        sale_id, variant_id, product_id, product_name, variant_name,
        qty, tier, unit_price, cost_snapshot, profit, is_bundle
      ) values (
        v_sale_id,
        (it->>'variant_id')::uuid,
        nullif(it->>'product_id','')::uuid,
        it->>'name',
        it->>'variant_name',
        v_qty,
        coalesce(it->>'tier','menudeo'),
        v_unit, v_cost, v_profit, false
      );

      update public.variants set stock = stock - v_qty
       where id = (it->>'variant_id')::uuid;

      insert into public.movements(variant_id, product_id, sale_id, type, quantity)
      values (
        (it->>'variant_id')::uuid,
        nullif(it->>'product_id','')::uuid,
        v_sale_id, 'salida', v_qty
      );
    end loop;
  end if;

  -- Bundles: una sola línea + descuento por cada componente
  if jsonb_typeof(payload->'bundles') = 'array' then
    for it in select * from jsonb_array_elements(payload->'bundles')
    loop
      v_qty  := coalesce((it->>'qty')::int, 0);
      v_unit := coalesce((it->>'unit_price')::numeric, 0);
      v_bid  := (it->>'bundle_id')::uuid;

      insert into public.sale_items(
        sale_id, bundle_id, product_name, qty, tier, unit_price, is_bundle
      ) values (
        v_sale_id, v_bid, coalesce(it->>'name','Paquete'),
        v_qty, 'menudeo', v_unit, true
      );

      -- Descontar stock de cada componente del bundle
      for comp in
        select bi.variant_id, bi.qty as comp_qty, v.product_id
          from public.bundle_items bi
          join public.variants v on v.id = bi.variant_id
         where bi.bundle_id = v_bid
      loop
        update public.variants
           set stock = stock - (comp.comp_qty * v_qty)
         where id = comp.variant_id;

        insert into public.movements(variant_id, product_id, sale_id, type, quantity, note)
        values (
          comp.variant_id, comp.product_id, v_sale_id, 'salida',
          comp.comp_qty * v_qty, 'Bundle: ' || coalesce(it->>'name','')
        );
      end loop;
    end loop;
  end if;

  -- Pago inicial
  if v_paid > 0 then
    insert into public.payments(sale_id, amount) values (v_sale_id, v_paid);
  end if;

  return v_sale_id;
end$$;
