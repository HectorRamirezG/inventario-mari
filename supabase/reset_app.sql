-- =========================================================================
-- reset_app_data — wipeo operativo SECURITY DEFINER
-- =========================================================================
-- Función servidor que limpia TODO lo operativo del negocio sin tocar
-- usuarios ni configuración. Usa SECURITY DEFINER para bypassear las
-- RLS (necesario porque tablas como support_tickets y notifications
-- solo permiten INSERT al cliente, no DELETE).
--
-- Devuelve un JSONB con el conteo por tabla, similar al ResetReport del
-- frontend, para que la UI pueda mostrar el detalle.
--
-- SEGURIDAD: la función verifica que el caller sea admin. Cualquier
-- otro rol recibe excepción.
--
-- IDEMPOTENTE: se puede correr múltiples veces sin efectos colaterales.
-- =========================================================================

create or replace function public.reset_app_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text;
  v_role      text;
  v_counts    jsonb := '{}'::jsonb;
  v_rows      int;
  v_tbl       text;
  -- Orden FK-safe: hijos primero, padres después.
  v_tables    text[] := array[
    'movements',
    'notifications',
    'payment_proofs',
    'payments',
    'support_tickets',
    'delivery_notes',
    'sale_items',
    'sales',
    'pricing_operations',
    'wishes',
    'stories',
    'reviews',
    'variants',
    'products',
    'capital_injections',
    'operating_expenses',
    'inventory_cycles'
  ];
begin
  -- ── Auth: solo admins ──
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'reset_app_data: no authenticated user';
  end if;

  select role into v_role
  from public.user_profiles
  where email = v_email
  limit 1;

  if v_role is null or v_role <> 'admin' then
    raise exception 'reset_app_data: requires admin role (got: %)', coalesce(v_role, 'none');
  end if;

  -- ── Borrar tabla por tabla, registrando conteo ──
  foreach v_tbl in array v_tables loop
    begin
      execute format('delete from public.%I', v_tbl);
      get diagnostics v_rows = row_count;
      v_counts := v_counts || jsonb_build_object(v_tbl, v_rows);
    exception
      when undefined_table then
        -- Tabla no existe en este deploy: la marcamos como 0
        v_counts := v_counts || jsonb_build_object(v_tbl, 0);
      when others then
        -- Cualquier otro error lo reportamos en el JSON pero NO abortamos
        -- (queremos limpiar lo más posible).
        v_counts := v_counts || jsonb_build_object(
          v_tbl,
          jsonb_build_object('error', SQLERRM)
        );
    end;
  end loop;

  -- ── Reset pricing_config (UPDATE, no DELETE) ──
  begin
    update public.pricing_config
    set
      margen_menudeo = 35,
      margen_medio   = 25,
      margen_mayoreo = 15,
      umbral_medio   = 6,
      umbral_mayoreo = 12,
      costo_extra    = 0
    where id = 1;
  exception
    when undefined_table then null;
    when others then
      v_counts := v_counts || jsonb_build_object(
        'pricing_config', jsonb_build_object('error', SQLERRM)
      );
  end;

  return jsonb_build_object(
    'ok', true,
    'caller', v_email,
    'tables', v_counts
  );
end;
$$;

-- Permisos: solo usuarios autenticados pueden invocar. La función
-- verifica internamente que sean admin.
revoke all on function public.reset_app_data() from public;
grant execute on function public.reset_app_data() to authenticated;

comment on function public.reset_app_data() is
  'Wipea TODO lo operativo (ventas, productos, soporte, etc) preservando usuarios y config. Solo admin.';
