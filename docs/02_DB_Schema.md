# Database Architecture
## Multi-Tenant B2B SaaS Platform for Custom Cake Shops

**Engine:** PostgreSQL via Supabase (with Row Level Security for tenant
isolation). Storage for images: Supabase Storage buckets, fronted by
Cloudflare CDN (see [`03_Architecture.md`](./03_Architecture.md)).

This document defines schema, keys, enums, indexes, and RLS strategy.
No migrations are generated yet — this is the design to be reviewed.

---

## 1. Tenancy Model

- **Tenant = `stores` row.** Every tenant-scoped table carries a
  `store_id uuid` foreign key to `stores.id`.
- There is **no shared "global" data table that mixes tenants** except
  platform-level tables (`stores`, `platform_admins`, `plans`) which are
  intentionally cross-tenant and only reachable by the Platform Super
  Admin role.
- `store_id` is **never nullable** on tenant-scoped tables and is always
  part of the RLS predicate (see §7).
- `store_id` is denormalized onto every child table (e.g. `order_images`
  carries `store_id` even though it could be derived via `orders.store_id`)
  specifically so RLS policies can filter directly on the row without a
  subquery/join — this keeps policies simple and index-friendly.

---

## 2. Entity Overview

```
stores (tenant root)
 ├─ store_members (staff/owner ↔ auth.users, role)
 ├─ store_settings (hours, locale defaults, branding)
 ├─ pickup_slots / pickup_blackouts
 ├─ customers (scoped to a store)
 │   └─ orders
 │        ├─ design_requests (1:1 with order, the "brief")
 │        ├─ reference_images (≤3 per order)
 │        ├─ ai_previews (generated images + prompt/version)
 │        ├─ order_status_history
 │        └─ order_notes (internal, staff-only)
 ├─ notifications_outbox (future channels, store-scoped)
 └─ audit_log (store-scoped actions)

platform (cross-tenant, platform-admin only)
 ├─ platform_admins
 ├─ plans
 └─ store_subscriptions (future: Stripe/Toss billing)
```

---

## 3. Enums

```sql
-- Roles a user can hold within a given store
create type store_role as enum ('owner', 'staff');

-- Platform-level role, separate from store_role
create type platform_role as enum ('super_admin', 'support');

-- Order lifecycle. Kept intentionally small & linear for MVP;
-- extensible later without renumbering (text-backed enum).
create type order_status as enum (
  'submitted',        -- customer submitted, awaiting shop review
  'accepted',         -- shop confirmed they will make it
  'in_production',    -- actively being made
  'ready_for_pickup',
  'completed',        -- picked up
  'cancelled'
);

create type image_kind as enum ('reference', 'ai_preview');

create type ai_preview_status as enum ('queued', 'generating', 'completed', 'failed');

create type locale_code as enum ('ko', 'ja', 'en');

create type notification_channel as enum ('email', 'sms', 'line', 'kakaotalk', 'whatsapp');

create type notification_status as enum ('pending', 'sent', 'failed');

create type payment_status as enum ('not_required', 'pending', 'paid', 'partially_paid', 'refunded', 'failed');
```

---

## 4. Platform-Level Tables (cross-tenant)

### `stores` — the tenant root
```sql
create table stores (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,          -- subdomain / path segment
  name                text not null,
  default_locale      locale_code not null default 'en',
  supported_locales    locale_code[] not null default array['en']::locale_code[],
  country_code        text,                            -- ISO 3166-1 alpha-2, drives Toss vs Stripe later
  timezone            text not null default 'UTC',      -- IANA tz, drives pickup slot math
  status              text not null default 'active',   -- active | suspended | onboarding
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on stores (slug);
```

### `platform_admins`
```sql
create table platform_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  role        platform_role not null default 'support',
  created_at  timestamptz not null default now()
);
```

