-- ============================================================================
-- 0010_catalog_designs.sql — store-managed catalog of pre-made designs
-- ============================================================================
-- Direct Mode ("인기 디자인 주문하기"): an alternative way to select a
-- design that feeds into the exact same order pipeline as Custom Mode's
-- AI-generated selection. There is no separate order lifecycle — a
-- catalog-sourced order is still a request: pricing_pending ->
-- payment_pending -> paid -> making -> ready -> completed, identical to
-- every custom order. price_adjustment_krw is informational only,
-- matching store_cake_options' price_adjustment_krw precedent (0008) —
-- never summed, never written to orders.quoted_price_krw, never
-- bypasses the owner's manual quote workflow. The owner's
-- quoted_price_krw remains the sole authoritative charge.
--
-- orders gets a snapshot pair (an FK plus an immutable label captured
-- at submission time), matching the cake_options precedent — disabling
-- or renaming a catalog design later must never rewrite what a past
-- order displays.
--
-- image_storage_path points into the existing "ai-previews" bucket —
-- deliberately no separate storage bucket for catalog images, so the
-- customer tracking page and admin order detail page need zero changes
-- to resolve a catalog-sourced order's design photo.
--
-- Schema + RLS-enabled-with-no-policies here, policies added in the
-- follow-up 0011 migration — same split as 0006/0007 and 0008/0009.
--
-- SAFE TO RE-RUN: `create table if not exists`, guarded column adds.
-- ============================================================================

create table if not exists store_catalog_designs (
  id                    uuid primary key default gen_random_uuid(),
  store_id              uuid not null references stores(id) on delete cascade,
  label                 text not null,
  image_storage_path    text not null,
  price_adjustment_krw  integer,
  is_enabled            boolean not null default true,
  sort_order            integer not null default 0,
  created_at            timestamptz not null default now()
);

create index if not exists store_catalog_designs_store_idx
  on store_catalog_designs (store_id, sort_order);

comment on table store_catalog_designs is
  'Per-store catalog of pre-made designs customers can order directly (Direct Mode), without AI generation. price_adjustment_krw is informational display only — never summed, never persisted on an order, never bypasses the owner''s manual quote workflow; the owner''s quoted_price_krw remains the sole authoritative charge, same as every custom order. Members-only RLS (0011); public/customer-facing reads go through the service-role client. Disabling (is_enabled = false) is the only supported removal path — orders snapshot their chosen label at submission time, so disabling never rewrites order history.';

alter table store_catalog_designs enable row level security;


alter table orders
  add column if not exists catalog_design_id    uuid references store_catalog_designs(id) on delete set null,
  add column if not exists catalog_design_label  text;

comment on column orders.catalog_design_label is
  'Immutable snapshot of the catalog design label at submission time — survives later renames/disables of the source store_catalog_designs row. Null for a Custom Mode (AI-generated) order.';
