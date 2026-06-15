-- =============================================================
-- 0019_diagnose_sales_rls.sql
-- Fecha: 2026-06-15
--
-- Esto NO modifica nada. Solo lista políticas RLS y permisos
-- de las tablas que están dando 400/404, para diagnosticar el
-- POST /sales del cliente que sigue fallando.
--
-- COPIA EL RESULTADO Y MÁNDAMELO COMPLETO.
-- =============================================================

-- 1) ¿RLS está activo en sales, support_tickets, sale_items, payments?
select schemaname, tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename in ('sales','sale_items','payments','payment_proofs','support_tickets')
 order by tablename;

-- 2) Todas las policies actuales de esas tablas
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expr,
  with_check as check_expr
from pg_policies
where schemaname = 'public'
  and tablename in ('sales','sale_items','payments','payment_proofs','support_tickets')
order by tablename, policyname;

-- 3) Permisos por rol sobre la tabla sales
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'sales'
   and grantee in ('anon','authenticated','service_role','public')
 order by grantee, privilege_type;

-- 4) Permisos sobre el RPC create_support_ticket
select grantee, privilege_type
  from information_schema.role_routine_grants
 where routine_schema = 'public' and routine_name = 'create_support_ticket'
   and grantee in ('anon','authenticated','service_role','public')
 order by grantee;

-- 5) Refresca el cache por si acaso quedó pegado
notify pgrst, 'reload schema';
