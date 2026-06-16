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
notify pgrst, 'reload schema';
