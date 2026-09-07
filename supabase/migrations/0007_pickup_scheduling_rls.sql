-- ============================================================================
-- 0007_pickup_scheduling_rls.sql — RLS policies for pickup scheduling
-- ============================================================================
-- Mirrors 0004_payment_rls.sql exactly: a staff member may read/write
-- pickup settings only for a store they belong to. No anon policy —
-- the public order flow (the pickup-slots route and order submission)
-- reads both tables through the service-role client, which bypasses
-- RLS, same as store_payment_settings. No DELETE policy — settings
-- are edited, never deleted; a day is "turned off" via is_enabled,
-- not by removing its row.
--
-- SAFE TO RE-RUN: each policy is dropped first if it already exists.
-- ============================================================================

drop policy if exists "members can view their store's pickup settings" on store_pickup_settings;
create policy "members can view their store's pickup settings"
on store_pickup_settings for select
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can insert their store's pickup settings" on store_pickup_settings;
create policy "members can insert their store's pickup settings"
on store_pickup_settings for insert
to authenticated
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can update their store's pickup settings" on store_pickup_settings;
create policy "members can update their store's pickup settings"
on store_pickup_settings for update
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
)
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);


drop policy if exists "members can view their store's pickup day settings" on store_pickup_day_settings;
create policy "members can view their store's pickup day settings"
on store_pickup_day_settings for select
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can insert their store's pickup day settings" on store_pickup_day_settings;
create policy "members can insert their store's pickup day settings"
on store_pickup_day_settings for insert
to authenticated
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can update their store's pickup day settings" on store_pickup_day_settings;
create policy "members can update their store's pickup day settings"
on store_pickup_day_settings for update
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
)
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);
