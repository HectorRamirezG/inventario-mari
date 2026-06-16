drop trigger if exists on_auth_user_created on auth.users;

drop policy if exists "product_images_read" on storage.objects;
drop policy if exists "product_images_upload" on storage.objects;
drop policy if exists "product_images_update" on storage.objects;
drop policy if exists "product_images_delete" on storage.objects;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime drop table public.sales; exception when others then null; end;
    begin alter publication supabase_realtime drop table public.payments; exception when others then null; end;
    begin alter publication supabase_realtime drop table public.payment_proofs; exception when others then null; end;
    begin alter publication supabase_realtime drop table public.notifications; exception when others then null; end;
  end if;
end $$;

drop table if exists public.operating_expenses cascade;
drop table if exists public.capital_injections cascade;
drop table if exists public.inventory_cycles cascade;
drop table if exists public.pricing_operations cascade;
drop table if exists public.pricing_config cascade;
drop table if exists public.app_settings cascade;
drop table if exists public.notifications cascade;
drop table if exists public.support_tickets cascade;
drop table if exists public.payment_proofs cascade;
drop table if exists public.movements cascade;
drop table if exists public.payments cascade;
drop table if exists public.sale_items cascade;
drop table if exists public.sales cascade;
drop table if exists public.variants cascade;
drop table if exists public.products cascade;
drop table if exists public.user_profiles cascade;

drop function if exists public.close_cycle(uuid, numeric, text) cascade;
drop function if exists public.open_cycle(text, numeric, numeric, text) cascade;
drop function if exists public.cycle_snapshot(uuid) cascade;
drop function if exists public.mark_all_notifications_read() cascade;
drop function if exists public.get_public_ticket(text) cascade;
drop function if exists public.update_support_ticket_status(uuid, text) cascade;
drop function if exists public.create_support_ticket(uuid, text, text, text) cascade;
drop function if exists public.reject_payment_proof(uuid, text) cascade;
drop function if exists public.approve_payment_proof(uuid, numeric, text) cascade;
drop function if exists public.add_sale_payment(uuid, numeric, text) cascade;
drop function if exists public.admin_adjust_sale(uuid, numeric, text, text) cascade;
drop function if exists public.recalc_sale_totals(uuid) cascade;
drop function if exists public.restock_on_sale_cancelled() cascade;
drop function if exists public.create_sale_atomic(jsonb) cascade;
drop function if exists public.apply_movement(uuid, text, integer) cascade;
drop function if exists public.decrease_variant_stock(uuid, integer) cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_staff_or_admin() cascade;
drop function if exists public.is_admin() cascade;

delete from storage.objects where bucket_id = 'product-images';
delete from storage.buckets where id = 'product-images';

notify pgrst, 'reload schema';
