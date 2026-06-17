-- ════════════════════════════════════════════════════════════════════
-- WISHES — Sugerencias y peticiones de los clientes (junio 2026)
-- ════════════════════════════════════════════════════════════════════
-- Tabla unificada para:
--   1. "Avísame cuando lo tengas": cliente quiere un producto del catálogo
--      que está sin stock o sin esa talla/color (product_id + variant_id seteados).
--   2. "Quiero que traigas esto": cliente pide algo que NO está en el catálogo
--      (sin product_id, solo title/description/image).
--
-- WORKFLOW DE STATUS:
--   pending      → recién creado, admin no lo ha visto
--   reviewing    → admin lo está considerando ("quizá lo traigo")
--   available    → admin ya lo tiene en stock → cliente recibe notif
--   unavailable  → admin no lo puede conseguir → cliente recibe notif
--   fulfilled    → cliente ya lo compró / lo recogió, se cierra
--
-- IMÁGENES: viven en bucket existente `product-images/wishes/<wish_id>/<file>`.
-- El reset operativo ya borra esa carpeta (no tocan avatars/).
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.wishes (
  id uuid primary key default gen_random_uuid(),

  -- Cliente
  customer_email text not null,
  customer_name text,
  customer_phone text,

  -- Referencia opcional al catálogo (si el cliente lo seleccionó)
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.variants(id) on delete set null,

  -- Descripción del deseo
  title text not null,
  description text,
  image_url text,
  size text,
  color text,

  -- Workflow
  status text not null default 'pending'
    check (status in ('pending','reviewing','available','unavailable','fulfilled')),
  admin_note text,

  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists wishes_status_idx on public.wishes(status);
create index if not exists wishes_customer_idx on public.wishes(lower(customer_email));
create index if not exists wishes_created_idx on public.wishes(created_at desc);

alter table public.wishes enable row level security;

-- Cliente (logueado o invitado) puede CREAR su deseo. Si está logueado
-- forzamos que el email coincida con su sesión. Si es anónimo lo dejamos.
drop policy if exists wishes_insert_self on public.wishes;
create policy wishes_insert_self on public.wishes
  for insert with check (
    auth.uid() is null
    or lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_staff_or_admin()
  );

-- Cliente puede LEER solo sus propios deseos. Staff/admin ve todos.
drop policy if exists wishes_select_self on public.wishes;
create policy wishes_select_self on public.wishes
  for select using (
    lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_staff_or_admin()
  );

-- Solo staff/admin puede UPDATE (mover status, agregar notas).
drop policy if exists wishes_update_staff on public.wishes;
create policy wishes_update_staff on public.wishes
  for update using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

-- Solo staff/admin puede DELETE. (Reset operativo lo usa.)
drop policy if exists wishes_delete_staff on public.wishes;
create policy wishes_delete_staff on public.wishes
  for delete using (public.is_staff_or_admin());

-- Grants
grant select, insert on public.wishes to anon, authenticated;
grant update, delete on public.wishes to authenticated;

-- Realtime: para que el admin vea aparecer los wishes en vivo.
do $$
begin
  begin
    alter publication supabase_realtime add table public.wishes;
  exception when duplicate_object then null;
  end;
end $$;

-- Refresca cache de PostgREST
notify pgrst, 'reload schema';
