-- =====================================================================
-- 0025: Fix final - mark_all_notifications_read + reafirmar fixes 0024
-- =====================================================================
-- Después de auditar TODO el frontend vs el schema real:
--   - Falta el RPC mark_all_notifications_read (lo llama notificationsService.ts)
--   - Reafirmamos el DROP NOT NULL en payment_proofs.image_url
--   - Reafirmamos columnas de sales por si la cache de PostgREST está stale
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) RPC mark_all_notifications_read (lo llama el frontend, falta en BD)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_count integer;
BEGIN
  -- Obtiene el email del usuario actual desde JWT
  v_email := coalesce(
    (auth.jwt() ->> 'email'),
    (auth.jwt() -> 'user_metadata' ->> 'email')
  );

  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_email_in_jwt');
  END IF;

  UPDATE public.notifications
     SET read_at = now()
   WHERE recipient_email = v_email
     AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read()
  TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Reafirmar DROP NOT NULL en payment_proofs.image_url
--    (defensivo: si ya está nullable, no pasa nada)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_proofs'
      AND column_name = 'image_url'
      AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.payment_proofs ALTER COLUMN image_url DROP NOT NULL';
    RAISE NOTICE 'payment_proofs.image_url: DROP NOT NULL aplicado';
  ELSE
    RAISE NOTICE 'payment_proofs.image_url: ya era nullable, no se hace nada';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) Reafirmar columnas de sales (defensivo)
-- ---------------------------------------------------------------------
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS shipping_amount     numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_foreign_shipping boolean DEFAULT false;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS adjustment_amount   numeric DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS adjustment_reason   text;

-- ---------------------------------------------------------------------
-- 4) Forzar reload del cache de PostgREST
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

COMMIT;
