-- ============================================================================
-- 0004_payment_rls.sql — RLS policies for store_payment_settings
-- ============================================================================
-- Implements docs/15_V1_Payment_Workflow_Spec.md §6.2.
--
-- Mirrors the store_members join pattern used throughout the initial RLS
-- setup: a staff member may read/write the payment settings only for a
-- store they belong to. No anon policy — the public storefront reads this
-- table through the service-role client, which bypasses RLS. No DELETE
-- policy — settings are edited, never deleted.
--
-- SAFE TO RE-RUN: each policy is dropped first if it already exists.
--
-- The six new `orders` columns from 0003 need NO policy changes: they are
-- already covered by the existing "customers and staff can view relevant
-- orders" (SELECT) and "staff can update their store's orders" (UPDATE)
-- policies.
-- ============================================================================

drop policy if exists "members can view their store's payment settings" on store_payment_settings;
create policy "members can view their store's payment settings"
on store_payment_settings for select
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can insert their store's payment settings" on store_payment_settings;
create policy "members can insert their store's payment settings"
on store_payment_settings for insert
to authenticated
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can update their store's payment settings" on store_payment_settings;
create policy "members can update their store's payment settings"
on store_payment_settings for update
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
)
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);
