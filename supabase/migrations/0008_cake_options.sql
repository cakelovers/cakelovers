-- ============================================================================
-- 0008_cake_options.sql — store-specific cake catalogs (flavor/size/shape)
-- ============================================================================
-- Approved architecture (Sprint 3 specification): one generic table
-- discriminated by `kind`, rather than three separate tables or a JSONB
-- column. Options are per-store; customers only ever see what that
-- specific store has enabled.
--
-- orders gets a snapshot pair for each kind (an FK plus an immutable
-- label captured at submission time), matching the existing
-- ai_preview_prompt precedent — renaming or disabling a catalog option
-- later must never rewrite what a past order displays.
--
-- cake_message is deliberately NOT required at the database level: "no
-- message" is a valid, common, explicit customer choice (weddings,
-- bridal showers, corporate and minimalist cakes routinely carry none),
-- so the column stays nullable and "required" is enforced only at the
-- application layer, conditional on the customer's own radio choice.
-- All new columns are nullable for the same reason historical orders
-- need no backfill.
--
-- Schema + RLS-enabled-with-no-policies here, policies added in the
-- follow-up 0009 migration — same split as 0006/0007.
--
-- SAFE TO RE-RUN: `create table if not exists`, guarded column adds.
-- ============================================================================

create table if not exists store_cake_options (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  kind        text not null check (kind in ('flavor', 'size', 'shape')),
  label       text not null,
  is_enabled  boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists store_cake_options_store_kind_idx
  on store_cake_options (store_id, kind, sort_order);

comment on table store_cake_options is
  'Per-store catalog of flavor/size/shape options, discriminated by kind. Members-only RLS (0009); public/customer-facing reads go through the service-role client, same split as store_pickup_day_settings. Disabling (is_enabled = false) is the only supported removal path from the admin UI — orders snapshot their chosen label at submission time, so disabling never rewrites order history.';

alter table store_cake_options enable row level security;


alter table orders
  add column if not exists flavor_option_id uuid references store_cake_options(id) on delete set null,
  add column if not exists flavor_label      text,
  add column if not exists size_option_id    uuid references store_cake_options(id) on delete set null,
  add column if not exists size_label        text,
  add column if not exists shape_option_id   uuid references store_cake_options(id) on delete set null,
  add column if not exists shape_label       text,
  add column if not exists occasion          text,
  add column if not exists cake_message      text;

comment on column orders.flavor_label is
  'Immutable snapshot of the flavor label at submission time — survives later renames/disables of the source store_cake_options row.';
comment on column orders.size_label is
  'Immutable snapshot of the size label at submission time.';
comment on column orders.shape_label is
  'Immutable snapshot of the shape label at submission time.';
comment on column orders.occasion is
  'Free text, but only ever populated from the fixed Korean occasion list in src/lib/copy/occasion.ts — validated at the application layer, not by a DB check constraint, so the list can grow without a migration.';
comment on column orders.cake_message is
  'Null means "no message" — either an explicit customer choice (the "메시지 없음" radio) or, for orders placed before this column existed, simply unset. Both cases get identical real-world handling: the baker writes nothing on the cake.';
