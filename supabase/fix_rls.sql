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

notify pgrst, 'reload schema';
