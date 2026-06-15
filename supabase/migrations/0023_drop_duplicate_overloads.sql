-- =====================================================================
-- 0023: Eliminar overloads duplicados y forzar reload del cache PostgREST
-- =====================================================================
-- El dump muestra:
--   create_support_ticket(text, text, text, uuid)  RETURNS jsonb   <- la que usa el frontend
--   create_support_ticket(uuid, text, text, text)  RETURNS uuid    <- vieja, duplicada
--   update_support_ticket_status(uuid, text, text) RETURNS jsonb   <- la que usa el frontend
--   update_support_ticket_status(uuid, text)        RETURNS void    <- vieja, duplicada
--
-- Con overloads PostgREST devuelve 404 porque no sabe cuál escoger.
-- Eliminamos las viejas y forzamos reload del cache.
-- =====================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.create_support_ticket(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.update_support_ticket_status(uuid, text);

NOTIFY pgrst, 'reload schema';

COMMIT;
