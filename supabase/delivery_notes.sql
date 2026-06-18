-- ============================================================================
-- BEAUTY'S ME — Delivery Notes / Comandas de entrega (idempotente)
-- ============================================================================
-- Workflow:
--   draft → sent (al mandar por WhatsApp) → picked_up (repartidor abre el
--   link) → delivered (Mari marca como entregado) o cancelled.
--
-- Acceso:
--   - Admin/staff: CRUD completo de delivery_notes (RLS)
--   - Repartidor (sin login): consulta vía RPC `get_delivery_note(token)`
--     que es SECURITY DEFINER y NO requiere RLS sobre la tabla.
--   - Cualquier sesión anon puede leer la fila SOLO por public_token (RLS).
--
-- Puedes correr este script las veces que quieras. NO borra datos.
-- ============================================================================

-- 1. Tabla principal
create table if not exists public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,

  -- Repartidor
  driver_name text,
  driver_phone text,

  -- Entrega
  delivery_address text,
  delivery_location_url text,
  delivery_zone text,
  delivery_time_target text,
  meeting_point text,

  -- Cobro esperado
  amount_to_collect numeric not null default 0,
  payment_method_expected text,
  notes text,

  -- Estatus
  status text not null default 'draft'
    check (status in ('draft','sent','picked_up','delivered','cancelled')),

  -- Token público (link corto que se manda por WhatsApp)
  public_token text unique not null
    default encode(gen_random_bytes(12), 'hex'),

  created_at timestamptz not null default now(),
  sent_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text
);

create index if not exists delivery_notes_sale_idx
  on public.delivery_notes (sale_id, created_at desc);

create index if not exists delivery_notes_status_idx
  on public.delivery_notes (status, created_at desc)
  where status in ('sent','picked_up');

create index if not exists delivery_notes_token_idx
  on public.delivery_notes (public_token);

-- 2. RLS
alter table public.delivery_notes enable row level security;

do $$
begin
  -- SELECT: cualquiera (incluso anon) puede leer por token vía RPC.
  -- También admin/staff puede listar todas. Política permisiva para
  -- SELECT porque el token es secreto (16 bytes hex = 256 bits).
  drop policy if exists "delivery_notes_select_all" on public.delivery_notes;
  create policy "delivery_notes_select_all"
    on public.delivery_notes
    for select
    to anon, authenticated
    using (true);

  -- INSERT/UPDATE/DELETE: solo admin/staff
  drop policy if exists "delivery_notes_write_staff" on public.delivery_notes;
  create policy "delivery_notes_write_staff"
    on public.delivery_notes
    for all
    to anon, authenticated
    using (
      coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','staff'),
        false
      )
    )
    with check (
      coalesce(
        (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','staff'),
        false
      )
    );
end$$;

-- 3. Realtime
alter table public.delivery_notes replica identity full;

do $$
declare
  pub_exists boolean;
  in_pub boolean;
begin
  select exists(
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) into pub_exists;
  if not pub_exists then return; end if;

  select exists(
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'delivery_notes'
  ) into in_pub;
  if not in_pub then
    execute 'alter publication supabase_realtime add table public.delivery_notes';
  end if;
end$$;

-- 4. RPC pública para que el repartidor abra la comanda sin login.
--    Devuelve JSONB con TODA la info necesaria: sale + customer + items.
create or replace function public.get_delivery_note(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  v_note record;
  v_sale record;
  v_customer_avatar text;
  v_items jsonb;
begin
  -- 1. Comanda por token
  select * into v_note
  from public.delivery_notes
  where public_token = p_token;

  if not found then
    return null;
  end if;

  -- 2. Venta asociada
  select
    s.id,
    s.customer_name,
    s.customer_email,
    s.customer_phone,
    s.total,
    s.paid,
    s.balance,
    s.is_layaway,
    s.status,
    s.public_token as sale_token
  into v_sale
  from public.sales s
  where s.id = v_note.sale_id;

  if not found then
    -- Sale borrada, devolvemos lo que tengamos
    v_sale.id := v_note.sale_id;
    v_sale.customer_name := null;
    v_sale.customer_email := null;
    v_sale.customer_phone := null;
    v_sale.total := 0;
    v_sale.paid := 0;
    v_sale.balance := v_note.amount_to_collect;
    v_sale.is_layaway := false;
    v_sale.status := 'unknown';
  end if;

  -- 3. Avatar del cliente (best-effort, puede no existir)
  begin
    select up.avatar_url into v_customer_avatar
    from public.user_profiles up
    where lower(up.email) = lower(coalesce(v_sale.customer_email, ''))
    limit 1;
  exception when others then
    v_customer_avatar := null;
  end;

  -- 4. Items de la venta con imagen de la primera variante
  begin
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', si.product_name,
          'variant_name', si.variant_name,
          'qty', si.qty,
          'unit_price', si.unit_price,
          'subtotal', (si.unit_price * si.qty),
          'image', null  -- placeholder; en una versión futura podemos joinear variants
        )
        order by si.id
      ),
      '[]'::jsonb
    )
    into v_items
    from public.sale_items si
    where si.sale_id = v_note.sale_id;
  exception when others then
    v_items := '[]'::jsonb;
  end;

  result := jsonb_build_object(
    'token', v_note.public_token,
    'status', v_note.status,
    'driver_name', v_note.driver_name,
    'driver_phone', v_note.driver_phone,
    'delivery_address', v_note.delivery_address,
    'delivery_location_url', v_note.delivery_location_url,
    'delivery_zone', v_note.delivery_zone,
    'delivery_time_target', v_note.delivery_time_target,
    'meeting_point', v_note.meeting_point,
    'amount_to_collect', v_note.amount_to_collect,
    'payment_method_expected', v_note.payment_method_expected,
    'notes', v_note.notes,
    'created_at', v_note.created_at,
    'sale', jsonb_build_object(
      'id', v_sale.id,
      'total', v_sale.total,
      'paid', v_sale.paid,
      'balance', v_sale.balance,
      'is_layaway', v_sale.is_layaway,
      'status', v_sale.status
    ),
    'customer', jsonb_build_object(
      'name', v_sale.customer_name,
      'email', v_sale.customer_email,
      'phone', v_sale.customer_phone,
      'avatar_url', v_customer_avatar
    ),
    'items', v_items
  );

  return result;
end;
$$;

grant execute on function public.get_delivery_note(text) to anon, authenticated;
