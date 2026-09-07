-- ============================================================================
-- 0003_payment_workflow.sql — V1 manual payment workflow
-- ============================================================================
-- Implements docs/15_V1_Payment_Workflow_Spec.md §1 and §6.1.
--
--   1. order_status enum replacement (new -> pricing_pending,
--      in_progress -> making, plus payment_pending / paid added).
--   2. Six additive columns on `orders` for the quote + payment lifecycle.
--   3. New table `store_payment_settings` (bank details, 1:1 with stores).
--
-- All existing orders are synthetic test data (docs/14 §5), so the enum
-- `USING` cast below is the entire data migration — nothing to backfill.
--
-- SAFE TO RE-RUN: every step is guarded (the enum swap runs only while the
-- old 'new' value still exists; columns/table/constraint/policies use
-- IF NOT EXISTS / conditional blocks). Running this file a second time in
-- the Supabase SQL editor is a no-op.
--
-- NOTE ON RLS: the six new `orders` columns need NO new policy. They are
-- already covered by the existing RLS policies from the initial schema
-- setup — "customers and staff can view relevant orders" (SELECT) and
-- "staff can update their store's orders" (UPDATE), per
-- docs/09_Supabase_Execution_Checklist.md §7. Only the new
-- `store_payment_settings` table needs policies — those live in
-- 0004_payment_rls.sql.
-- ============================================================================


-- ============================================================================
-- 1. order_status enum replacement
-- ============================================================================
-- Postgres can ADD enum values cheaply but cannot rename/remove an in-use
-- value without a type swap. Done now because it is the cheapest it will
-- ever be (no real orders yet). Mapping:
--   new         -> pricing_pending
--   in_progress -> making
--   ready / completed / cancelled -> unchanged
-- Column default moves from 'new' to 'pricing_pending'.
--
-- The whole swap is wrapped in a DO block that fires only while the old
-- 'new' label is still part of the type, so a second run is skipped.

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'order_status' and e.enumlabel = 'new'
  ) then
    create type order_status_new as enum (
      'pricing_pending',
      'payment_pending',
      'paid',
      'making',
      'ready',
      'completed',
      'cancelled'
    );

    alter table orders alter column status drop default;

    alter table orders
      alter column status type order_status_new
      using (
        case status::text
          when 'new'         then 'pricing_pending'
          when 'in_progress' then 'making'
          else status::text
        end::order_status_new
      );

    alter table orders alter column status set default 'pricing_pending';

    drop type order_status;
    alter type order_status_new rename to order_status;
  end if;
end $$;

comment on column orders.status is
  'Lifecycle: pricing_pending -> payment_pending -> paid -> making -> ready -> completed; cancelled from any non-terminal state. See docs/15 §2.';


-- ============================================================================
-- 2. orders — quote + payment lifecycle columns (all additive, all nullable)
-- ============================================================================

alter table orders
  add column if not exists quoted_price_krw     integer,
  add column if not exists payment_requested_at timestamptz,
  add column if not exists paid_at              timestamptz,
  add column if not exists paid_confirmed_by    uuid references auth.users(id) on delete set null,
  add column if not exists payment_reference    text,
  add column if not exists cancellation_reason  text;

-- KRW has no subunit — the value is whole won. Must be positive when set.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_quoted_price_krw_positive'
  ) then
    alter table orders
      add constraint orders_quoted_price_krw_positive
      check (quoted_price_krw is null or quoted_price_krw > 0);
  end if;
end $$;

comment on column orders.quoted_price_krw is
  'Owner-entered quote in whole KRW. NULL until quoted. Frozen once status = paid.';
comment on column orders.payment_requested_at is
  'Set on the first "copy payment message" click; never overwritten. Drives the customer-facing deadline.';
comment on column orders.paid_at is
  'Set on "Mark as paid"; cleared if the order is moved back to payment_pending.';
comment on column orders.paid_confirmed_by is
  'auth.users id of the staff member who confirmed payment. Audit only in V1.';
comment on column orders.payment_reference is
  'The 입금자명 string the customer transfers under. Computed once at quote entry (docs/15 §5.3), stored so it stays stable.';
comment on column orders.cancellation_reason is
  'Free-text reason captured in the cancel dialog (e.g. 미입금). Written only by the cancel action.';


-- ============================================================================
-- 3. store_payment_settings — bank details, 1:1 with stores
-- ============================================================================
-- Deliberately a separate table, NOT columns on `stores`: the
-- "public can view active stores" policy is TO anon USING (is_active),
-- so any column on `stores` is world-readable for active stores. Bank
-- account numbers must not be bulk-harvestable, so they live here behind
-- a members-only policy (0004). The public storefront reads this table
-- via the service-role client only (docs/15 §4.1).

create table if not exists store_payment_settings (
  store_id               uuid primary key references stores(id) on delete cascade,
  bank_name              text,
  bank_account_number    text,
  bank_account_holder    text,   -- 예금주; shown so the customer verifies before sending
  payment_instructions   text,   -- optional free line appended to the message
  payment_deadline_hours integer not null default 24
                         check (payment_deadline_hours between 1 and 168),
  updated_at             timestamptz not null default now()
);

drop trigger if exists store_payment_settings_set_updated_at on store_payment_settings;
create trigger store_payment_settings_set_updated_at
  before update on store_payment_settings
  for each row
  execute function set_updated_at();

comment on table store_payment_settings is
  'Bank transfer details for a store''s payment-request messages. One row per store, created lazily on first save. Members-only RLS; storefront reads via service-role.';


-- ============================================================================
-- 4. Enable RLS (policies are in 0004_payment_rls.sql)
-- ============================================================================
-- Enabling with zero policies denies all access until 0004 adds them —
-- the same safe default used for every other table in the initial schema.

alter table store_payment_settings enable row level security;
