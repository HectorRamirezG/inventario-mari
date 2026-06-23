-- ============================================================================
-- HOTFIX: puntos de loyalty se otorgan AL PAGAR (no al crear el sale)
-- ============================================================================
-- Cambio solicitado por Mari: hoy los puntos se entregan al INSERT del sale
-- (hace el apartado pero aún no paga). Mari quiere que sea al status='paid'.
-- Además, debe notificar al cliente que ganó N puntos.
--
-- IDEMPOTENTE: drop + recreate del trigger.
--
-- DEPENDE de: fix_loyalty_system.sql (tablas loyalty_*) + 
--             fix_realtime_triggers.sql (notify helper en la BD).
-- ============================================================================

begin;

-- =========================================================================
-- 1) Eliminar el trigger viejo en INSERT y crear uno en UPDATE de status
-- =========================================================================
drop trigger if exists trg_loyalty_on_sale_insert on public.sales;

create or replace function public.tg_loyalty_on_sale_paid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email     text;
  v_short     text;
  v_token     text;
  v_pts_first integer;
  v_pts_any   integer;
  v_total_pts integer;
begin
  -- Solo nos importa el momento en que status pasa A 'paid' desde otro estado.
  if old.status is not distinct from new.status then
    return new;
  end if;
  if new.status <> 'paid' then
    return new;
  end if;

  v_email := lower(btrim(new.customer_email));
  if v_email is null or v_email = '' then
    return new;
  end if;

  -- first_purchase es one-time: la RPC se asegura de no duplicar.
  v_pts_first := coalesce(
    public.award_loyalty_points(v_email, 'first_purchase', new.id::text, null),
    0
  );
  -- any_purchase es repetible
  v_pts_any := coalesce(
    public.award_loyalty_points(v_email, 'any_purchase', new.id::text, null),
    0
  );

  v_total_pts := v_pts_first + v_pts_any;

  -- Notif al cliente si ganó algo (puede ser 0 si las reglas están off)
  if v_total_pts > 0 then
    v_short := upper(substr(replace(new.id::text, '-', ''), 1, 8));
    v_token := new.public_token;

    insert into public.notifications (
      recipient_role,
      recipient_email,
      type,
      title,
      body,
      link,
      metadata
    ) values (
      'client',
      v_email,
      'loyalty_earned',
      '¡Ganaste ' || v_total_pts || ' puntos!',
      'Tu pago del folio ' || v_short ||
        ' se acreditó. Úsalos en tu próxima compra.',
      '/ticket/' || coalesce(v_token, new.id::text),
      jsonb_build_object(
        'sale_id',     new.id,
        'points',      v_total_pts,
        'first_pts',   v_pts_first,
        'any_pts',     v_pts_any
      )
    );
  end if;

  return new;
exception when others then
  raise warning '[tg_loyalty_on_sale_paid] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_loyalty_on_sale_paid on public.sales;
create trigger trg_loyalty_on_sale_paid
  after update of status on public.sales
  for each row
  execute function public.tg_loyalty_on_sale_paid();

-- =========================================================================
-- 2) Trigger en INSERT de loyalty_events para auto-notif de canjeos
--    (cuando el cliente USA puntos, le mandamos un body distinto)
-- =========================================================================
create or replace function public.tg_loyalty_on_spend_notify()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  -- Solo eventos negativos (canjeo). Las ganancias ya las notifica
  -- tg_loyalty_on_sale_paid en su momento.
  if new.delta >= 0 then
    return new;
  end if;
  if new.customer_email is null or btrim(new.customer_email) = '' then
    return new;
  end if;

  -- Si el ref_id es un sale_id, anexamos link al ticket.
  if new.ref_id is not null then
    select public_token into v_token
      from public.sales
     where id::text = new.ref_id
     limit 1;
  end if;

  insert into public.notifications (
    recipient_role,
    recipient_email,
    type,
    title,
    body,
    link,
    metadata
  ) values (
    'client',
    lower(btrim(new.customer_email)),
    'loyalty_redeemed',
    'Usaste ' || abs(new.delta) || ' puntos',
    coalesce(new.note, 'Canjeaste puntos en tu próxima compra.'),
    case when v_token is not null then '/ticket/' || v_token else null end,
    jsonb_build_object(
      'points',  abs(new.delta),
      'action',  new.action_key,
      'ref_id',  new.ref_id
    )
  );
  return new;
exception when others then
  raise warning '[tg_loyalty_on_spend_notify] %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_loyalty_on_spend_notify on public.loyalty_events;
create trigger trg_loyalty_on_spend_notify
  after insert on public.loyalty_events
  for each row
  execute function public.tg_loyalty_on_spend_notify();

notify pgrst, 'reload schema';

commit;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- select tgname from pg_trigger
--  where tgname in ('trg_loyalty_on_sale_paid','trg_loyalty_on_spend_notify')
--  order by tgname;
