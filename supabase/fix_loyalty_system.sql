-- ============================================================================
-- HOTFIX: Sistema de Premios (loyalty / puntos)
-- ============================================================================
-- Tres tablas + dos RPC + cuatro triggers automáticos para gamificar la
-- experiencia del cliente. Configurable por el admin desde Reglas/Premios:
--   - loyalty_rules    : catálogo de acciones que dan puntos
--   - loyalty_balance  : puntos totales por cliente_email
--   - loyalty_events   : historial detallado (positivo = gana, negativo = canjea)
--
-- IDEMPOTENTE: drop + recreate, seed con ON CONFLICT DO NOTHING.
-- ============================================================================

begin;

-- =========================================================================
-- 1) Tablas
-- =========================================================================
create table if not exists public.loyalty_rules (
  action_key  text primary key,
  label       text not null,
  description text,
  points      integer not null default 0,
  enabled     boolean not null default true,
  -- one_time = la acción solo da puntos UNA VEZ por cliente (ej. subir foto).
  -- Cuando false, cada ocurrencia suma (ej. cada compra).
  one_time    boolean not null default false,
  emoji       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table if not exists public.loyalty_balance (
  customer_email   text primary key,
  points           integer not null default 0,
  lifetime_earned  integer not null default 0,
  lifetime_spent   integer not null default 0,
  updated_at       timestamptz default now()
);

create table if not exists public.loyalty_events (
  id              uuid primary key default gen_random_uuid(),
  customer_email  text not null,
  action_key      text,
  -- delta positivo = ganó puntos. delta negativo = canjeó.
  delta           integer not null,
  note            text,
  ref_table       text,
  ref_id          text,
  created_at      timestamptz default now()
);

create index if not exists idx_loyalty_events_email
  on public.loyalty_events(customer_email, created_at desc);
create index if not exists idx_loyalty_events_action
  on public.loyalty_events(action_key);

-- =========================================================================
-- 2) Seed inicial de reglas (no pisa si ya existen)
-- =========================================================================
insert into public.loyalty_rules
  (action_key, label, points, one_time, emoji, description)
values
  ('profile_photo',    'Sube tu foto de perfil',       5,  true,  '📸', 'Una sola vez: pon tu carita para que el equipo te reconozca'),
  ('profile_address',  'Captura tu dirección',         10, true,  '📍', 'Una sola vez: agiliza tus envíos'),
  ('profile_phone',    'Captura tu WhatsApp',          5,  true,  '📱', 'Una sola vez: te avisamos cuando llegue tu pedido'),
  ('first_purchase',   'Tu primera compra',            50, true,  '🛍️', 'Bonus de bienvenida en tu primer apartado'),
  ('any_purchase',     'Cada compra',                  5,  false, '💝', 'Por cada pedido que apartas, ganas puntos'),
  ('review_with_photo','Reseña con foto',              15, false, '⭐', 'Comparte tu experiencia con foto'),
  ('review_simple',    'Reseña escrita',               5,  false, '✍️', 'Deja tu opinión aunque sea sin foto'),
  ('share_store',      'Compartir la tienda',          10, false, '🔗', 'Comparte el catálogo con tus amigas'),
  ('birthday',         'Cumpleaños',                   100, false,'🎂', 'Bonus anual en tu cumpleaños')
on conflict (action_key) do nothing;

