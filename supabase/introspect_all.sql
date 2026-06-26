-- ============================================================================
-- INTROSPECT_ALL.SQL — UNA SOLA QUERY que devuelve TODO el estado del schema
-- ============================================================================
-- Córrela en Supabase Dashboard → SQL Editor y pega el resultado completo.
-- Devuelve filas con (kind, name, detail json) ordenadas por tipo y nombre.
-- Incluye: tablas+columnas, RPCs+parámetros, policies RLS, triggers, índices,
-- foreign keys, vistas, sequences, tipos enum, storage buckets.
-- ============================================================================

WITH
-- 1) Columnas de cada tabla pública (incluye nullability + default + comment)
tables_cols AS (
  SELECT
    'TABLE'::text AS kind,
    c.table_name AS name,
    jsonb_build_object(
      'columns', jsonb_agg(
        jsonb_build_object(
          'col', c.column_name,
          'type', c.data_type,
          'udt', c.udt_name,
          'nullable', c.is_nullable,
          'default', c.column_default,
          'max_len', c.character_maximum_length
        ) ORDER BY c.ordinal_position
      ),
      'rls_enabled', (
        SELECT relrowsecurity FROM pg_class
        WHERE oid = (c.table_schema || '.' || c.table_name)::regclass
      )
    ) AS detail
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  GROUP BY c.table_schema, c.table_name
),

-- 2) Funciones / RPCs con su firma completa
routines AS (
  SELECT
    'RPC'::text AS kind,
    p.proname AS name,
    jsonb_build_object(
      'returns', pg_get_function_result(p.oid),
      'args', pg_get_function_arguments(p.oid),
      'security', CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END,
      'language', l.lanname,
      'grants', (
        SELECT string_agg(grantee || ':' || privilege_type, ',')
        FROM information_schema.routine_privileges
        WHERE routine_schema = 'public' AND routine_name = p.proname
      )
    ) AS detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
),

-- 3) Policies RLS
policies AS (
  SELECT
    'POLICY'::text AS kind,
    p.tablename || '.' || p.policyname AS name,
    jsonb_build_object(
      'cmd', p.cmd,
      'permissive', p.permissive,
      'roles', p.roles,
      'using', p.qual,
      'check', p.with_check
    ) AS detail
  FROM pg_policies p
  WHERE p.schemaname = 'public'
),

-- 4) Triggers
triggers AS (
  SELECT
    'TRIGGER'::text AS kind,
    t.event_object_table || '.' || t.trigger_name AS name,
    jsonb_build_object(
      'event', t.event_manipulation,
      'timing', t.action_timing,
      'orientation', t.action_orientation,
      'statement', substr(t.action_statement, 1, 200)
    ) AS detail
  FROM information_schema.triggers t
  WHERE t.trigger_schema = 'public'
),

-- 5) Índices (no únicos del PK ya están implícitos)
indexes AS (
  SELECT
    'INDEX'::text AS kind,
    i.schemaname || '.' || i.tablename || '.' || i.indexname AS name,
    jsonb_build_object('definition', i.indexdef) AS detail
  FROM pg_indexes i
  WHERE i.schemaname = 'public'
),

-- 6) Foreign Keys
fks AS (
  SELECT
    'FK'::text AS kind,
    tc.table_name || '.' || tc.constraint_name AS name,
    jsonb_build_object(
      'from', tc.table_name || '.' || kcu.column_name,
      'to', ccu.table_name || '.' || ccu.column_name,
      'on_delete', rc.delete_rule,
      'on_update', rc.update_rule
    ) AS detail
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
   AND ccu.table_schema = tc.table_schema
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
),

-- 7) Vistas
views AS (
  SELECT
    'VIEW'::text AS kind,
    v.table_name AS name,
    jsonb_build_object('definition', substr(v.view_definition, 1, 500)) AS detail
  FROM information_schema.views v
  WHERE v.table_schema = 'public'
),

-- 8) Tipos enum
enums AS (
  SELECT
    'ENUM'::text AS kind,
    t.typname AS name,
    jsonb_build_object(
      'labels', jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
    ) AS detail
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
  GROUP BY t.typname
),

-- 9) Sequences
seqs AS (
  SELECT
    'SEQ'::text AS kind,
    s.sequence_name AS name,
    jsonb_build_object(
      'data_type', s.data_type,
      'start_value', s.start_value,
      'increment', s.increment
    ) AS detail
  FROM information_schema.sequences s
  WHERE s.sequence_schema = 'public'
),

-- 10) Storage buckets
storage_b AS (
  SELECT
    'BUCKET'::text AS kind,
    b.id AS name,
    jsonb_build_object(
      'public', b.public,
      'file_size_limit', b.file_size_limit,
      'allowed_mime_types', b.allowed_mime_types
    ) AS detail
  FROM storage.buckets b
),

-- 11) Counts por tabla (útil para entender el volumen)
table_counts AS (
  SELECT
    'COUNT'::text AS kind,
    relname AS name,
    jsonb_build_object('rows', n_live_tup) AS detail
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
),

all_data AS (
  SELECT * FROM tables_cols
  UNION ALL SELECT * FROM routines
  UNION ALL SELECT * FROM policies
  UNION ALL SELECT * FROM triggers
  UNION ALL SELECT * FROM indexes
  UNION ALL SELECT * FROM fks
  UNION ALL SELECT * FROM views
  UNION ALL SELECT * FROM enums
  UNION ALL SELECT * FROM seqs
  UNION ALL SELECT * FROM storage_b
  UNION ALL SELECT * FROM table_counts
)
SELECT kind, name, detail
FROM all_data
ORDER BY
  CASE kind
    WHEN 'TABLE' THEN 1
    WHEN 'COUNT' THEN 2
    WHEN 'RPC' THEN 3
    WHEN 'POLICY' THEN 4
    WHEN 'TRIGGER' THEN 5
    WHEN 'INDEX' THEN 6
    WHEN 'FK' THEN 7
    WHEN 'VIEW' THEN 8
    WHEN 'ENUM' THEN 9
    WHEN 'SEQ' THEN 10
    WHEN 'BUCKET' THEN 11
    ELSE 99
  END,
  name;
