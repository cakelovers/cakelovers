-- ============================================================================
-- 0006_pickup_scheduling.sql — weekday-based pickup scheduling
-- ============================================================================
-- Approved architecture: pickup availability, hours, and minimum lead
-- time are configured per weekday, per store. Pickup interval stays
-- store-wide — it's a production-batching choice that doesn't
-- realistically vary by weekday, so duplicating it across 7 rows would
-- just be a chance for the 7 copies to drift.
--
-- Two tables, same shape as the payment-workflow precedent
-- (0003/0004_payment_rls.sql): schema + RLS-enabled-with-no-policies
-- here, policies added in the follow-up 0007 migration.
--
-- No changes to `orders` — enforcement reads these tables at
-- submission time; only the resulting pickup_date/pickup_time are
-- ever persisted on the order, same columns as today.
--
-- SAFE TO RE-RUN: `create table if not exists`, guarded constraint add.
-- ============================================================================

create table if not exists store_pickup_settings (
  store_id                 uuid primary key references stores(id) on delete cascade,
  pickup_interval_minutes  integer not null default 30
                           check (pickup_interval_minutes in (15, 30, 60)),
  updated_at               timestamptz not null default now()
);

drop trigger if exists store_pickup_settings_set_updated_at on store_pickup_settings;
create trigger store_pickup_settings_set_updated_at
  before update on store_pickup_settings
  for each row
  execute function set_updated_at();

comment on table store_pickup_settings is
  'Store-wide pickup interval. One row per store, created lazily on first save. Members-only RLS; public/customer-facing reads go through the service-role client, same split as store_payment_settings.';


create table if not exists store_pickup_day_settings (
  store_id        uuid not null references stores(id) on delete cascade,
  weekday         smallint not null check (weekday between 0 and 6), -- 0=Sun..6=Sat
  is_enabled      boolean not null default true,
  opening_time    time,
  closing_time    time,
  min_lead_hours  integer check (min_lead_hours between 1 and 336),
  primary key (store_id, weekday)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'store_pickup_day_settings_complete_when_enabled'
  ) then
    alter table store_pickup_day_settings
      add constraint store_pickup_day_settings_complete_when_enabled check (
        not is_enabled
        or (opening_time is not null and closing_time is not null
            and min_lead_hours is not null and closing_time > opening_time)
      );
  end if;
end $$;

create index if not exists store_pickup_day_settings_store_id_idx
  on store_pickup_day_settings (store_id);

comment on table store_pickup_day_settings is
  'Per-weekday pickup availability, hours, and minimum lead time. A day is either fully disabled (all three nullable columns null) or fully specified — enforced by the check constraint, not just application logic. All 7 rows are written together on first save; a missing row is treated as "not yet configured" and resolved to defaults by the application, never as implicitly disabled.';


alter table store_pickup_settings     enable row level security;
alter table store_pickup_day_settings enable row level security;