-- =========================================================================
-- 3) RPC: award_loyalty_points
-- =========================================================================
-- Otorga puntos al cliente por una acción. Respeta one_time. Actualiza
-- balance y registra event en una sola transacción. Devuelve los puntos
-- otorgados (0 si no aplica).
create or replace function public.award_loyalty_points(
  p_email  text,
  p_action text,
  p_ref_id text default null,
  p_note   text default null
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule  record;
  v_email text := lower(btrim(p_email));
  v_already_one_time boolean;
begin
  if v_email is null or v_email = '' then
    return 0;
  end if;

  select * into v_rule
    from public.loyalty_rules
   where action_key = p_action and enabled = true;

  if v_rule is null then
    return 0;
  end if;

  -- Si es one-time, salimos si ya existe un evento positivo previo.
  if v_rule.one_time then
    select exists (
      select 1
        from public.loyalty_events
       where customer_email = v_email
         and action_key = p_action
         and delta > 0
    ) into v_already_one_time;
    if v_already_one_time then
      return 0;
    end if;
  end if;

  insert into public.loyalty_events
    (customer_email, action_key, delta, note, ref_id)
  values
    (v_email, p_action, v_rule.points,
     coalesce(p_note, v_rule.label), p_ref_id);

  insert into public.loyalty_balance
    (customer_email, points, lifetime_earned)
  values
    (v_email, v_rule.points, v_rule.points)
  on conflict (customer_email) do update
    set points          = loyalty_balance.points + v_rule.points,
        lifetime_earned = loyalty_balance.lifetime_earned + v_rule.points,
        updated_at      = now();

  return v_rule.points;
end;
$$;

-- =========================================================================
-- 4) RPC: spend_loyalty_points
-- =========================================================================
-- El cliente canjea N puntos (ej. al hacer un apartado). Devuelve true
-- si tenía saldo suficiente; false si no. Atómico bajo transacción.
create or replace function public.spend_loyalty_points(
  p_email  text,
  p_points integer,
  p_note   text default 'Canjeado en compra',
  p_ref_id text default null
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance integer;
  v_email   text := lower(btrim(p_email));
begin
  if v_email is null or v_email = '' or p_points <= 0 then
    return false;
  end if;

  select points into v_balance
    from public.loyalty_balance
   where customer_email = v_email
   for update;

  if v_balance is null or v_balance < p_points then
    return false;
  end if;

  update public.loyalty_balance
     set points         = points - p_points,
         lifetime_spent = lifetime_spent + p_points,
         updated_at     = now()
   where customer_email = v_email;

  insert into public.loyalty_events
    (customer_email, action_key, delta, note, ref_id)
  values
    (v_email, 'spend', -p_points, p_note, p_ref_id);

  return true;
end;
$$;

-- =========================================================================
-- 5) Trigger: INSERT en sales → award any_purchase + first_purchase
-- =========================================================================
create or replace function public.tg_loyalty_on_sale_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  v_email := lower(btrim(new.customer_email));
  if v_email is null or v_email = '' then
    return new;
  end if;

  -- first_purchase es one-time (la RPC se asegura sola de no duplicar).
  perform public.award_loyalty_points(
    v_email, 'first_purchase', new.id::text, null
  );
  perform public.award_loyalty_points(
    v_email, 'any_purchase', new.id::text, null
  );
  return new;
exception when others then
  raise warning '[tg_loyalty_on_sale_insert] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_loyalty_on_sale_insert on public.sales;
create trigger trg_loyalty_on_sale_insert
  after insert on public.sales
  for each row
  execute function public.tg_loyalty_on_sale_insert();

-- =========================================================================
-- 6) Trigger: INSERT en reviews → award review_with_photo / review_simple
-- =========================================================================
create or replace function public.tg_loyalty_on_review_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  v_email := lower(btrim(new.customer_email));
  if v_email is null or v_email = '' then
    return new;
  end if;
  -- Solo otorga al crear la reseña (pending o published). Si se rechaza
  -- después, el cliente conserva los puntos por el esfuerzo de escribirla.
  if new.status not in ('pending','published') then
    return new;
  end if;

  if new.image_url is not null and btrim(new.image_url) <> '' then
    perform public.award_loyalty_points(
      v_email, 'review_with_photo', new.id::text, null
    );
  else
    perform public.award_loyalty_points(
      v_email, 'review_simple', new.id::text, null
    );
  end if;
  return new;
