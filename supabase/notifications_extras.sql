-- ============================================================================
-- BEAUTY'S ME — Extras del sistema de notificaciones (idempotente)
-- ============================================================================
-- Este script:
--   1. Agrega columna `birthday` (DATE) a user_profiles si no existe.
--      Se usa para disparar la notif de cumpleaños.
--   2. Trigger opcional `notify_low_stock_trg` en variants: cuando el
--      stock baja por debajo del umbral (3), inserta directamente una
--      notif al admin con dedup por día.
--   3. Trigger opcional `notify_back_in_stock_trg` en variants: cuando
--      el stock pasa de 0 a >0, marca un evento para que la app cliente
--      lo descubra. (La notif al cliente se sigue disparando en cliente
--      porque la wishlist es localStorage.)
--
-- Puedes correr este script las veces que quieras. NO borra datos.
-- ============================================================================

-- 1. Columna birthday
alter table public.user_profiles
  add column if not exists birthday date;

create index if not exists user_profiles_birthday_md_idx
  on public.user_profiles (
    extract(month from birthday),
    extract(day from birthday)
  )
  where birthday is not null;

-- 2. Trigger: stock_low
-- Se dispara DESPUÉS de UPDATE en variants. Si el stock cruzó hacia abajo
-- del umbral por defecto (3) inserta una notif (con dedup por fecha+variant).
create or replace function public.notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold int := 3;
  prod_name text;
  ck text;
  exists_today boolean;
begin
  -- Solo si bajó (no si subió o se quedó igual)
  if new.stock = old.stock or new.stock > old.stock then
    return new;
  end if;
  if new.stock > threshold then
    return new;
  end if;
  if new.stock <= 0 then
    return new; -- agotado se maneja separado en checks at-load
  end if;

  -- Saca el nombre del producto
  select p.name into prod_name
  from public.products p
  where p.id = new.product_id;

  ck := 'low-stock-' || new.id::text || '-' || to_char(now(), 'YYYY-MM-DD');

  -- Dedup: ¿ya disparamos una notif para esta variante hoy?
  select exists(
    select 1
    from public.notifications
    where type = 'stock_low'
      and metadata->>'variant_id' = new.id::text
      and metadata->>'date' = to_char(now(), 'YYYY-MM-DD')
  ) into exists_today;
  if exists_today then
    return new;
  end if;

  insert into public.notifications (
    recipient_role, type, title, body, link, metadata
  ) values (
    'admin',
    'stock_low',
    'Stock bajo: ' || coalesce(prod_name, 'producto') || ' · ' || coalesce(new.name, 'variante'),
    'Quedan ' || new.stock || ' unidades. Considera reabastecer.',
    '/inventario?variant=' || new.id::text,
    jsonb_build_object(
      'variant_id', new.id::text,
      'product_id', new.product_id,
      'stock', new.stock,
      'threshold', threshold,
      'date', to_char(now(), 'YYYY-MM-DD'),
      'checkpoint', ck
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_low_stock_trg on public.variants;
create trigger notify_low_stock_trg
  after update of stock on public.variants
  for each row
  execute function public.notify_low_stock();

-- 3. Trigger: stock_back (0 → >0)
-- Inserta una notif "admin" indicando que la variante regresó al stock.
-- La notif al cliente se dispara desde el lado cliente (la wishlist
-- está en localStorage).
create or replace function public.notify_back_in_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prod_name text;
  exists_today boolean;
begin
  if not (old.stock <= 0 and new.stock > 0) then
    return new;
  end if;

  select p.name into prod_name
  from public.products p
  where p.id = new.product_id;

  -- Dedup: una sola notif por variante por día
  select exists(
    select 1
    from public.notifications
    where type = 'stock_back'
      and metadata->>'variant_id' = new.id::text
      and metadata->>'date' = to_char(now(), 'YYYY-MM-DD')
  ) into exists_today;
  if exists_today then
    return new;
  end if;

  insert into public.notifications (
    recipient_role, type, title, body, link, metadata
  ) values (
    'admin',
    'stock_back',
    'Producto reabastecido: ' || coalesce(prod_name, 'producto'),
    'La variante "' || coalesce(new.name, 'variante') || '" regresó al stock (' || new.stock || ' uds).',
    '/inventario?variant=' || new.id::text,
    jsonb_build_object(
      'variant_id', new.id::text,
      'product_id', new.product_id,
      'stock', new.stock,
      'date', to_char(now(), 'YYYY-MM-DD')
    )
  );

  return new;
end;
$$;

drop trigger if exists notify_back_in_stock_trg on public.variants;
create trigger notify_back_in_stock_trg
  after update of stock on public.variants
  for each row
  execute function public.notify_back_in_stock();
