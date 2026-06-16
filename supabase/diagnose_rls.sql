-- ════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO RLS: por qué updateVariant retorna 0 filas
-- Storage SÍ guarda las fotos (Mari está autenticada y puede subir).
-- Pero el UPDATE de variants nunca persiste image_urls.
-- Hipótesis: la RLS `variants_write_staff` requiere `is_staff_or_admin()`
-- y esa función está devolviendo false para Mari.
-- ════════════════════════════════════════════════════════════════════

-- 1) Definición exacta de la función is_staff_or_admin()
--    Quiero ver el cuerpo para saber qué columna/tabla consulta.
select
  p.proname                                       as function_name,
  pg_get_function_arguments(p.oid)                as args,
  pg_get_function_result(p.oid)                   as returns,
  pg_get_functiondef(p.oid)                       as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('is_admin', 'is_staff_or_admin');

-- 2) ¿Existe Mari en user_profiles? Su user_id es bfb34eec-ddd6-4314-b83b-b56aac1b087d
--    (lo confirmamos por los uploads de Storage que ella hizo).
select *
from public.user_profiles
where user_id = 'bfb34eec-ddd6-4314-b83b-b56aac1b087d';

-- 3) Email y metadata de Mari desde auth.users
--    Esperamos email = mariamcontreras07@gmail.com (según seed.sql).
select
  u.id,
  u.email,
  u.raw_user_meta_data,
  u.created_at,
  u.last_sign_in_at
from auth.users u
where u.id = 'bfb34eec-ddd6-4314-b83b-b56aac1b087d';

-- 4) TODOS los perfiles existentes en user_profiles
--    (queremos ver si admin sí está definido para alguien pero no para Mari)
select user_id, role, created_at
from public.user_profiles
order by created_at desc;

-- 5) Estructura de la tabla user_profiles para entender qué espera la RLS
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'user_profiles'
order by ordinal_position;

-- 6) Ejecuta is_staff_or_admin() suplantando la sesión de Mari.
--    Esto simula lo que pasa cuando ella guarda desde la app.
set local role authenticated;
set local request.jwt.claim.sub = 'bfb34eec-ddd6-4314-b83b-b56aac1b087d';
set local request.jwt.claim.email = 'mariamcontreras07@gmail.com';
select public.is_staff_or_admin() as is_admin_for_mari;
reset role;
