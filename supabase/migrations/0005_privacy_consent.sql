-- ============================================================================
-- 0005_privacy_consent.sql — required privacy-policy consent at order time
-- ============================================================================
-- Adds one column to `orders`, set by the server (never client-supplied)
-- the moment a submission passes the "I agree to the privacy policy"
-- checkbox check in the order API route. No RLS change needed — this
-- column is covered by the same existing "customers and staff can view
-- relevant orders" / "staff can update their store's orders" policies
-- as every other `orders` column, same as the payment-workflow columns
-- added in 0003.
--
-- SAFE TO RE-RUN: `add column if not exists`.
-- ============================================================================

alter table orders
  add column if not exists privacy_consent_given_at timestamptz not null default now();

comment on column orders.privacy_consent_given_at is
  'Set by the server at submission time when the customer checks the privacy-policy consent box on Review & Submit. Never client-supplied, so it cannot be backdated by a manipulated request.';
