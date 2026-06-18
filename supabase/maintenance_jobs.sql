-- =========================================================================
-- maintenance_jobs.sql — Limpieza automática de datos efímeros
-- =========================================================================
-- Reduce el crecimiento de la base de datos y del bucket de storage
-- borrando registros que ya cumplieron su ciclo de vida útil.
--
-- POLÍTICA DE RETENCIÓN
--   • stories caducadas (expires_at < now)                  → borrar todo
--   • notifications leídas > 30 días                        → borrar
--   • notifications no leídas > 90 días                     → borrar
--   • payment_proofs aprobados/rechazados > 90 días         → conservar metadata,
--                                                              nullificar image_url
--                                                              (la foto se elimina
--                                                              de storage por job)
--   • support_tickets resueltos/cerrados > 60 días          → conservar metadata,
--                                                              nullificar image_url
--   • payment_proofs sin sale_id válida (huérfanos)          → borrar
--
-- IMÁGENES EN STORAGE
--   La función `mari_cleanup()` solo limpia metadata en BD. Para borrar los
--   archivos reales del bucket usa el RPC `mari_collect_orphan_images()`
--   que devuelve los paths que el cliente puede eliminar via API admin.
--
-- IDEMPOTENTE: correr múltiples veces no causa daño; solo borra lo que
-- ya está fuera de retención.
--
-- CRON (opcional): si tienes pg_cron habilitado (Pro plan o Free con
-- extensión activada), descomenta la sección final para programarlo
-- diario a las 3 AM UTC.
-- =========================================================================

create or replace function public.mari_cleanup()
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
begin
  -- ── Auth: solo admins ──
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'mari_cleanup: no authenticated user';
  end if;

  select role into v_role
  from public.user_profiles
  where email = v_email
  limit 1;

  if v_role is null or v_role <> 'admin' then
    raise exception 'mari_cleanup: requires admin role (got: %)', coalesce(v_role, 'none');
  end if;

  -- ── 1) Stories caducadas → borrar registro ──
  begin
    delete from public.stories
    where expires_at < now();
    get diagnostics v_rows = row_count;
    v_counts := v_counts || jsonb_build_object('stories_expired', v_rows);
  exception when undefined_table then
    v_counts := v_counts || jsonb_build_object('stories_expired', 0);
  end;

  -- ── 2a) Notificaciones leídas > 30 días → borrar ──
  begin
    delete from public.notifications
    where read_at is not null
      and read_at < (now() - interval '30 days');
    get diagnostics v_rows = row_count;
    v_counts := v_counts || jsonb_build_object('notifications_read_30d', v_rows);
  exception when undefined_table then
    v_counts := v_counts || jsonb_build_object('notifications_read_30d', 0);
  when undefined_column then
    -- tabla sin columna read_at: fallback a created_at
    delete from public.notifications
    where created_at < (now() - interval '30 days');
    get diagnostics v_rows = row_count;
    v_counts := v_counts || jsonb_build_object('notifications_30d_by_created', v_rows);
  end;

  -- ── 2b) Notificaciones no leídas > 90 días → borrar igual ──
  begin
    delete from public.notifications
    where created_at < (now() - interval '90 days');
    get diagnostics v_rows = row_count;
    v_counts := v_counts || jsonb_build_object('notifications_90d', v_rows);
  exception when undefined_table then
    v_counts := v_counts || jsonb_build_object('notifications_90d', 0);
  end;

  -- ── 3) Payment proofs > 90 días → mantener metadata, nullificar imagen ──
  --    Para el admin sigue siendo útil saber "el cliente reportó $200 en
  --    abril 2025 método=transferencia", pero la foto ya no aporta — y
  --    ocupa ~250KB cada una. La marcamos como `image_url=null` para que
  --    el job de storage pueda eliminar el archivo después.
  begin
    update public.payment_proofs
    set image_url = null
    where image_url is not null
      and image_url not like 'cash://%'
      and status in ('approved', 'rejected')
      and coalesce(decided_at, updated_at, created_at) < (now() - interval '90 days');
    get diagnostics v_rows = row_count;
    v_counts := v_counts || jsonb_build_object('proofs_image_purged_90d', v_rows);
  exception when undefined_table then
    v_counts := v_counts || jsonb_build_object('proofs_image_purged_90d', 0);
  when undefined_column then
    -- Si no existe decided_at o updated_at, usamos solo created_at
    update public.payment_proofs
    set image_url = null
    where image_url is not null
      and image_url not like 'cash://%'
      and status in ('approved', 'rejected')
      and created_at < (now() - interval '90 days');
    get diagnostics v_rows = row_count;
    v_counts := v_counts || jsonb_build_object('proofs_image_purged_by_created', v_rows);
  end;

  -- ── 4) Support tickets resueltos > 60 días → mantener metadata, nullificar adjunto ──
  begin
    update public.support_tickets
    set image_url = null
    where image_url is not null
      and status in ('resolved', 'closed')
      and coalesce(resolved_at, updated_at, created_at) < (now() - interval '60 days');
    get diagnostics v_rows = row_count;
    v_counts := v_counts || jsonb_build_object('support_image_purged_60d', v_rows);
  exception when undefined_table then
    v_counts := v_counts || jsonb_build_object('support_image_purged_60d', 0);
  when undefined_column then
    update public.support_tickets
    set image_url = null
    where image_url is not null
      and status in ('resolved', 'closed')
      and created_at < (now() - interval '60 days');
    get diagnostics v_rows = row_count;
    v_counts := v_counts || jsonb_build_object('support_image_purged_by_created', v_rows);
  end;

  -- ── 5) Proofs huérfanos (sale_id apunta a venta inexistente) → borrar ──
  begin
    delete from public.payment_proofs p
    where not exists (
      select 1 from public.sales s where s.id = p.sale_id
    );
    get diagnostics v_rows = row_count;
    v_counts := v_counts || jsonb_build_object('proofs_orphaned', v_rows);
  exception when undefined_table then
    v_counts := v_counts || jsonb_build_object('proofs_orphaned', 0);
  end;

  return jsonb_build_object(
    'ok', true,
    'caller', v_email,
    'ran_at', now(),
    'counts', v_counts
  );
