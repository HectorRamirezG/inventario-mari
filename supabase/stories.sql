-- ════════════════════════════════════════════════════════════════════
-- STORIES — Fotos del día estilo Instagram (junio 2026)
-- ════════════════════════════════════════════════════════════════════
-- Mari sube 3-5 fotos diarias que el cliente ve al abrir la tienda.
-- Cada story expira automáticamente después de N horas (default 24).
-- Soporta link opcional a un producto del catálogo (CTA "Ver producto").
--
-- IMÁGENES: viven en bucket existente `product-images/stories/<file>`.
-- El reset operativo limpia esa carpeta junto con las demás.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),

  -- Contenido
  image_url text not null,
  caption text,

  -- CTA opcional
  product_id uuid references public.products(id) on delete set null,
  link_url text,

  -- Lifecycle
  is_published boolean not null default true,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  view_count int not null default 0,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists stories_active_idx on public.stories(expires_at desc) where is_published = true;
create index if not exists stories_created_idx on public.stories(created_at desc);

alter table public.stories enable row level security;

-- TODO el mundo (incluso anónimo) puede LEER stories activas y publicadas.
drop policy if exists stories_select_public on public.stories;
create policy stories_select_public on public.stories
  for select using (
    is_published = true and expires_at > now()
    or public.is_staff_or_admin()
  );

-- Solo staff/admin puede crear, actualizar o eliminar.
drop policy if exists stories_write_staff on public.stories;
create policy stories_write_staff on public.stories
  for all using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

grant select on public.stories to anon, authenticated;
grant insert, update, delete on public.stories to authenticated;

-- Realtime para que el admin vea su propia publicación al instante
do $$
begin
  begin
    alter publication supabase_realtime add table public.stories;
  exception when duplicate_object then null;
  end;
end $$;

-- Función helper para registrar una vista (rate-limited a 1 por sesión via cliente)
create or replace function public.increment_story_view(p_story_id uuid)
returns void
language sql
security definer
as $$
  update public.stories
    set view_count = view_count + 1
    where id = p_story_id
      and is_published = true
      and expires_at > now();
$$;

grant execute on function public.increment_story_view(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
