-- ════════════════════════════════════════════════════════════════════
-- REVIEWS — Reseñas con foto de los clientes (junio 2026)
-- ════════════════════════════════════════════════════════════════════
-- El cliente sube reseña + foto opcional + rating 1-5.
-- Admin modera: pending → approved | rejected.
-- Solo se muestran approved en la vista pública del producto.
--
-- IMÁGENES: viven en bucket existente `product-images/reviews/<file>`.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),

  -- Producto reseñado
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid references public.variants(id) on delete set null,

  -- Cliente
  customer_email text not null,
  customer_name text,

  -- Contenido
  rating int not null check (rating between 1 and 5),
  comment text,
  image_url text,

  -- Moderación
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  admin_note text,
  moderated_at timestamptz,
  moderated_by uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);

create index if not exists reviews_product_idx on public.reviews(product_id, status, created_at desc);
create index if not exists reviews_status_idx on public.reviews(status, created_at desc);
create index if not exists reviews_customer_idx on public.reviews(lower(customer_email));

alter table public.reviews enable row level security;

-- Todo el mundo puede LEER reseñas aprobadas. Cliente ve también las suyas
-- pendientes. Staff/admin ve TODO.
drop policy if exists reviews_select_public on public.reviews;
create policy reviews_select_public on public.reviews
  for select using (
    status = 'approved'
    or lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_staff_or_admin()
  );

-- Cliente (logueado o invitado) puede crear su reseña con su email.
drop policy if exists reviews_insert_self on public.reviews;
create policy reviews_insert_self on public.reviews
  for insert with check (
    auth.uid() is null
    or lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_staff_or_admin()
  );

-- Solo staff/admin puede UPDATE (moderar) o DELETE.
drop policy if exists reviews_update_staff on public.reviews;
create policy reviews_update_staff on public.reviews
  for update using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

drop policy if exists reviews_delete_staff on public.reviews;
create policy reviews_delete_staff on public.reviews
  for delete using (public.is_staff_or_admin());

grant select, insert on public.reviews to anon, authenticated;
grant update, delete on public.reviews to authenticated;

-- Realtime para que el admin vea aparecer reseñas nuevas
do $$
begin
  begin
    alter publication supabase_realtime add table public.reviews;
  exception when duplicate_object then null;
  end;
end $$;

-- Vista agregada: rating promedio + cuenta por producto (solo approved)
create or replace view public.product_review_stats as
  select
    product_id,
    count(*) as review_count,
    round(avg(rating)::numeric, 2) as avg_rating
  from public.reviews
  where status = 'approved'
  group by product_id;

grant select on public.product_review_stats to anon, authenticated;

notify pgrst, 'reload schema';
