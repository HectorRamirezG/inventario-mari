-- ════════════════════════════════════════════════════════════════════
-- DELIVERY NOTES — Comandas de entrega para repartidores (junio 2026)
-- ════════════════════════════════════════════════════════════════════
-- Mari arma una comanda asociada a una venta. Genera un link público
-- corto que se manda por WhatsApp al repartidor. El repartidor abre el
-- link y ve TODA la info: cliente (nombre + foto), items, total, balance,
-- método de pago esperado, dirección con mapa, hora prometida, notas.
--
-- WORKFLOW:
--   draft     → Mari la armó pero aún no envía
--   sent      → Link mandado al repartidor
--   picked_up → Repartidor confirmó que salió con el pedido
--   delivered → Entregado y cobrado
--   cancelled → No se entregó (devuelto)
--
-- TOKEN PÚBLICO: aleatorio 32 chars hex. Quien tenga el link entra
-- (no requiere auth — es para el repartidor que no es usuario de la app).
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

create table if not exists public.delivery_notes (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,

  -- Datos del repartidor
  driver_name text,
  driver_phone text,

  -- Logística
  delivery_address text,
  delivery_location_url text, -- google maps / waze pin
  delivery_zone text,         -- "metro hidalgo", "punto medio plaza"
  delivery_time_target text,  -- "hoy 18:00", "mañana 11-13h"
  meeting_point text,         -- "punto medio: estación X"

  -- Cobro esperado
  amount_to_collect numeric not null default 0,
  payment_method_expected text, -- "efectivo", "transferencia", "ya pagado"

  -- Notas extra para el repartidor
  notes text,

  -- Estado
  status text not null default 'draft'
    check (status in ('draft','sent','picked_up','delivered','cancelled')),

  -- Acceso público para el repartidor
  public_token text not null unique default encode(gen_random_bytes(16), 'hex'),

  created_at timestamptz not null default now(),
  sent_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists delivery_notes_sale_idx on public.delivery_notes(sale_id);
create index if not exists delivery_notes_status_idx on public.delivery_notes(status, created_at desc);
create index if not exists delivery_notes_token_idx on public.delivery_notes(public_token);

alter table public.delivery_notes enable row level security;

-- Solo staff/admin puede gestionar las comandas
drop policy if exists delivery_notes_admin_all on public.delivery_notes;
create policy delivery_notes_admin_all on public.delivery_notes
  for all using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

grant select, insert, update, delete on public.delivery_notes to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- RPC pública: get_delivery_note(p_token)
-- Acceso público SIN auth porque el repartidor no tiene cuenta.
-- Retorna JSON con cliente, items, totales, dirección y datos para
-- que el repartidor entregue. NO incluye costo de los items.
-- ════════════════════════════════════════════════════════════════════
create or replace function public.get_delivery_note(p_token text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_note record;
  v_sale record;
  v_items jsonb;
  v_customer jsonb;
begin
  -- Comanda + sale por token
  select dn.*, s.total, s.paid, s.balance, s.customer_name,
         s.customer_email, s.customer_phone, s.customer_address,
         s.customer_location, s.is_layaway, s.status as sale_status
    into v_note
    from public.delivery_notes dn
    join public.sales s on s.id = dn.sale_id
    where dn.public_token = p_token
    limit 1;

  if v_note is null then
    return null;
  end if;

  -- Items con nombre del producto + variante
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', coalesce(p.name, si.product_name_snapshot, 'Producto'),
    'variant_name', coalesce(v.variant_name, si.variant_name_snapshot, ''),
    'qty', si.qty,
    'unit_price', si.unit_price,
    'subtotal', si.qty * si.unit_price,
    'image', coalesce(v.image_urls -> 0, to_jsonb(p.image_url))
  )), '[]'::jsonb)
    into v_items
    from public.sale_items si
    left join public.variants v on v.id = si.variant_id
    left join public.products p on p.id = v.product_id
    where si.sale_id = v_note.sale_id;

  -- Cliente (incluye avatar si está logueado y tiene perfil)
  select jsonb_build_object(
    'name', v_note.customer_name,
    'email', v_note.customer_email,
    'phone', v_note.customer_phone,
    'avatar_url', up.avatar_url
  ) into v_customer
  from (select 1) dummy
  left join public.user_profiles up on lower(up.email) = lower(coalesce(v_note.customer_email, ''));

  return jsonb_build_object(
    'token', v_note.public_token,
    'status', v_note.status,
    'driver_name', v_note.driver_name,
    'driver_phone', v_note.driver_phone,
    'delivery_address', coalesce(v_note.delivery_address, v_note.customer_address),
    'delivery_location_url', coalesce(v_note.delivery_location_url, v_note.customer_location),
    'delivery_zone', v_note.delivery_zone,
    'delivery_time_target', v_note.delivery_time_target,
    'meeting_point', v_note.meeting_point,
    'amount_to_collect', v_note.amount_to_collect,
    'payment_method_expected', v_note.payment_method_expected,
    'notes', v_note.notes,
    'created_at', v_note.created_at,
    'sale', jsonb_build_object(
      'id', v_note.sale_id,
      'total', v_note.total,
      'paid', v_note.paid,
      'balance', v_note.balance,
      'is_layaway', v_note.is_layaway,
      'status', v_note.sale_status
    ),
    'customer', v_customer,
    'items', v_items
  );
end;
$$;

grant execute on function public.get_delivery_note(text) to anon, authenticated;

-- Realtime opcional (admin ve sus comandas refrescadas en vivo)
do $$
begin
  begin
    alter publication supabase_realtime add table public.delivery_notes;
  exception when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