end;
$$;

revoke all on function public.mari_cleanup() from public;
grant execute on function public.mari_cleanup() to authenticated;

comment on function public.mari_cleanup() is
  'Limpieza periódica: stories caducas, notifs viejas, proofs/tickets viejos (conserva metadata, libera imagen). Solo admin.';

-- =========================================================================
-- mari_storage_usage — Reporte agregado de uso de Storage por carpeta
-- =========================================================================
-- Devuelve cuántos archivos hay por prefijo y bytes totales aproximados.
-- La UI usa esto para pintar el widget "Llevas usado X MB de 1 GB".
--
-- Nota: storage.objects ya tiene metadata.size en bytes. Solo agrupamos.
create or replace function public.mari_storage_usage()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text;
  v_role    text;
  v_result  jsonb := '[]'::jsonb;
  v_total_bytes bigint := 0;
  v_total_files bigint := 0;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'mari_storage_usage: no authenticated user';
  end if;
  select role into v_role from public.user_profiles where email = v_email limit 1;
  if v_role is null or v_role <> 'admin' then
    raise exception 'mari_storage_usage: requires admin role';
  end if;

  -- Agrupamos por la primera carpeta del path (products/, proofs/, reviews/,
  -- stories/, support/, avatars/, wishes/, etc.)
  with grouped as (
    select
      split_part(name, '/', 1) as folder,
      count(*)::bigint as files,
      coalesce(sum((metadata->>'size')::bigint), 0) as bytes
    from storage.objects
    where bucket_id = 'product-images'
    group by 1
  )
  select
    jsonb_agg(jsonb_build_object(
      'folder', folder,
      'files', files,
      'bytes', bytes,
      'mb', round((bytes::numeric / 1048576.0)::numeric, 2)
    ) order by bytes desc),
    coalesce(sum(bytes), 0),
    coalesce(sum(files), 0)
  into v_result, v_total_bytes, v_total_files
  from grouped;

  return jsonb_build_object(
    'ok', true,
    'bucket', 'product-images',
    'folders', coalesce(v_result, '[]'::jsonb),
    'total_files', v_total_files,
    'total_bytes', v_total_bytes,
    'total_mb', round((v_total_bytes::numeric / 1048576.0)::numeric, 2)
  );
end;
$$;

revoke all on function public.mari_storage_usage() from public;
grant execute on function public.mari_storage_usage() to authenticated;

comment on function public.mari_storage_usage() is
  'Reporte de uso de storage agrupado por carpeta del bucket product-images. Solo admin.';

-- =========================================================================
-- (OPCIONAL) Programar limpieza diaria con pg_cron
-- =========================================================================
-- pg_cron viene habilitado en Supabase Pro. Si tu proyecto lo tiene,
-- descomenta el bloque siguiente para correr la limpieza cada día a las
-- 3 AM UTC (~9 PM CDMX, fuera del horario de venta).
--
-- create extension if not exists pg_cron;
-- select cron.schedule(
--   'mari-daily-cleanup',
--   '0 3 * * *',
--   $$ select public.mari_cleanup(); $$
-- );
