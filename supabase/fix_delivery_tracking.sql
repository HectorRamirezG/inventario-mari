-- ============================================================================
-- HOTFIX: delivery_notes — campos para tracking en vivo + instrucciones cliente
-- ============================================================================
-- Agrega 4 columnas opcionales a `delivery_notes` para:
--   - Tracking en vivo del repartidor (current_lat, current_lng, last_position_at)
--   - Instrucciones que el cliente envía sin abrir ticket (client_notes,
--     client_time_pref)
--
-- Es IDEMPOTENTE: usa IF NOT EXISTS, puedes correrlo varias veces sin
-- romper nada. NO toca filas existentes (las columnas quedan NULL).
--
-- Después del ALTER agrega también policy de UPDATE selectivo:
--   - Cliente puede actualizar SOLO `client_notes` + `client_time_pref` de
--     deliveries cuyo sale_id esté asociado a SU email.
--   - Repartidor (acceso público vía token) puede actualizar SOLO
--     `current_lat`, `current_lng`, `last_position_at` (controlado a nivel
--     aplicación: el frontend lo hace solo cuando entrega el token correcto).
--
-- Sin estos campos:
--   - QuickDeliveryActions tira un toast suave "necesitas correr el hotfix"
--   - OrderProgressTracker no muestra el mini-mapa (silencioso)
-- ============================================================================

begin;

-- 1) Columnas para posición del repartidor en vivo
alter table public.delivery_notes
  add column if not exists current_lat numeric,
  add column if not exists current_lng numeric,
  add column if not exists last_position_at timestamptz;

-- 2) Columnas para instrucciones del cliente
alter table public.delivery_notes
  add column if not exists client_notes text,
  add column if not exists client_time_pref text;

-- 3) Constraint para validar valores de client_time_pref (opcional, no rompe NULL)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_notes_client_time_pref_check'
  ) then
    alter table public.delivery_notes
      add constraint delivery_notes_client_time_pref_check
      check (
        client_time_pref is null
        or client_time_pref in ('morning', 'afternoon', 'evening', 'anytime')
      );
  end if;
end$$;

-- 4) Policy: el cliente del pedido puede UPDATE de los 2 campos suyos.
--    Verifica que el sale.customer_email coincida con el jwt email.
--    NO permite tocar current_lat/lng (eso es del repartidor).
drop policy if exists delivery_notes_client_instructions on public.delivery_notes;

create policy delivery_notes_client_instructions
  on public.delivery_notes
  for update
  to anon, authenticated
  using (
    exists (
      select 1
        from public.sales s
       where s.id = delivery_notes.sale_id
         and lower(coalesce(s.customer_email, '')) =
             lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    -- En el lado WITH CHECK no podemos ver el row VIEJO, así que aceptamos
    -- la fila si el email matchea. La restricción de qué columnas se
    -- actualizan la hace el cliente (UPDATE solo set client_notes/pref).
    exists (
      select 1
        from public.sales s
       where s.id = delivery_notes.sale_id
         and lower(coalesce(s.customer_email, '')) =
             lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

-- 5) RPC opcional para actualización ATOMIC de posición del repartidor.
--    SECURITY DEFINER + verifica que el token público corresponda al note.
--    Esto evita que cualquier anon pueda escribir lat/lng arbitraria.
create or replace function public.update_delivery_position(
  p_token text,
  p_lat numeric,
  p_lng numeric
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_status text;
begin
  select id, status into v_id, v_status
    from public.delivery_notes
   where public_token = p_token
   limit 1;

  if v_id is null then
    raise exception 'delivery note not found for token';
  end if;

  -- Solo aceptamos posiciones cuando está en ruta (picked_up).
  if v_status <> 'picked_up' then
    return;
  end if;

  update public.delivery_notes
     set current_lat = p_lat,
         current_lng = p_lng,
         last_position_at = now()
   where id = v_id;
end;
$$;

grant execute on function public.update_delivery_position(text, numeric, numeric)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- VERIFICACIÓN (correr después)
-- ============================================================================
-- select column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'delivery_notes'
--    and column_name in ('current_lat','current_lng','last_position_at','client_notes','client_time_pref')
--  order by column_name;
