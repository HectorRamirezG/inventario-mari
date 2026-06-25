-- =====================================================================
-- add_user_emoji.sql
-- Objetivo: permitir que cada cliente elija un emoji personal que
-- Mari (admin) también pueda ver en la lista de usuarios. Antes solo
-- vivía en localStorage del cliente → invisible desde el panel.
--
-- Cómo correrlo: SQL editor de Supabase, una vez. Idempotente.
-- =====================================================================

-- 1) Columna nueva (idempotente)
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS emoji TEXT;

-- 2) Restricción de tamaño: máximo 6 chars (un emoji con modificadores
--    apenas pasa de 4 bytes, dejamos margen). Evita strings basura.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_emoji_len_chk'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_emoji_len_chk
      CHECK (emoji IS NULL OR char_length(emoji) <= 6);
  END IF;
END $$;

-- 3) Comentario para que cualquier dev futuro entienda para qué es
COMMENT ON COLUMN public.user_profiles.emoji IS
  'Emoji personal elegido por el cliente desde su perfil. Se muestra en el avatar de la lista de usuarios admin y en el saludo del hero.';

-- Listo. La app detecta la columna en runtime: si no existe se ignora
-- silenciosamente (fallback ya implementado en profileService).
