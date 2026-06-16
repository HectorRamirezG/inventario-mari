begin;

drop policy if exists "sales_read" on public.sales;
drop policy if exists "sales_insert" on public.sales;
drop policy if exists "sales_update_staff" on public.sales;
drop policy if exists "sales_delete_staff" on public.sales;
drop policy if exists "sale_items_read" on public.sale_items;
drop policy if exists "sale_items_write_staff" on public.sale_items;
drop policy if exists "payments_read" on public.payments;
drop policy if exists "payments_write_staff" on public.payments;
drop policy if exists "payment_proofs_read" on public.payment_proofs;
drop policy if exists "payment_proofs_insert" on public.payment_proofs;
drop policy if exists "payment_proofs_update_staff" on public.payment_proofs;
drop policy if exists "support_read" on public.support_tickets;
drop policy if exists "support_insert" on public.support_tickets;
drop policy if exists "support_update_staff" on public.support_tickets;
drop policy if exists "notifications_read" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;
drop policy if exists "notifications_insert_staff" on public.notifications;
drop policy if exists "notifications_delete_own" on public.notifications;

create policy "sales_read" on public.sales for select using (
  public.is_staff_or_admin()
  or customer_email = (auth.jwt() ->> 'email')
);
create policy "sales_insert" on public.sales for insert with check (
  public.is_staff_or_admin()
  or customer_email = (auth.jwt() ->> 'email')
  or customer_email is not null
);
create policy "sales_update_staff" on public.sales for update using (public.is_staff_or_admin());
create policy "sales_delete_staff" on public.sales for delete using (public.is_admin());

create policy "sale_items_read" on public.sale_items for select using (
  public.is_staff_or_admin()
  or exists (select 1 from public.sales s where s.id = sale_id and s.customer_email = (auth.jwt() ->> 'email'))
);
create policy "sale_items_write_staff" on public.sale_items for all using (
  public.is_staff_or_admin()
  or exists (select 1 from public.sales s where s.id = sale_id and s.customer_email = (auth.jwt() ->> 'email'))
) with check (
  public.is_staff_or_admin()
  or exists (select 1 from public.sales s where s.id = sale_id and s.customer_email = (auth.jwt() ->> 'email'))
);

create policy "payments_read" on public.payments for select using (
  public.is_staff_or_admin()
  or exists (select 1 from public.sales s where s.id = sale_id and s.customer_email = (auth.jwt() ->> 'email'))
);
create policy "payments_write_staff" on public.payments for all using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy "payment_proofs_read" on public.payment_proofs for select using (
  public.is_staff_or_admin()
  or customer_email = (auth.jwt() ->> 'email')
);
create policy "payment_proofs_insert" on public.payment_proofs for insert with check (
  public.is_staff_or_admin()
  or customer_email = (auth.jwt() ->> 'email')
  or customer_email is not null
);
create policy "payment_proofs_update_staff" on public.payment_proofs for update using (public.is_staff_or_admin());

create policy "support_read" on public.support_tickets for select using (
  public.is_staff_or_admin()
  or customer_email = (auth.jwt() ->> 'email')
);
create policy "support_insert" on public.support_tickets for insert with check (
  public.is_staff_or_admin()
  or customer_email = (auth.jwt() ->> 'email')
  or customer_email is not null
);
create policy "support_update_staff" on public.support_tickets for update using (public.is_staff_or_admin());

create policy "notifications_read" on public.notifications for select using (
  public.is_staff_or_admin()
  or recipient_email = (auth.jwt() ->> 'email')
);
create policy "notifications_update_own" on public.notifications for update using (
  public.is_staff_or_admin()
  or recipient_email = (auth.jwt() ->> 'email')
);
create policy "notifications_insert_staff" on public.notifications for insert with check (
  public.is_staff_or_admin()
  or recipient_email is not null
);
create policy "notifications_delete_own" on public.notifications for delete using (
  public.is_staff_or_admin()
  or recipient_email = (auth.jwt() ->> 'email')
);

create or replace function public.mark_all_notifications_read()
returns integer language plpgsql security definer set search_path = public as $$
declare v_email text; v_count integer;
begin
  v_email := auth.jwt() ->> 'email';
  update public.notifications set read_at = now()
    where read_at is null and recipient_email = v_email;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;
grant execute on function public.mark_all_notifications_read() to anon, authenticated;

create or replace function public.get_public_ticket(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sale public.sales%rowtype; v_items jsonb; v_payments jsonb;
begin
  select * into v_sale from public.sales where public_token = p_token;
  if v_sale.id is null then
    return null;
  end if;
  select coalesce(jsonb_agg(to_jsonb(si.*)), '[]'::jsonb) into v_items
    from public.sale_items si where si.sale_id = v_sale.id;
  select coalesce(jsonb_agg(to_jsonb(p.*) order by p.created_at), '[]'::jsonb) into v_payments
    from public.payments p where p.sale_id = v_sale.id;
  return to_jsonb(v_sale) || jsonb_build_object('items', v_items, 'payments', v_payments);
end; $$;
grant execute on function public.get_public_ticket(text) to anon, authenticated;

alter table public.payment_proofs
  alter column image_url drop not null;

alter table public.payment_proofs
  drop constraint if exists payment_proofs_status_check;
alter table public.payment_proofs
  add constraint payment_proofs_status_check
  check (status in ('pending','pending_verification','approved','rejected'));

alter table public.support_tickets
  add column if not exists resolution_message text;

create or replace function public.notify_admin_on_proof()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (
    recipient_email, recipient_role, type, title, body, link, metadata
  )
  select
    up.email,
    'admin',
    case when new.image_url is null then 'cash_payment_reported' else 'payment_proof_uploaded' end,
    case when new.image_url is null then 'Pago en efectivo reportado' else 'Nuevo comprobante de pago' end,
    coalesce(s.customer_name, new.customer_email, 'Cliente') ||
      coalesce(' · $' || new.amount::text, '') ||
      coalesce(' · ' || new.method, ''),
    '/admin?proof=' || new.id::text,
    jsonb_build_object(
      'proof_id', new.id,
      'sale_id', new.sale_id,
      'amount', new.amount,
      'method', new.method,
      'is_cash', new.image_url is null
    )
  from public.user_profiles up
  left join public.sales s on s.id = new.sale_id
  where up.role in ('admin','staff');
  return new;
end; $$;

drop trigger if exists trg_notify_admin_on_proof on public.payment_proofs;
create trigger trg_notify_admin_on_proof
  after insert on public.payment_proofs
  for each row execute function public.notify_admin_on_proof();

create or replace function public.notify_client_on_support_resolved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'resolved' and (old.status is distinct from 'resolved') and new.customer_email is not null then
    insert into public.notifications (
      recipient_email, recipient_role, type, title, body, link, metadata
    ) values (
      new.customer_email,
      'client',
      'support_resolved',
      'Tu reporte fue resuelto',
      coalesce(new.resolution_message, 'Mari resolvió tu incidencia. Si necesitas más ayuda, escríbele.'),
      case when new.sale_id is not null then '/mis-pedidos' else '/mis-reportes' end,
      jsonb_build_object(
        'ticket_id', new.id,
        'sale_id', new.sale_id,
        'category', new.category,
        'resolution_message', new.resolution_message
      )
    );
  end if;
  return new;
end; $$;

drop trigger if exists trg_notify_client_on_support_resolved on public.support_tickets;
create trigger trg_notify_client_on_support_resolved
  after update on public.support_tickets
  for each row execute function public.notify_client_on_support_resolved();

notify pgrst, 'reload schema';
commit;
