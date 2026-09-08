-- ============================================================================
-- 0009_cake_options_rls.sql — RLS policies for store_cake_options
-- ============================================================================
-- Mirrors 0007_pickup_scheduling_rls.sql: a staff member may read/write
-- catalog options only for a store they belong to. No anon policy — the
-- public order flow (the cake-options route and order submission) reads
-- through the service-role client, which bypasses RLS, same as pickup
-- settings and payment settings. No DELETE policy — options are
-- disabled via is_enabled, never removed, so an id already referenced
-- by a past order keeps resolving.
--
-- SAFE TO RE-RUN: each policy is dropped first if it already exists.
-- ============================================================================

drop policy if exists "members can view their store's cake options" on store_cake_options;
create policy "members can view their store's cake options"
on store_cake_options for select
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can insert their store's cake options" on store_cake_options;
create policy "members can insert their store's cake options"
on store_cake_options for insert
to authenticated
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);

drop policy if exists "members can update their store's cake options" on store_cake_options;
create policy "members can update their store's cake options"
on store_cake_options for update
to authenticated
using (
  store_id in (select store_id from store_members where user_id = auth.uid())
)
with check (
  store_id in (select store_id from store_members where user_id = auth.uid())
);
