-- =========================================================================
-- site_visitors + list_all_users + list_visitors + track_visit
-- =========================================================================
-- Idempotente. Maneja:
--   site_visitors    : tracking anonimo de quien navega la tienda publica
--   list_all_users() : RPC admin que devuelve todos los user_profiles + KPIs
--   list_visitors()  : RPC admin que devuelve visitantes anonimos
--   track_visit()    : RPC public para que el cliente reporte cada navegada
--
-- Politica de privacidad: NO trackeamos IP, geo, ni huellas de fingerprint.
-- Solo session_id local (localStorage), user_agent y rutas visitadas.
-- =========================================================================

create table if not exists public.site_visitors (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null unique,
  user_agent      text,
  pages_viewed    jsonb not null default '[]'::jsonb,
  total_visits    int not null default 1,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  converted_user_email text -- se llena cuando el visitor se registra
);

create index if not exists idx_site_visitors_session on public.site_visitors(session_id);
create index if not exists idx_site_visitors_last_seen on public.site_visitors(last_seen_at desc);
create index if not exists idx_site_visitors_unconverted
  on public.site_visitors(last_seen_at desc) where converted_user_email is null;

alter table public.site_visitors enable row level security;

-- Solo admin/staff puede leer
drop policy if exists site_visitors_read_staff on public.site_visitors;
create policy site_visitors_read_staff on public.site_visitors
  for select using (
    exists (
      select 1 from public.user_profiles up
      where up.email = (auth.jwt() ->> 'email') and up.role in ('admin', 'staff')
    )
  );

-- Inserciones/updates SOLO via RPC SECURITY DEFINER. No policy directa.

-- =========================================================================
-- track_visit: idempotente — upserts por session_id + agrega path al historial
-- =========================================================================
create or replace function public.track_visit(
  p_session_id text,
  p_user_agent text default null,
  p_path text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  if p_session_id is null or char_length(p_session_id) < 4 then
    return;
  end if;

  -- Si el caller esta logueado, lo marcamos como convertido
  v_email := auth.jwt() ->> 'email';

  insert into public.site_visitors (
    session_id,
    user_agent,
    pages_viewed,
    converted_user_email,
    first_seen_at,
    last_seen_at
  ) values (
    p_session_id,
    nullif(p_user_agent, ''),
    case
      when p_path is not null and p_path <> '' then
        jsonb_build_array(jsonb_build_object('path', p_path, 'at', now()))
      else '[]'::jsonb
    end,
    v_email,
    now(),
    now()
  )
  on conflict (session_id) do update
    set last_seen_at = now(),
        total_visits = public.site_visitors.total_visits + 1,
        user_agent = coalesce(excluded.user_agent, public.site_visitors.user_agent),
        converted_user_email = coalesce(
          public.site_visitors.converted_user_email,
          v_email
        ),
        pages_viewed = case
          when p_path is not null and p_path <> '' then
            -- Mantener solo las ultimas 20 paths
            (
              select jsonb_agg(elem)
              from (
                select elem from jsonb_array_elements(
                  public.site_visitors.pages_viewed ||
                  jsonb_build_array(jsonb_build_object('path', p_path, 'at', now()))
                ) elem
                order by (elem->>'at')::timestamptz desc
                limit 20
              ) trimmed
            )
          else public.site_visitors.pages_viewed
        end;
exception when others then
  -- Best-effort: nunca rompe la app del cliente
  null;
end;
$$;

revoke all on function public.track_visit(text, text, text) from public;
grant execute on function public.track_visit(text, text, text) to anon, authenticated;

comment on function public.track_visit(text, text, text) is
  'Registra navegacion anonima del cliente. Best-effort, no falla.';

-- =========================================================================
-- list_visitors: devuelve visitantes anonimos (admin only)
-- =========================================================================
create or replace function public.list_visitors(
  p_limit int default 100,
  p_only_unconverted boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role  text;
  v_result jsonb;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'list_visitors: no authenticated user';
  end if;
  select role into v_role from public.user_profiles where email = v_email limit 1;
  if v_role not in ('admin', 'staff') then
    raise exception 'list_visitors: requires admin/staff role';
  end if;

  select jsonb_build_object(
    'visitors', coalesce(jsonb_agg(row_data order by last_seen_at desc), '[]'::jsonb)
  )
  into v_result
  from (
    select
      id,
      session_id,
      user_agent,
      first_seen_at,
      last_seen_at,
      total_visits,
      pages_viewed,
      converted_user_email,
      jsonb_build_object(
        'id', id,
        'session_id', session_id,
        'user_agent', user_agent,
        'first_seen_at', first_seen_at,
        'last_seen_at', last_seen_at,
        'total_visits', total_visits,
        'pages_viewed', pages_viewed,
        'converted_user_email', converted_user_email
      ) as row_data
    from public.site_visitors
    where (not p_only_unconverted) or converted_user_email is null
    order by last_seen_at desc
    limit p_limit
  ) sub;

  return v_result;
end;
$$;

revoke all on function public.list_visitors(int, boolean) from public;
grant execute on function public.list_visitors(int, boolean) to authenticated;

-- =========================================================================
-- list_all_users: TODOS los user_profiles + KPIs de compra agregados
-- =========================================================================
create or replace function public.list_all_users(
  p_limit int default 200,
  p_offset int default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role  text;
  v_result jsonb;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'list_all_users: no authenticated user';
  end if;
  select role into v_role from public.user_profiles where email = v_email limit 1;
  if v_role not in ('admin', 'staff') then
    raise exception 'list_all_users: requires admin/staff role';
  end if;

  with sales_agg as (
    select
      lower(customer_email) as email,
      count(*) as orders,
      sum(coalesce(total, 0)) as total_spent,
      max(created_at) as last_purchase_at
    from public.sales
    where customer_email is not null
    group by 1
  ),
  rows as (
    select
      up.id,
      up.email,
      up.created_at,
      au.last_sign_in_at,
      coalesce(up.full_name, '') as full_name,
      coalesce(up.role, 'client') as role,
      up.phone,
      up.avatar_url,
      coalesce(sa.orders, 0)::int as orders,
      coalesce(sa.total_spent, 0)::numeric as total_spent,
      sa.last_purchase_at
    from public.user_profiles up
    left join auth.users au on au.id = up.id
    left join sales_agg sa on sa.email = lower(up.email)
    order by coalesce(sa.last_purchase_at, up.created_at) desc nulls last
    limit p_limit offset p_offset
  )
  select jsonb_build_object(
    'users', coalesce(jsonb_agg(jsonb_build_object(
      'id', id,
      'email', email,
      'created_at', created_at,
      'last_sign_in_at', last_sign_in_at,
      'full_name', full_name,
      'role', role,
      'phone', phone,
      'avatar_url', avatar_url,
      'orders', orders,
      'total_spent', total_spent,
      'last_purchase_at', last_purchase_at
    )), '[]'::jsonb)
  ) into v_result
  from rows;

  return v_result;
end;
$$;

revoke all on function public.list_all_users(int, int) from public;
grant execute on function public.list_all_users(int, int) to authenticated;

comment on table public.site_visitors is
  'Visitantes anonimos de la tienda publica. Sin IP ni geo, solo session_id local + user_agent.';
