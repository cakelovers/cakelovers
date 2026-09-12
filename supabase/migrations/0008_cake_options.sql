-- ============================================================================
-- 0008_cake_options.sql — store-managed cake configuration presets
-- ============================================================================
-- Approved architecture: two store-configured preset catalogs
-- (Specification, Flavor Package) collected in the first wizard step,
-- plus a lettering choice stored directly on `orders`. Deliberately no
-- separate Shape, Theme, or Cream fields — Specification presets
-- (e.g. "1호 하트", "웨딩 2단") already encode shape/size/format
-- together, and Flavor Package presets (e.g. "바닐라 시트 + 순우유
-- 크림") already encode flavor/cream together, matching how bakeries
-- actually sell fixed combinations rather than an independently
-- composable matrix.
--
-- One generic table discriminated by `kind`, same shape as every other
-- store-scoped catalog in this schema. `price_adjustment_krw` is
-- informational only — it is never summed, never written to `orders`,
-- and never referenced by the manual quote workflow. The owner's
-- `quoted_price_krw` remains the sole authoritative charge.
--
-- orders gets a snapshot pair per kind (an FK plus an immutable label
-- captured at submission time), matching the existing
-- ai_preview_prompt precedent — renaming or disabling a preset later
-- must never rewrite what a past order displays. `cake_message` is
-- nullable: "메시지 없음" is a valid, common, explicit customer
-- choice, not a bare required field.
--
-- Schema + RLS-enabled-with-no-policies here, policies added in the
-- follow-up 0009 migration — same split as 0006/0007.
--
-- SAFE TO RE-RUN: `create table if not exists`, guarded column adds.
-- ============================================================================

create table if not exists store_cake_options (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references stores(id) on delete cascade,
  kind                  text not null check (kind in ('specification', 'flavor_package')),
  label                 text not null,
  is_enabled            boolean not null default true,
  sort_order            integer not null default 0,
  price_adjustment_krw  integer,
  created_at            timestamptz not null default now()
);

create index if not exists store_cake_options_store_kind_idx
  on store_cake_options (store_id, kind, sort_order);

comment on table store_cake_options is
  'Per-store preset catalog for the Cake Configuration step: kind is "specification" (size/shape/format presets like "1호 하트", "웨딩 2단") or "flavor_package" (combined flavor+cream presets like "바닐라 시트 + 순우유 크림"). Members-only RLS (0009); public/customer-facing reads go through the service-role client. price_adjustment_krw is informational display only — never summed, never persisted on an order, never linked to the manual quote. Disabling (is_enabled = false) is the only supported removal path — orders snapshot their chosen label at submission time, so disabling never rewrites order history.';

alter table store_cake_options enable row level security;


alter table orders
  add column if not exists specification_option_id   uuid references store_cake_options(id) on delete set null,
  add column if not exists specification_label        text,
  add column if not exists flavor_package_option_id   uuid references store_cake_options(id) on delete set null,
  add column if not exists flavor_package_label        text,
  add column if not exists cake_message                text;

comment on column orders.specification_label is
  'Immutable snapshot of the specification preset label at submission time — survives later renames/disables of the source store_cake_options row.';
comment on column orders.flavor_package_label is
  'Immutable snapshot of the flavor package preset label at submission time.';
comment on column orders.cake_message is
  'Null means "no message" — either an explicit customer choice (the "메시지 없음" radio) or an order predating this column. Both cases get identical real-world handling: the baker writes nothing on the cake.';
