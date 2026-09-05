-- ============================================================================
-- Cake Lovers — MVP Database Schema
-- ============================================================================
-- Companion to docs/06_Final_DB_Review.md — read that first for the
-- reasoning behind every column (and every column deliberately left out).
--
-- Scope: database phase only. This file defines tables, keys, indexes,
-- and timestamp columns, and enables Row Level Security on every
-- tenant-scoped table with NO policies yet attached — in Postgres/Supabase
-- that means all access is denied by default until policies are added in
-- a follow-up migration. This is intentional: schema and RLS policies are
-- tested independently before either meets application code.
--
-- Target: Supabase Postgres (uses gen_random_uuid(), references auth.users).
-- Apply via the Supabase CLI (`supabase migration up` / `db push`), not by
-- hand-editing in Studio, so the schema stays reproducible.
-- ============================================================================


-- ============================================================================
-- Extensions
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()


-- ============================================================================
-- Enums
-- ============================================================================

-- Storefront default UI language. Postgres enums are append-only in
-- practice (ALTER TYPE ... ADD VALUE is safe; renaming/removing a value
-- already in use is not) — treat this the same way if a 4th language
-- is ever added.
create type locale_code as enum ('ko', 'ja', 'en');

-- Order lifecycle. Kept intentionally small and linear for MVP.
-- Append new values with `alter type order_status add value '...'` —
-- never rename or remove a value already used by existing rows.
create type order_status as enum (
  'new',
  'in_progress',
  'ready',
  'completed',
  'cancelled'
);


-- ============================================================================
-- Shared trigger: keep updated_at current
-- ============================================================================
-- Applied only to tables whose rows are actually mutated after creation
-- (stores, orders). customers / store_members / reference_images are
-- write-once in MVP (no edit feature exists for them), so they carry no
-- updated_at column at all — see docs/06_Final_DB_Review.md §1 for why an
-- unused, never-changing timestamp column is worse than no column.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================================
-- stores — the tenant root
-- ============================================================================

create table stores (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  locale      locale_code not null default 'en',
  timezone    text not null default 'UTC',   -- IANA tz name; drives pickup-time validation in the store's local time
  is_active   boolean not null default true, -- lets the founder switch a store's public ordering page off without deleting data
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger stores_set_updated_at
  before update on stores
  for each row
  execute function set_updated_at();

comment on table stores is 'Tenant root. Every other tenant-scoped table carries store_id referencing this.';
comment on column stores.slug is 'Public URL segment: cakelovers.app/s/{slug}.';


-- ============================================================================
-- store_members — which auth.users may access a store's /admin dashboard
-- ============================================================================
-- No role column: MVP has no owner/staff distinction (see review doc §1).
-- No invited_by: MVP has no invite flow; every row is created by hand in
-- Supabase Studio by the founder.

create table store_members (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (store_id, user_id)
);

create index store_members_user_id_idx on store_members (user_id);
create index store_members_store_id_idx on store_members (store_id);

comment on table store_members is 'Membership only for MVP: presence of a row = access to that store''s /admin dashboard. No role column yet.';


-- ============================================================================
-- customers — one row per (store, person), never shared across stores
-- ============================================================================
-- auth_user_id is NOT NULL: guest customers use Supabase Anonymous Auth,
-- so every customer — guest or full account — has a real auth.uid().

create table customers (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  auth_user_id  uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  phone         text,
  email         text,
  created_at    timestamptz not null default now()
);

create index customers_store_id_idx on customers (store_id);
create index customers_store_id_phone_idx on customers (store_id, phone);
create index customers_store_id_email_idx on customers (store_id, email);
create index customers_auth_user_id_idx on customers (auth_user_id);

comment on table customers is 'One row per (store, person) by design — never shared across stores, even for the same real person. See docs/03_Architecture.md §9.';


-- ============================================================================
-- orders — the core transaction record
-- ============================================================================
-- description is the single free-text field from the customer and is the
-- literal text sent to OpenAI for preview generation (text-only input —
-- reference images are never part of generation, see below).
--
-- ai_preview_storage_path / ai_preview_prompt are NOT NULL: selecting a
-- preview is a mandatory step in the customer workflow before they can
-- reach pickup/submit, so the schema enforces that an order cannot exist
-- without one. Only the SELECTED preview is ever persisted here — every
-- unselected regeneration the customer discarded is never written
-- anywhere, by construction (there is no ai_previews table).

create table orders (
  id                        uuid primary key default gen_random_uuid(),
  store_id                  uuid not null references stores(id) on delete cascade,
  customer_id               uuid not null references customers(id) on delete restrict,
  description               text not null,
  status                    order_status not null default 'new',

  pickup_date               date not null,
  pickup_time               time not null,

  ai_preview_storage_path   text not null,  -- Storage path, permanent bucket: {store_id}/{order_id}/preview.png
  ai_preview_prompt         text not null,  -- exact text sent to OpenAI for this order's selected preview

  internal_note             text,           -- shop-staff-only note; not shown to the customer
  customer_note             text,           -- Phase 5 addition: optional, customer-authored production
                                             -- instructions (e.g. "no candles needed") — distinct from
                                             -- `description` (the design brief) and from `internal_note`
                                             -- (staff-only); shown to both staff and the customer.

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create trigger orders_set_updated_at
  before update on orders
  for each row
  execute function set_updated_at();

create index orders_store_id_status_idx on orders (store_id, status);
create index orders_store_id_pickup_date_idx on orders (store_id, pickup_date);
create index orders_customer_id_idx on orders (customer_id);

comment on table orders is 'The core transaction. One selected AI preview per order (columns, not a child table) — unselected candidates are never persisted.';
comment on column orders.ai_preview_storage_path is 'Set once, at submit time, from the customer''s selected preview. Never updated afterward.';


-- ============================================================================
-- reference_images — up to 3 per order, production reference only
-- ============================================================================
-- NOT an AI input and NOT a design selection — see docs/02_DB_Schema.md
-- and docs/03_Architecture.md for the corrected workflow this reflects.
-- Optional: an order may have 0 to 3 rows here (workflow step 5 is
-- "up to 3", not mandatory), unlike the AI preview above, which is
-- mandatory and lives directly on `orders`.

create table reference_images (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  order_id      uuid not null references orders(id) on delete cascade,
  storage_path  text not null,
  position      smallint not null check (position between 1 and 3),
  created_at    timestamptz not null default now(),
  unique (order_id, position)
);

create index reference_images_order_id_idx on reference_images (order_id);
create index reference_images_store_id_idx on reference_images (store_id);

comment on table reference_images is 'Shop-production reference photos only. Never an AI input, never a selectable design option. 0-3 rows per order.';


-- ============================================================================
-- Row Level Security — enabled now, policies added in a follow-up migration
-- ============================================================================
-- Enabling RLS with zero policies denies ALL access (including to the
-- table owner via the anon/authenticated roles) — the safe default.
-- See docs/06_Final_DB_Review.md §6 for the policy shapes to be added next:
--   staff:    store_id in (select store_id from store_members where user_id = auth.uid())
--   customer: customer_id in (select id from customers where auth_user_id = auth.uid())

alter table stores            enable row level security;
alter table store_members     enable row level security;
alter table customers         enable row level security;
alter table orders            enable row level security;
alter table reference_images  enable row level security;
