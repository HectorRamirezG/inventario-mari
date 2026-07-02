-- ─────────────────────────────────────────────────────────────
-- Deduplicación de notificaciones cuando un mismo evento genera N.
--
-- Motivación:
--   Cuando el admin aprueba un pago, se están generando 3-5
--   notificaciones al cliente para el mismo evento:
--     • "Recibimos tu comprobante"   (upload — legítima)
--     • "Pago de $X aprobado"        (approve — legítima)
--     • "Tu pago fue aprobado"       (trigger BD — DUPLICADA)
--     • "Pago registrado en tu apartado"  (trigger BD — DUPLICADA)
--     • "¡Ganaste N puntos!"         (trigger BD loyalty — redundante)
--
--   Los 3 duplicados vienen de triggers Postgres que se acumularon
--   en versiones anteriores. Este migration los limpia + agrega un
--   trigger defensivo BEFORE INSERT que evita insertar la misma
--   notif dentro de 60 segundos.
--
-- Estrategia:
--   1) Dropear triggers CONOCIDOS que generan notifs duplicadas
--      (por nombre y patrón).
--   2) Trigger BEFORE INSERT `dedupe_notification` que rechaza
--      duplicados: mismo (user_id | user_email) + type similar +
--      metadata.sale_id igual + < 60 seg entre inserts.
--
-- Nota importante:
--   Este SQL es IDEMPOTENTE: se puede correr múltiples veces sin
--   romper nada. Los triggers que ya no existan se ignoran
--   (`IF EXISTS`).
-- ─────────────────────────────────────────────────────────────

-- 1) Drop triggers CONOCIDOS que insertan notifs desde payments/sales.
--    Nombres típicos que aparecen en instalaciones de esta app. Si
--    encuentras más, agrégalos al SELECT del bloque DO abajo.
DO $$
DECLARE
  trg RECORD;
  known_names TEXT[] := ARRAY[
    'trg_notify_client_on_payment',
    'trg_after_payment_notify_client',
    'trg_notify_payment_registered',
    'trg_award_loyalty_on_payment',
    'trg_notify_loyalty_earned',
    'trg_notify_sale_paid',
    'trg_after_sale_status_paid',
    'notify_client_on_payment',
    'award_loyalty_on_payment_insert'
  ];
  tables TEXT[] := ARRAY['payments', 'sales', 'sale_items'];
  tbl TEXT;
  name TEXT;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    FOREACH name IN ARRAY known_names LOOP
      BEGIN
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', name, tbl);
      EXCEPTION WHEN OTHERS THEN
        -- Silenciamos si la tabla o trigger no existe.
        NULL;
      END;
    END LOOP;
  END LOOP;

  -- Barrido amplio: cualquier trigger en payments/sales con
  -- "notif", "notify" o "loyalty" en su nombre (defensivo).
  FOR trg IN
    SELECT tgname, tgrelid::regclass::text AS tbl_name
    FROM pg_trigger
    WHERE tgrelid IN (
      to_regclass('public.payments'),
      to_regclass('public.sales')
    )
    AND NOT tgisinternal
    AND (
      tgname ILIKE '%notif%'
      OR tgname ILIKE '%notify%'
      OR tgname ILIKE '%loyalty%'
      OR tgname ILIKE '%award%'
    )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', trg.tgname, trg.tbl_name);
    RAISE NOTICE 'Dropped trigger: % on %', trg.tgname, trg.tbl_name;
  END LOOP;
END $$;

-- 2) Trigger DEDUPE en notifications: bloquea duplicados dentro de 60s.
--    Regla: si en los últimos 60 segundos existe otra notif con MISMO
--    destinatario Y misma `metadata.sale_id`, se DESCARTA silenciosamente.
--    Esto protege incluso si algún trigger "escondido" siga insertando.

CREATE OR REPLACE FUNCTION public.dedupe_notification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_sale_id TEXT;
  target_recipient TEXT;
  existing_count INT;
BEGIN
  -- Extrae el sale_id de la metadata (si existe). Sirve como clave
  -- de agrupación para "es la misma acción".
  target_sale_id := COALESCE(
    NEW.metadata->>'sale_id',
    NEW.metadata->>'saleId',
    NULL
  );

  -- Destinatario: soportamos user_id (uuid) o user_email (text). La
  -- app usa `user_email` para clientes; tokens de admin usan `user_id`.
  target_recipient := COALESCE(
    NULLIF(NEW.user_email, ''),
    NULLIF(NEW.user_id::text, '')
  );

  IF target_sale_id IS NULL OR target_recipient IS NULL THEN
    -- Sin claves confiables para deduplicar → pasa normal.
    RETURN NEW;
  END IF;

  -- ¿Ya hay una notif para el MISMO destinatario + sale_id en los
  -- últimos 60 segundos? Si sí, esta es duplicado.
  SELECT COUNT(*) INTO existing_count
  FROM public.notifications
  WHERE (
    (user_email IS NOT NULL AND user_email = target_recipient)
    OR (user_id IS NOT NULL AND user_id::text = target_recipient)
  )
  AND created_at > NOW() - INTERVAL '60 seconds'
  AND (
    metadata->>'sale_id' = target_sale_id
    OR metadata->>'saleId' = target_sale_id
  );

  IF existing_count > 0 THEN
    -- Duplicado detectado. NULL en un BEFORE trigger = descarta el insert.
    RAISE NOTICE 'dedupe_notification: descartada notif duplicada para % / sale %',
      target_recipient, target_sale_id;
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- Aplica el trigger (idempotente).
DROP TRIGGER IF EXISTS trg_dedupe_notification ON public.notifications;
CREATE TRIGGER trg_dedupe_notification
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dedupe_notification();

COMMENT ON FUNCTION public.dedupe_notification IS
  'Rechaza notificaciones duplicadas dentro de 60s para el mismo destinatario+sale_id. Protege contra triggers legacy que generan N notifs por evento.';
