-- ============================================================================
-- HOTFIX: approve_payment_proof RPC      (2026-06-23)
-- ============================================================================
-- PROBLEMA: La versión actual del RPC `approve_payment_proof` internamente
-- llama a `add_sale_payment` (función que NO existe en la BD). Esto hace
-- que aprobar comprobantes falle con:
--   "function public.add_sale_payment(...) does not exist"
--
-- FIX: Re-definimos `approve_payment_proof` para que:
--   1. Marque el proof como 'approved' + guarde quién y cuándo.
--   2. INSERT directo en `payments` con sale_id/amount/method.
--   3. Los triggers `recalc_sale_on_payments` re-calculan paid/balance/status
--      automáticamente — no tocamos `sales` aquí.
--   4. Devuelva un jsonb con el resumen (proof_id, sale_id, payment_id,
--      new_balance, new_status) por si el frontend quiere mostrarlo.
--
-- SEGURIDAD:
--   - SECURITY DEFINER (porque payments es write-staff-only por RLS).
--   - GRANT a anon, authenticated (el RPC valida internamente que el
--     caller sea staff/admin vía `is_staff_or_admin()`).
--   - Si no es staff/admin → raise exception. Defensa contra abuso.
--
-- VERIFICACIÓN POST-FIX:
--   Aprueba un proof real desde la app. Debe:
--     - Crear UN row nuevo en `payments` con el amount y method.
--     - El proof debe quedar status='approved', resolved_at/by llenos.
--     - sales.paid debe sumar el amount, sales.balance debe bajar.
--     - Si balance == 0, sales.status pasa a 'paid'.
-- ============================================================================

begin;

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
  v_proof       record;
  v_amount      numeric;
  v_method      text;
  v_payment_id  uuid;
  v_sale        record;
begin
  -- Validación: solo staff/admin pueden aprobar.
  if not public.is_staff_or_admin() then
    raise exception 'permission denied: approve_payment_proof requires staff role';
  end if;

  -- Cargar el proof (lock para evitar doble-aprobación en paralelo)
  select * into v_proof
    from public.payment_proofs
   where id = p_proof_id
   for update;

  if v_proof.id is null then
    raise exception 'payment_proof % not found', p_proof_id;
  end if;

  if v_proof.status = 'approved' then
    raise exception 'payment_proof % is already approved', p_proof_id;
  end if;

  -- Defaults: si no llega monto/método, usar los del proof
  v_amount := coalesce(p_amount, v_proof.amount);
  v_method := coalesce(p_method, v_proof.method, 'transferencia');

  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be > 0 (got %)', v_amount;
  end if;

  -- 1) Insertar payment. El trigger `recalc_sale_on_payments` se encargará
  --    de actualizar sales.paid/balance/status.
  insert into public.payments (sale_id, amount, method, created_at)
  values (v_proof.sale_id, v_amount, v_method, now())
  returning id into v_payment_id;

  -- 2) Marcar el proof como aprobado.
  update public.payment_proofs
     set status      = 'approved',
         resolved_at = now(),
         resolved_by = auth.uid(),
         amount      = v_amount,
         method      = v_method
   where id = p_proof_id;

  -- 3) Re-leer el sale post-trigger para devolver estado coherente.
  select id, total, paid, balance, status into v_sale
    from public.sales
   where id = v_proof.sale_id;

  return jsonb_build_object(
    'proof_id',    p_proof_id,
    'sale_id',     v_proof.sale_id,
    'payment_id',  v_payment_id,
    'amount',      v_amount,
    'method',      v_method,
    'new_paid',    v_sale.paid,
    'new_balance', v_sale.balance,
    'new_status',  v_sale.status
  );
end;
$$;

-- Re-otorgar grants (security definer mantiene execute para anon/auth)
grant execute on function public.approve_payment_proof(uuid, numeric, text)
  to anon, authenticated, service_role;

-- Recargar el cache de PostgREST para que el RPC reflje cambios
notify pgrst, 'reload schema';

commit;
