alter table public.support_tickets
  add column if not exists resolution_message text;

notify pgrst, 'reload schema';
