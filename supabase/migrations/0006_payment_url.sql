-- =====================================================================
--  MARI INVENTARIO — payment_url en sales
--  Permite guardar una liga externa de cobro (Mercado Pago, Stripe,
--  PayPal, transferencia con QR, etc.) para mandarla al cliente.
--  IDEMPOTENTE.
-- =====================================================================

alter table public.sales
  add column if not exists payment_url text;
