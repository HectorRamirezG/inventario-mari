-- =============================================================
-- 0018_fix_shipping_and_support.sql
-- Fecha: 2026-06-15  (revisión 2 — alineado al schema REAL)
--
-- Diagnóstico real (basado en introspection de Supabase):
--   ✅ public.sales.is_foreign_shipping  ya existe (boolean, nullable)
--   ✅ public.sales.shipping_amount      ya existe (numeric, nullable)
--   ✅ public.support_tickets            ya existe (text libre, sin CHECK)
--   ✅ create_support_ticket(p_sale_id, p_category, p_description,
--                            p_image_url) → uuid  ya existe
--   ✅ update_support_ticket_status(p_ticket_id, p_status) → void
--                                                    ya existe
--
-- Entonces los 400/404 NO son por columnas/funciones faltantes,
-- son por:
--   1. PostgREST tiene su schema cache pegado → NOTIFY pgrst
--   2. Posiblemente faltan GRANT EXECUTE para anon en el RPC
--   3. Posiblemente falta política RLS de INSERT para anon en
--      support_tickets (los clientes anónimos del /ticket/:token
--      no están autenticados)
--   4. Filas viejas con NULL en is_foreign_shipping / shipping_amount
--      hacen ruido en dashboards/recibos
--
-- Este script NO recrea tablas, NO recrea funciones, NO fuerza
-- NOT NULL ni CHECK rígidos. Solo limpia, asegura permisos y
-- refresca el cache. Es 100% idempotente.
-- =============================================================


-- -------------------------------------------------------------
-- 1) Backfill defensivo + DEFAULT en sales
--    No tocamos NOT NULL para no romper filas históricas; sólo
--    estandarizamos NULL → valor neutro y le ponemos default
--    para futuros inserts que no manden el campo.
-- -------------------------------------------------------------
update public.sales
   set is_foreign_shipping = false
 where is_foreign_shipping is null;

update public.sales
   set shipping_amount = 0
 where shipping_amount is null;

alter table public.sales
  alter column is_foreign_shipping set default false;

alter table public.sales
  alter column shipping_amount set default 0;


-- -------------------------------------------------------------
-- 2) RLS en support_tickets
--    La tabla YA existe. Solo aseguramos que RLS esté activo y
--    que existan las dos políticas mínimas:
--    - SELECT para authenticated  (panel admin/staff)
--    - INSERT para anon + authenticated  (clientes del ticket
--      público que NO están autenticados)
-- -------------------------------------------------------------
alter table public.support_tickets enable row level security;

do $$
begin
  create policy support_tickets_authed_read
    on public.support_tickets
    for select
    to authenticated
    using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy support_tickets_public_insert
    on public.support_tickets
    for insert
    to anon, authenticated
    with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy support_tickets_authed_update
    on public.support_tickets
    for update
    to authenticated
    using (true)
    with check (true);
exception when duplicate_object then null;
end $$;


-- -------------------------------------------------------------
-- 3) GRANT EXECUTE en los RPCs existentes
--    No recreamos las funciones (su firma y cuerpo ya están bien
--    según la introspection). Solo nos aseguramos que anon y
--    authenticated puedan ejecutarlas — esta es la causa común
--    del 404 "function not found in schema cache" cuando la
--    función SÍ existe pero el rol que llama no tiene EXECUTE.
-- -------------------------------------------------------------
grant execute on function
  public.create_support_ticket(uuid, text, text, text)
  to anon, authenticated;

grant execute on function
  public.update_support_ticket_status(uuid, text)
  to authenticated;


-- -------------------------------------------------------------
-- 4) Refresca el schema cache de PostgREST
--    Esto es lo que QUITA literalmente el mensaje
--    "Could not find ... in the schema cache" sin tener que
--    reiniciar nada desde el dashboard.
-- -------------------------------------------------------------
notify pgrst, 'reload schema';


-- -------------------------------------------------------------
-- VERIFICACIÓN OPCIONAL (corre estas líneas después para validar)
-- -------------------------------------------------------------
-- select column_name, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'sales'
--    and column_name in ('is_foreign_shipping','shipping_amount');
--
-- select polname, polroles::regrole[]
--   from pg_policy
--  where polrelid = 'public.support_tickets'::regclass;
--
-- select has_function_privilege('anon',
--   'public.create_support_ticket(uuid,text,text,text)', 'EXECUTE');
