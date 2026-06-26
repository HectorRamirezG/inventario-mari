-- ════════════════════════════════════════════════════════════════════
-- HOTFIX 2026-06-26 — approve_payment_proof intentaba INSERT en
-- payments.note que NO existe en la tabla. El RPC fallaba con 400:
--   "column 'note' of relation 'payments' does not exist"
--
-- Esta versión:
--   1) Quita el INSERT a payments.note (la columna no existe).
--   2) Mantiene el flujo: validar staff → lock proof → lock sale →
--      INSERT en payments (sin note) → UPDATE proof a 'approved'.
--   3) Los triggers `recalc_sale_on_payments` actualizan automáticamente
--      sales.paid/balance/status, no hay que tocarlos aquí.
--
-- Ejecutar en Supabase Dashboard → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.approve_payment_proof(
  p_proof_id uuid,
  p_amount   numeric default null,
  p_method   text    default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proof   public.payment_proofs%rowtype;
  v_sale    public.sales%rowtype;
  v_amount  numeric;
  v_method  text;
begin
  -- Solo staff/admin pueden aprobar
  if not public.is_staff_or_admin() then
    raise exception 'permission denied' using errcode = '42501';
  end if;

  -- Lock del proof para evitar doble aprobación concurrente
  select * into v_proof
  from public.payment_proofs
  where id = p_proof_id
  for update;

  if not found then
    raise exception 'proof not found' using errcode = 'P0002';
  end if;

  if v_proof.status = 'approved' then
    raise exception 'proof already approved' using errcode = 'P0001';
  end if;

  -- Lock del sale relacionado
  select * into v_sale
  from public.sales
  where id = v_proof.sale_id
  for update;

  if not found then
    raise exception 'sale not found' using errcode = 'P0002';
  end if;

  -- Calcular monto y método: caller > proof > default
  v_amount := coalesce(p_amount, v_proof.amount, 0);
  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be > 0' using errcode = 'P0001';
  end if;

  v_method := coalesce(nullif(trim(p_method), ''), nullif(trim(v_proof.method), ''), 'transferencia');

  -- INSERT en payments (SIN `note` — la columna no existe).
  -- Los triggers `recalc_sale_on_payments` se encargan de actualizar
  -- sales.paid/balance/status automáticamente.
  insert into public.payments (sale_id, amount, method, created_at)
  values (v_proof.sale_id, v_amount, v_method, now());

  -- UPDATE del proof a 'approved'
  update public.payment_proofs
  set status      = 'approved',
      resolved_at = now(),
      resolved_by = auth.uid(),
      amount      = v_amount,
      method      = v_method
  where id = p_proof_id;

  -- Releer el sale ya actualizado por los triggers
  select * into v_sale
  from public.sales
  where id = v_proof.sale_id;

  return jsonb_build_object(
    'ok',          true,
    'proof_id',    p_proof_id,
    'sale_id',     v_proof.sale_id,
    'amount',      v_amount,
    'method',      v_method,
    'new_paid',    v_sale.paid,
    'new_balance', v_sale.balance,
    'new_status',  v_sale.status
  );
end;
$$;

-- Permisos: solo authenticated. Anon NO debería aprobar comprobantes.
revoke execute on function public.approve_payment_proof(uuid, numeric, text) from anon;
grant  execute on function public.approve_payment_proof(uuid, numeric, text) to authenticated;

-- Refresca el cache de PostgREST para que los clientes vean la nueva firma.
notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN OPCIONAL (correr y revisar):
-- ════════════════════════════════════════════════════════════════════
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'payments'
-- order by ordinal_position;
--
-- Si quieres tener `note` en payments para casos futuros, agrégala:
--   alter table public.payments add column if not exists note text;
-- Y luego puedes extender la RPC para que reciba p_note y lo guarde.
-- ════════════════════════════════════════════════════════════════════