### `plans` / `store_subscriptions` (future billing; MVP: table exists, unused/free tier only)
```sql
create table plans (
  id                text primary key,          -- e.g. 'free', 'pro'
  name              text not null,
  monthly_ai_generation_limit int,
  monthly_price_cents int,
  currency          text default 'USD'
);

create table store_subscriptions (
  store_id          uuid primary key references stores(id) on delete cascade,
  plan_id           text not null references plans(id),
  status            text not null default 'active', -- active | past_due | canceled
  provider          text,                             -- 'stripe' | 'toss' | null (manual/free)
  provider_customer_id text,
  current_period_end   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
```

---

## 5. Tenant-Scoped Tables

### `store_members` — maps `auth.users` to a store with a role
```sql
create table store_members (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         store_role not null default 'staff',
  invited_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (store_id, user_id)
);
create index on store_members (user_id);
create index on store_members (store_id);
```
> A user can belong to **multiple stores** (e.g. a staff member employed
> by two shops), each with an independent role — the `(store_id, user_id)`
> pair is the membership, not the user alone. Current-store context is
> resolved at the session/API layer (see architecture doc §3).

### `store_settings`
```sql
create table store_settings (
  store_id          uuid primary key references stores(id) on delete cascade,
  business_hours    jsonb not null default '{}',   -- {mon:[{open,close}], ...} in store timezone
  pickup_lead_time_hours int not null default 24,
  max_orders_per_slot int not null default 3,
  brand_color       text,
  logo_url          text,
  updated_at        timestamptz not null default now()
);
```

### `pickup_slots` (generated/derived) and `pickup_blackouts`
```sql
create table pickup_blackouts (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  date        date not null,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (store_id, date)
);
```
> MVP computes available pickup slots at request time from
> `store_settings.business_hours` + `pickup_lead_time_hours` +
> `pickup_blackouts` + a count of existing `orders` for that slot vs.
> `max_orders_per_slot`, rather than materializing a slots table. This
> avoids a sync problem between generated slots and settings changes.
> A materialized `pickup_slots` table is a Phase 2 option if query cost
> becomes an issue.

