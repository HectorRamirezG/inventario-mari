-- =====================================================================
-- DIAGNÓSTICO 0026: Confirma estado real de la BD después de aplicar 0024+0025
-- =====================================================================
-- Corre esto en SQL Editor DESPUÉS de aplicar 0024 y 0025.
-- Devuelve JSON con el estado real de las columnas y RPCs críticos.
-- Si algo aparece como "MISSING" o "WRONG", ahí está el problema.
-- =====================================================================

SELECT jsonb_pretty(jsonb_build_object(
  -- sales: las columnas que el frontend usa en SELECT/INSERT
  'sales_columns', (
    SELECT jsonb_object_agg(
      column_name,
      jsonb_build_object(
        'type', data_type,
        'nullable', is_nullable,
        'default', column_default
      )
    )
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name IN (
        'shipping_amount', 'is_foreign_shipping',
        'adjustment_amount', 'adjustment_reason',
        'is_layaway', 'public_token', 'payment_url'
      )
  ),
  -- payment_proofs.image_url: debe ser nullable
  'payment_proofs_image_url', (
    SELECT jsonb_build_object(
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    )
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_proofs'
      AND column_name = 'image_url'
  ),
  -- RPCs: deben existir con UNA sola firma cada uno
  'rpcs', (
    SELECT jsonb_object_agg(proname, signatures)
    FROM (
      SELECT
        p.proname,
        jsonb_agg(
          jsonb_build_object(
            'args', pg_get_function_identity_arguments(p.oid),
            'returns', pg_get_function_result(p.oid)
          )
          ORDER BY p.oid
        ) AS signatures
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'create_support_ticket',
          'update_support_ticket_status',
          'mark_all_notifications_read',
          'approve_payment_proof',
          'reject_payment_proof',
          'admin_adjust_sale',
          'apply_movement',
          'decrease_variant_stock',
          'open_cycle',
          'close_cycle',
          'cycle_snapshot',
          'get_public_ticket'
        )
      GROUP BY p.proname
    ) t
  ),
  -- Constraints CHECK en payment_proofs (por si hay alguno que fuerce image_url not null)
  'payment_proofs_checks', (
    SELECT jsonb_agg(jsonb_build_object(
      'name', con.conname,
      'definition', pg_get_constraintdef(con.oid)
    ))
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'payment_proofs'
      AND con.contype = 'c'
  )
)) AS diagnostico;
