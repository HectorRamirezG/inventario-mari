-- ════════════════════════════════════════════════════════════════════
-- 2026-06-29 — Audit log de acciones admin
--
-- Tabla central que registra "quién hizo qué" sobre entidades críticas
-- (sales, products, payments, etc.). Útil cuando algo se ve raro y
-- Mari necesita saber qué empleada lo hizo y cuándo.
--
-- NO usa triggers automáticos — el frontend hace el INSERT explícito
-- desde los services (cancelSale, deleteProduct, adjustSale, etc.).
-- Eso da control fino sobre qué se loguea y con qué metadata.
--
-- Ejecutar UNA vez en Supabase Dashboard → SQL Editor.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Quién hizo la acción
  user_id uuid,
  user_email text,
  user_role text, -- 'admin' | 'staff' | 'cashier' | ...
  -- Qué hizo
  action text not null, -- ej: 'sale.cancelled', 'product.deleted', 'sale.adjusted'
  entity text not null, -- ej: 'sales', 'products'
  entity_id text not null, -- uuid de la entidad afectada
  -- Contexto
  before jsonb, -- estado previo (snapshot relevante)
  after jsonb,  -- estado nuevo (cambios)
  reason text,  -- motivo libre opcional (ej: "Cliente pidió cancelar")
  -- Metadata extra (IP, UA, etc.)
  metadata jsonb default '{}'::jsonb
);

-- Índices para consulta rápida en Dashboard.
create index if not exists admin_audit_created_at_idx
  on public.admin_audit (created_at desc);
create index if not exists admin_audit_action_idx
  on public.admin_audit (action);
create index if not exists admin_audit_entity_idx
  on public.admin_audit (entity, entity_id);
create index if not exists admin_audit_user_email_idx
  on public.admin_audit (user_email);

-- RLS: solo admin lee. Cualquier authenticated puede insertar (los
-- services validan permisos a nivel app).
alter table public.admin_audit enable row level security;

drop policy if exists "admin_audit_select_admin" on public.admin_audit;
create policy "admin_audit_select_admin" on public.admin_audit
  for select to authenticated
  using (public.is_admin());

drop policy if exists "admin_audit_insert_authenticated" on public.admin_audit;
create policy "admin_audit_insert_authenticated" on public.admin_audit
  for insert to authenticated
  with check (true);

-- NO DELETE / UPDATE: el audit log es append-only por diseño.
-- Si necesitas purgar registros viejos (compliance), correr DELETE
-- como superuser en SQL editor con WHERE created_at < ...

grant select, insert on public.admin_audit to authenticated;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN OPCIONAL:
-- select count(*) from admin_audit;
-- ════════════════════════════════════════════════════════════════════
