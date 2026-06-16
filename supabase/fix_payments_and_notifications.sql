alter table public.payment_proofs
  alter column image_url drop not null;

alter table public.payment_proofs
  drop constraint if exists payment_proofs_status_check;
alter table public.payment_proofs
  add constraint payment_proofs_status_check
  check (status in ('pending','pending_verification','approved','rejected'));

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

alter table public.support_tickets
  add column if not exists resolution_message text;

notify pgrst, 'reload schema';
