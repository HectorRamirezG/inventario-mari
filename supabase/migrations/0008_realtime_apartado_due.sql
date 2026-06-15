-- =============================================================
-- 0008 · Realtime + fecha de vencimiento de apartado
-- =============================================================
-- Habilita realtime sobre `sales` para que admin/staff reciban
-- notificaciones cuando un cliente realiza un apartado, y agrega
-- columna opcional `apartado_due_date` para mostrar countdown.
--
-- IDEMPOTENTE: puedes correrlo varias veces sin romper nada.
-- =============================================================

-- ------------------------------------------------------------
-- 1. Columna opcional para deadline de apartado
-- ------------------------------------------------------------
alter table public.sales
  add column if not exists apartado_due_date date;

comment on column public.sales.apartado_due_date is
  'Fecha límite que el cliente tiene para liquidar el apartado. '
  'Si es NULL se asume created_at + 30 días.';

-- ------------------------------------------------------------
-- 2. Habilitar la tabla en la publicación realtime
-- ------------------------------------------------------------
do $$
declare
  pub_exists boolean;
begin
  select exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) into pub_exists;
  if not pub_exists then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'sales'
  ) then
    execute 'alter publication supabase_realtime add table public.sales';
  end if;
end$$;

-- ------------------------------------------------------------
-- 3. Asegurar grants sobre las vistas públicas (defensa en
--    profundidad; ya cubiertos por 0007 pero no estorba)
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.views
     where table_schema = 'public' and table_name = 'products_public'
  ) then
    grant select on public.products_public to anon, authenticated;
  end if;
  if exists (
    select 1 from information_schema.views
     where table_schema = 'public' and table_name = 'variants_public'
  ) then
    grant select on public.variants_public to anon, authenticated;
  end if;
end$$;

-- ------------------------------------------------------------
-- 4. Política RLS: invitados (anon) pueden crear apartados con
--    su email + datos de contacto.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'sales'
       and column_name = 'customer_email'
  ) then
    drop policy if exists "anon_insert_layaway" on public.sales;
    create policy "anon_insert_layaway"
      on public.sales
      for insert
      to anon
      with check (
        is_layaway = true
        and customer_email is not null
        and length(customer_email) >= 5
      );

    -- Permitir a anon insertar sale_items SOLO si la venta padre es
    -- un apartado pendiente recientemente creado (3 minutos de gracia).
    drop policy if exists "anon_insert_layaway_items" on public.sale_items;
    create policy "anon_insert_layaway_items"
      on public.sale_items
      for insert
      to anon
      with check (
        exists (
          select 1
            from public.sales s
           where s.id = sale_items.sale_id
             and s.is_layaway = true
             and s.status = 'pending'
             and s.created_at > now() - interval '3 minutes'
        )
      );
  end if;
end$$;

-- ------------------------------------------------------------
-- Final
-- ------------------------------------------------------------
do $$ begin
  raise notice '0008: realtime habilitado + apartado_due_date agregada + policies anon listas.';
end $$;
