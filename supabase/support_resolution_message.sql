-- ─────────────────────────────────────────────────────────────────────────
-- support_resolution_message.sql
-- Asegura que el cliente pueda ver la RESPUESTA DEL ADMIN cuando este
-- resuelve su ticket de soporte / reporte.
--
-- 100% idempotente: solo agrega lo que falte, NO borra, NO altera datos.
-- Seguro para correr en producción cuantas veces sea necesario.
--
-- Qué hace:
--   1. Si la tabla `support_tickets` no existe, la crea (esquema mínimo).
--   2. Si existe pero le falta la columna `resolution_message`, la agrega.
--   3. Garantiza que el cliente lea SOLO sus propias notificaciones
--      `support_resolved` (no toca las del admin que ya funcionan).
--
-- Impacto en otras tablas / vistas / triggers:
--   - NINGUNO. Solo añade una columna nullable y refresca una policy
--     de SELECT existente. No afecta inserts, updates ni triggers.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Crear tabla si no existe (esquema base; columnas adicionales se
--    agregan abajo de forma idempotente).
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_name   text,
  customer_email  text,
  customer_phone  text,
  category        text NOT NULL DEFAULT 'comment',
  description     text,
  image_url       text,
  status          text NOT NULL DEFAULT 'open',
  resolved_at     timestamptz,
  resolved_by     uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 2) Agregar la columna que necesita el cliente para ver la respuesta
--    del admin. Si ya existe, ADD COLUMN IF NOT EXISTS es no-op.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS resolution_message text;

-- 3) Index ligero para que listMyTickets y la bandeja admin sean rápidas.
CREATE INDEX IF NOT EXISTS support_tickets_email_idx
  ON public.support_tickets (customer_email, created_at DESC);

CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON public.support_tickets (status, created_at DESC);

-- 4) RLS: el cliente puede SELECT sus propios tickets (por email).
--    Admin/staff ya tienen su policy aparte (no la tocamos si existe).
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'support_tickets'
      AND policyname = 'support_tickets_select_own'
  ) THEN
    CREATE POLICY support_tickets_select_own
      ON public.support_tickets
      FOR SELECT
      USING (
        customer_email = (
          SELECT email FROM auth.users WHERE id = auth.uid()
        )
      );
  END IF;
END $$;

-- 5) Sanity check (consulta de verificación, no modifica nada).
-- Ejecuta esto a mano si quieres confirmar que TODO quedó listo:
--
--   SELECT column_name, data_type
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'support_tickets'
--      AND column_name = 'resolution_message';
--
-- Debe regresar UNA fila con (resolution_message, text).
