-- ============================================================================
-- HOTFIX: RPC public.update_delivery_status_by_token faltante
-- ============================================================================
-- Error que arregla:
--   Could not find the function public.update_delivery_status_by_token
--   (p_status, p_token) in the schema cache
--   POST /rpc/update_delivery_status_by_token 404
--
-- Esta RPC la llama el repartidor desde /comanda/:token (PublicDeliveryNotePage)
-- para marcar el pedido como 'En camino' (picked_up) o 'Entregado' (delivered)
-- SIN sesión, validando solo el token público de la comanda.
--
-- SECURITY DEFINER: corre como dueño de la BD para poder atravesar RLS.
-- Valida internamente que el token exista y que la transición sea legal.
--
-- IDEMPOTENTE: usa create or replace + drop trigger if exists.
-- ============================================================================

begin;

create or replace function public.update_delivery_status_by_token(
  p_token  text,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_note          public.delivery_notes%rowtype;
  v_sale_id       uuid;
  v_sale_token    text;
  v_customer_name text;
  v_customer_email text;
begin
  if p_token is null or btrim(p_token) = '' then
    return jsonb_build_object('ok', false, 'error', 'token_required');
  end if;
  if p_status not in ('picked_up', 'delivered') then
    return jsonb_build_object('ok', false, 'error', 'invalid_status');
  end if;

  -- Busca la comanda por su token público (case sensitive)
  select * into v_note
    from public.delivery_notes
   where public_token = p_token
   limit 1;

  if v_note.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Reglas de transición:
  --   draft / sent       -> picked_up
  --   picked_up          -> delivered
  --   cancelled/delivered -> no se puede mover
  if v_note.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'cancelled');
  end if;
  if v_note.status = 'delivered' then
    return jsonb_build_object('ok', false, 'error', 'already_delivered');
  end if;
  if p_status = 'picked_up' and v_note.status not in ('draft', 'sent') then
    return jsonb_build_object('ok', false, 'error', 'bad_transition');
  end if;
  if p_status = 'delivered' and v_note.status <> 'picked_up' then
    return jsonb_build_object('ok', false, 'error', 'must_be_picked_up_first');
  end if;

  -- Aplica el cambio + sella timestamp correspondiente
  if p_status = 'picked_up' then
    update public.delivery_notes
       set status         = 'picked_up',
           picked_up_at   = coalesce(picked_up_at, now())
     where id = v_note.id
     returning * into v_note;
  else
    update public.delivery_notes
       set status        = 'delivered',
           delivered_at  = coalesce(delivered_at, now())
     where id = v_note.id
     returning * into v_note;
  end if;

  -- Recupera datos del sale para que el frontend dispare las notifs
  -- al cliente sin tener que hacer otra round-trip.
  select s.id, s.public_token, s.customer_name, s.customer_email
    into v_sale_id, v_sale_token, v_customer_name, v_customer_email
    from public.sales s
   where s.id = v_note.sale_id
   limit 1;

  return jsonb_build_object(
    'ok',             true,
    'new_status',     v_note.status,
    'driver_name',    v_note.driver_name,
    'customer_name',  v_customer_name,
    'customer_email', v_customer_email,
    'sale_id',        v_sale_id,
    'sale_token',     v_sale_token,
    'picked_up_at',   v_note.picked_up_at,
    'delivered_at',   v_note.delivered_at
  );
exception when others then
  raise warning '[update_delivery_status_by_token] %', sqlerrm;
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.update_delivery_status_by_token(text, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- select proname, pronargs
--   from pg_proc
--  where proname = 'update_delivery_status_by_token';
--
-- Prueba manual (reemplaza TOKEN):
-- select public.update_delivery_status_by_token('TOKEN', 'picked_up');