exception when others then
  raise warning '[tg_loyalty_on_review_insert] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_loyalty_on_review_insert on public.reviews;
create trigger trg_loyalty_on_review_insert
  after insert on public.reviews
  for each row
  execute function public.tg_loyalty_on_review_insert();

-- =========================================================================
-- 7) Trigger: UPDATE de user_profiles → award profile_photo/address/phone
-- =========================================================================
create or replace function public.tg_loyalty_on_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  v_email := lower(btrim(new.email));
  if v_email is null or v_email = '' then
    return new;
  end if;

  -- avatar_url puesto por 1ª vez
  if (old.avatar_url is null or btrim(old.avatar_url) = '')
     and new.avatar_url is not null and btrim(new.avatar_url) <> '' then
    perform public.award_loyalty_points(v_email, 'profile_photo', null, null);
  end if;

  if (old.address is null or btrim(old.address) = '')
     and new.address is not null and btrim(new.address) <> '' then
    perform public.award_loyalty_points(v_email, 'profile_address', null, null);
  end if;

  if (old.phone is null or btrim(old.phone) = '')
     and new.phone is not null and btrim(new.phone) <> '' then
    perform public.award_loyalty_points(v_email, 'profile_phone', null, null);
  end if;

  return new;
exception when others then
  raise warning '[tg_loyalty_on_profile_update] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_loyalty_on_profile_update on public.user_profiles;
create trigger trg_loyalty_on_profile_update
  after update of avatar_url, address, phone on public.user_profiles
  for each row
  execute function public.tg_loyalty_on_profile_update();

-- =========================================================================
-- 8) RLS y permisos
-- =========================================================================
alter table public.loyalty_rules   enable row level security;
alter table public.loyalty_balance enable row level security;
alter table public.loyalty_events  enable row level security;

-- loyalty_rules: todos pueden LEER (catálogo público), solo admin/staff escribe
drop policy if exists loyalty_rules_read_all on public.loyalty_rules;
create policy loyalty_rules_read_all on public.loyalty_rules
  for select to anon, authenticated using (true);

drop policy if exists loyalty_rules_admin_write on public.loyalty_rules;
create policy loyalty_rules_admin_write on public.loyalty_rules
  for all to authenticated
  using (
    exists (
      select 1 from public.user_profiles
       where id = auth.uid() and role in ('admin','staff')
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
       where id = auth.uid() and role in ('admin','staff')
    )
  );

-- loyalty_balance: el cliente lee SOLO su balance, admin lo lee todo
drop policy if exists loyalty_balance_self on public.loyalty_balance;
create policy loyalty_balance_self on public.loyalty_balance
  for select to authenticated
  using (
    lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists loyalty_balance_admin on public.loyalty_balance;
create policy loyalty_balance_admin on public.loyalty_balance
  for all to authenticated
  using (
    exists (
      select 1 from public.user_profiles
       where id = auth.uid() and role in ('admin','staff')
    )
  )
  with check (true);

-- loyalty_events: el cliente lee SOLO sus eventos, admin lee todo
drop policy if exists loyalty_events_self on public.loyalty_events;
create policy loyalty_events_self on public.loyalty_events
  for select to authenticated
  using (
    lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists loyalty_events_admin on public.loyalty_events;
create policy loyalty_events_admin on public.loyalty_events
  for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles
       where id = auth.uid() and role in ('admin','staff')
    )
  );

grant select on public.loyalty_rules, public.loyalty_balance, public.loyalty_events
  to anon, authenticated;
grant execute on function public.award_loyalty_points(text,text,text,text)
  to authenticated, service_role;
grant execute on function public.spend_loyalty_points(text,integer,text,text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- VERIFICACIÓN (correr después)
-- ============================================================================
-- select action_key, label, points, enabled from public.loyalty_rules order by points desc;
-- select count(*) as users_with_points from public.loyalty_balance;
-- select * from public.loyalty_events order by created_at desc limit 20;
