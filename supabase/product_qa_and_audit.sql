-- =========================================================================
-- product_qa + audit_log
-- =========================================================================
-- Tabla 1: preguntas y respuestas publicas por producto.
--   - Cualquier cliente autenticado puede hacer pregunta.
--   - Solo admin/staff responde. La respuesta vive en la misma fila.
--   - is_published controla visibilidad (admin modera).
--
-- Tabla 2: bitacora de cambios sensibles (precio, stock, status).
--   - Cualquier service puede invocar `log_audit()` (SECURITY DEFINER).
--   - La UI admin lista por entity_type + entity_id o por usuario.
-- =========================================================================

create table if not exists public.product_questions (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  customer_email  text not null,
  customer_name   text,
  question        text not null check (char_length(question) between 3 and 500),
  answer          text,
  answered_at     timestamptz,
  answered_by     text,
  is_published    boolean not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists idx_product_questions_product on public.product_questions(product_id);
create index if not exists idx_product_questions_pub on public.product_questions(is_published, created_at desc);

alter table public.product_questions enable row level security;

drop policy if exists product_questions_read on public.product_questions;
create policy product_questions_read on public.product_questions
  for select using (is_published = true or (auth.role() in ('authenticated')));

drop policy if exists product_questions_insert on public.product_questions;
create policy product_questions_insert on public.product_questions
  for insert with check (
    auth.jwt() is not null
    and customer_email is not null
    and char_length(question) between 3 and 500
  );

drop policy if exists product_questions_update_admin on public.product_questions;
create policy product_questions_update_admin on public.product_questions
  for update using (
    exists (
      select 1 from public.user_profiles up
      where up.email = (auth.jwt() ->> 'email') and up.role in ('admin', 'staff')
    )
  );

drop policy if exists product_questions_delete_admin on public.product_questions;
create policy product_questions_delete_admin on public.product_questions
  for delete using (
    exists (
      select 1 from public.user_profiles up
      where up.email = (auth.jwt() ->> 'email') and up.role = 'admin'
    )
  );

-- =========================================================================
-- audit_log
-- =========================================================================
create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_email   text,
  actor_role    text,
  entity_type   text not null,
  entity_id     uuid,
  action        text not null,
  before_data   jsonb,
  after_data    jsonb,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_audit_log_entity on public.audit_log(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_log_actor on public.audit_log(actor_email, created_at desc);
create index if not exists idx_audit_log_created on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_read_admin on public.audit_log;
create policy audit_log_read_admin on public.audit_log
  for select using (
    exists (
      select 1 from public.user_profiles up
      where up.email = (auth.jwt() ->> 'email') and up.role in ('admin', 'staff')
    )
  );

-- Inserciones siempre via RPC log_audit() (SECURITY DEFINER) — no policy directo.

create or replace function public.log_audit(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role  text;
  v_id    uuid;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is not null then
    select role into v_role from public.user_profiles where email = v_email limit 1;
  end if;
  insert into public.audit_log(actor_email, actor_role, entity_type, entity_id, action, before_data, after_data, metadata)
  values (v_email, v_role, p_entity_type, p_entity_id, p_action, p_before, p_after, p_metadata)
  returning id into v_id;
  return v_id;
exception when others then
  return null;
end;
$$;

revoke all on function public.log_audit(text, uuid, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.log_audit(text, uuid, text, jsonb, jsonb, jsonb) to authenticated;

-- =========================================================================
-- Triggers automáticos: variant.stock + variant.price_menudeo + sales.status
-- =========================================================================

create or replace function public.audit_variant_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role  text;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is not null then
    select role into v_role from public.user_profiles where email = v_email limit 1;
  end if;
  if (TG_OP = 'UPDATE') then
    if NEW.stock is distinct from OLD.stock then
      insert into public.audit_log(actor_email, actor_role, entity_type, entity_id, action, before_data, after_data)
      values (v_email, v_role, 'variant', NEW.id, 'stock_change',
              jsonb_build_object('stock', OLD.stock),
              jsonb_build_object('stock', NEW.stock));
    end if;
    if NEW.price_menudeo is distinct from OLD.price_menudeo then
      insert into public.audit_log(actor_email, actor_role, entity_type, entity_id, action, before_data, after_data)
      values (v_email, v_role, 'variant', NEW.id, 'price_change',
              jsonb_build_object('price_menudeo', OLD.price_menudeo, 'price_medio', OLD.price_medio, 'price_mayoreo', OLD.price_mayoreo),
              jsonb_build_object('price_menudeo', NEW.price_menudeo, 'price_medio', NEW.price_medio, 'price_mayoreo', NEW.price_mayoreo));
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_audit_variant on public.variants;
create trigger trg_audit_variant
  after update on public.variants
  for each row execute function public.audit_variant_change();

create or replace function public.audit_sale_status() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_role  text;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is not null then
    select role into v_role from public.user_profiles where email = v_email limit 1;
  end if;
  if (TG_OP = 'UPDATE') and (NEW.status is distinct from OLD.status) then
    insert into public.audit_log(actor_email, actor_role, entity_type, entity_id, action, before_data, after_data)
    values (v_email, v_role, 'sale', NEW.id, 'status_change',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status));
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_audit_sale_status on public.sales;
create trigger trg_audit_sale_status
  after update on public.sales
  for each row execute function public.audit_sale_status();

comment on table public.product_questions is 'Preguntas publicas de clientes en cada producto, respondidas por admin.';
comment on table public.audit_log is 'Bitacora de cambios sensibles (precio, stock, status). Solo lectura admin/staff.';