### `customers`
```sql
create table customers (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id),  -- always set: guests use Supabase Anonymous Auth (see 03_Architecture.md §3), so there is no "null auth_user_id" case
  name         text not null,
  phone        text,
  email        text,
  preferred_locale locale_code not null default 'en',
  created_at   timestamptz not null default now()
);
create index on customers (store_id);
create index on customers (store_id, phone);
create index on customers (store_id, email);
```
> A given real person ordering from two different stores gets **two
> separate `customers` rows** (one per store), even if `auth_user_id` is
> shared — see [`03_Architecture.md` §9](./03_Architecture.md#9-cross-store-customer-identity)
> for the reasoning (tenant isolation > cross-store convenience in MVP).

### `orders`
```sql
create table orders (
  id                  uuid primary key default gen_random_uuid(),
  store_id            uuid not null references stores(id) on delete cascade,
  customer_id         uuid not null references customers(id) on delete restrict,
  status              order_status not null default 'submitted',
  pickup_date         date not null,
  pickup_time_start   time not null,
  pickup_time_end     time not null,
  selected_ai_preview_id uuid,        -- fk added after ai_previews defined (see below)
  price_cents         integer,        -- manually set by staff in MVP
  currency            text default 'USD',
  payment_status      payment_status not null default 'not_required',
  customer_note       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on orders (store_id, status);
create index on orders (store_id, pickup_date);
create index on orders (customer_id);
```

### `design_requests` — the structured "brief", 1:1 with an order
```sql
create table design_requests (
  order_id        uuid primary key references orders(id) on delete cascade,
  store_id        uuid not null references stores(id) on delete cascade,
  description     text not null,          -- free-text customer request
  size            text,                    -- e.g. '6-inch', '2-tier'
  shape           text,
  flavor          text,
  occasion        text,
  budget_min_cents integer,
  budget_max_cents integer,
  allergies       text,
  created_at      timestamptz not null default now()
);
```

### `reference_images` — up to 3 customer-uploaded images per order

> **Corrected purpose (important):** reference images are **not** an AI
> generation input and are **not** a selectable design option. The AI
> preview is generated from the text description alone (§ `ai_previews`
> below). Reference images are uploaded **after** the customer has
> already picked their preferred AI preview, purely so the **shop owner**
> has extra visual context (color/texture/inspiration photos) when
> physically making the cake. There is therefore no "selected reference
> image" concept anywhere in the schema — all uploaded reference images
> are simply shown together on the order.

```sql
create table reference_images (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  order_id     uuid not null references orders(id) on delete cascade,
  storage_path text not null,      -- path within Supabase Storage bucket
  cdn_url      text,               -- Cloudflare-fronted URL, cached after first resolve
  position     smallint not null check (position between 1 and 3),
  created_at   timestamptz not null default now(),
  unique (order_id, position)
);
create index on reference_images (order_id);
```
> The "max 3" rule is enforced at the application layer (API validation)
> and additionally protected by the `position between 1 and 3` +
> `unique(order_id, position)` constraints, which make a 4th row
> impossible to insert without violating a constraint.

### `ai_previews` — AI-generated cake images tied to a request

> **Corrected input:** the prompt is built **only** from the customer's
> text description (+ structured fields, if any). Reference images are
> never sent to OpenAI and never influence generation — this is a
> pure text-to-image call, not image-to-image. This keeps the OpenAI
> integration simpler (no image upload/encoding into the generation
> request) and cheaper (text-to-image pricing, no vision input).
>
> **MVP note:** for the reasons in
> [`04_MVP_Reduction.md`](./04_MVP_Reduction.md#5-revised-mvp-schema-delta-from-02_db_schemamd),
> the MVP does not persist every generated candidate here — candidates
> the customer regenerates through are ephemeral (held in browser state
> only); a row is written to this table **only for the preview the
> customer actually selects**, at the moment the order is submitted.
> This table's full shape (with `queued`/`generating`/`failed` states)
> is the Phase 2 target for if/when generation moves to an async job
> model — MVP writes rows already in a terminal `completed` state.

```sql
create table ai_previews (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  order_id        uuid not null references orders(id) on delete cascade,
  prompt          text not null,           -- final prompt sent to OpenAI (text description only)
  prompt_version  text,                     -- our prompt-template version, for debugging/tuning
  model            text not null,            -- e.g. 'gpt-image-1'
  storage_path    text,
  cdn_url         text,
  status          ai_preview_status not null default 'queued',
  error_message   text,
  created_at      timestamptz not null default now()
);
create index on ai_previews (order_id);
create index on ai_previews (store_id, status);

alter table orders
  add constraint fk_orders_selected_ai_preview
  foreign key (selected_ai_preview_id) references ai_previews(id) on delete set null;
```

### `order_status_history` — audit trail of status transitions
```sql
create table order_status_history (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  order_id     uuid not null references orders(id) on delete cascade,
  from_status  order_status,
  to_status    order_status not null,
  changed_by   uuid references auth.users(id),
  note         text,
  created_at   timestamptz not null default now()
);
create index on order_status_history (order_id, created_at);
```

### `order_notes` — internal staff-only notes
```sql
create table order_notes (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  order_id     uuid not null references orders(id) on delete cascade,
  author_id    uuid not null references auth.users(id),
  body         text not null,
  created_at   timestamptz not null default now()
);
create index on order_notes (order_id);
```

### `notifications_outbox` — unified send log for future channels
```sql
create table notifications_outbox (
  id            uuid primary key default gen_random_uuid(),
  store_id      uuid not null references stores(id) on delete cascade,
  order_id      uuid references orders(id) on delete cascade,
  customer_id   uuid references customers(id) on delete cascade,
  channel       notification_channel not null,
  template_key  text not null,          -- e.g. 'order_confirmed', 'status_changed'
  payload       jsonb not null default '{}',
  status        notification_status not null default 'pending',
  provider_message_id text,
  error_message text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index on notifications_outbox (store_id, status);
```
> This table exists in MVP schema even though only `email` is wired up,
> so Phase 2 channel additions (LINE/KakaoTalk/WhatsApp) are additive
> rows/values, not schema migrations. See
> [`03_Architecture.md` §8](./03_Architecture.md#8-notification-abstraction-future-line--kakaotalk--whatsapp).

### `audit_log` — sensitive action trail (role changes, settings changes)
```sql
create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  actor_id     uuid references auth.users(id),
  action       text not null,       -- e.g. 'store_member.role_changed'
  target_type  text,
  target_id    uuid,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now()
);
create index on audit_log (store_id, created_at);
```

---

## 6. Storage Buckets (Supabase Storage)

| Bucket | Contents | Access |
|---|---|---|
| `reference-images` | Customer-uploaded reference photos | Private; signed URL or Cloudflare-proxied, scoped by `store_id/order_id/...` path convention |
| `ai-previews` | OpenAI-generated preview images | Private; same path convention |
| `store-branding` | Logos, brand assets | Public-read (non-sensitive) |

Path convention: `{store_id}/{order_id}/{image_id}.{ext}` — this means
**object paths themselves are tenant-namespaced**, which lets storage
policies check the leading path segment against the caller's `store_id`
claim as a second layer of isolation beyond DB RLS (see architecture
doc §2 for the full defense-in-depth picture).

---

## 7. Row Level Security (RLS) Strategy

RLS is **mandatory** on every tenant-scoped table. General pattern:

```sql
alter table orders enable row level security;

-- Staff/owners can access rows for stores they are a member of
create policy "store members can access their store's orders"
on orders
for all
using (
  store_id in (
    select store_id from store_members where user_id = auth.uid()
  )
);

-- Customers (authenticated) can access only their own orders
create policy "customers can access their own orders"
on orders
for select
using (
  customer_id in (
    select id from customers where auth_user_id = auth.uid()
  )
);
```

Key points (elaborated in [`03_Architecture.md` §2](./03_Architecture.md#2-tenant-isolation-strategy)):

- Every policy predicate resolves `store_id` (or a join to it) against
  `auth.uid()` — **never** against a client-supplied `store_id` value.
- Guest customers use **Supabase Anonymous Auth** (see
  [`03_Architecture.md` §3](./03_Architecture.md#3-authentication--role-management)),
  so they always have a real `auth.uid()` and are covered by the exact
  same `customers.auth_user_id = auth.uid()` policy as a customer who
  created a full account — there is no separate guest-token code path
  and no need for a service-role bypass just to let a guest see their
  own order.
- Platform Super Admins get a **separate policy** keyed off
  `platform_admins`, not off `store_members`, and all such access is
  written to `audit_log`.
- Storage bucket policies mirror the same `store_id`-in-path check.

---

## 8. Indexing Summary

- All foreign keys have a supporting index.
- All tenant-scoped tables are indexed on `store_id` (alone or as the
  leading column of a composite index) since every query is filtered by
  tenant.
- `orders (store_id, status)` and `orders (store_id, pickup_date)`
  support the two primary dashboard views (queue-by-status,
  calendar-by-pickup-date).
- `customers (store_id, phone)` / `(store_id, email)` support
  look-up-by-contact when a returning guest re-enters their info.

---

## 9. Migration & Extensibility Notes

- New order statuses can be added to `order_status` (Postgres allows
  appending enum values); avoid removing/renaming values once shipped.
- Payment fields (`price_cents`, `payment_status`) exist on `orders` now
  so Phase 2 Stripe/Toss integration is additive (new `payments` table +
  webhook handlers), not a schema rewrite.
- `notifications_outbox.channel` enum already includes future channels
  so the outbox/worker pattern doesn't change shape when they activate.
