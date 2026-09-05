# Product Requirements Document (PRD)
## Multi-Tenant B2B SaaS Platform for Custom Cake Shops

**Status:** Draft for architecture review — no application code written yet.
**Version:** 0.1
**Owner:** Lead SaaS Architect

---

## 1. Problem Statement

Custom cake shops currently manage design requests, reference images, and order
status through ad-hoc channels (Instagram DMs, KakaoTalk, phone calls, paper
order sheets). This causes:

- Lost or scattered reference images and design revisions
- No structured record of what was agreed with the customer
- No visibility into production load / pickup schedule
- No way to show the customer an AI-generated preview before committing
- No standardized, repeatable ordering flow across shops

We are building a **multi-tenant SaaS platform** that any cake shop ("store")
can sign up for, get an isolated workspace, and use to run their custom-cake
ordering pipeline end-to-end: request → AI preview → design selection →
pickup scheduling → order → production tracking.

---

## 2. Goals

1. Let a customer describe a cake, see AI-generated previews, upload
   reference images, pick a design, choose a pickup slot, and submit an
   order — with no back-and-forth messaging required for the basic case.
2. Let a shop owner/staff see all incoming orders, the customer's inputs
   (references + AI previews + notes), and move each order through a
   production pipeline.
3. Guarantee **complete data isolation between stores** (tenants) — one
   store must never be able to see another store's customers, orders,
   images, or settings.
4. Support **Korean, Japanese, and English** from day one, selectable by
   the customer and independently by the shop.
5. Be **mobile-first**: the overwhelming majority of customers will use
   this on a phone.
6. Be built so that **payments (Stripe, Toss)** and **notifications (LINE,
   KakaoTalk, WhatsApp)** can be added later without re-architecting core
   flows.

### Non-goals (explicitly out of scope for MVP)

- In-app payment collection (deposits, full payment) — MVP is
  request-and-confirm; payment stays offline/in-person or via existing
  shop tooling.
- Delivery/logistics management (pickup only in MVP).
- Marketplace/discovery (customers reach a store via that store's own
  link/QR/subdomain, not by browsing a directory).
- Native mobile apps (mobile-first responsive web only).
- Multi-currency accounting/reporting.

---

## 3. Personas & Roles

| Role | Scope | Description |
|---|---|---|
| **Platform Super Admin** | Cross-tenant | Platform operator staff. Manages store onboarding, billing plans, platform-wide config, support/impersonation. |
| **Store Owner** | Single store | Full control of their store: staff, settings, catalog, order management, analytics. |
| **Store Staff** | Single store | Day-to-day production staff. Views/updates orders, cannot manage billing/staff/settings (configurable). |
| **Customer** | Single store (per session) | Anonymous-first or account-based end customer placing an order with one specific store. A customer record is scoped to the store they ordered from (see §9 in `03_Architecture.md` for cross-store identity notes). |

Role enforcement details are in [`03_Architecture.md`](./03_Architecture.md#4-authentication--role-management).

---

## 4. Core Workflows (Product Level)

### 4.1 Customer Ordering Flow

1. Customer opens a store's ordering page (`storeslug.cakelovers.app` or
   `cakelovers.app/s/storeslug`).
2. Customer enters a **cake design request**: a free-text description
   (this text is the *entire* input to AI generation — see step 3).
3. Customer triggers **AI cake preview generation from that text alone**
   (1 request = N generated images, capped per plan/rate limit). No
   image is ever used as a generation input — this is text-to-image
   only.
4. Customer iterates: can **regenerate** with adjusted description
   (subject to plan/rate limits) and compares results.
5. Customer **selects their preferred AI-generated preview** — this is
   the approved design going forward.
6. Customer **uploads up to 3 reference images** (inspiration/production
   photos). These are **not** a design choice and are never compared
   against or substituted for the AI preview — they exist solely to
   give the shop owner extra visual context (color, texture, style) when
   physically making the cake.
7. Customer **chooses a pickup date/time** from the store's available
   slots (store-configured lead time, blackout dates, daily capacity).
8. Customer enters contact info (name, phone, email) and **submits the
   order**.
9. Customer receives a confirmation (in-app + email; SMS/KakaoTalk/LINE in
   later phases) with an order tracking link.
10. Customer can revisit the tracking link to see order status.

### 4.2 Shop Owner / Staff Flow

1. Staff logs into the store's **dedicated `/admin` dashboard** — a
   real, purpose-built application, not a generic database tool.
2. **Incoming orders queue**: new orders surfaced first, filterable by
   status, pickup date, design complexity.
3. Staff opens an order and sees, as two clearly separated sections: the
   **customer-approved AI preview** (the design to build toward) and
   the **customer's reference photos** (production aids only — never
   the design itself), plus the full request text, pickup date/time,
   contact info, and an internal notes field.
4. Staff can **update order status** along a production pipeline (see
   §6.2 status model in `03_Architecture.md`).
5. Staff can add **internal notes**, adjust price (manual, MVP), and
   flag/escalate an order.
6. Staff sees a **calendar/queue view** of pickups by date to manage
   daily production capacity.
7. Owner additionally manages: store profile, business hours/pickup
   slots, staff accounts & roles, design/catalog presets, and (future)
   billing/subscription plan.

---

## 5. Functional Requirements

### 5.1 Customer-facing
- FR-1: Multi-step order form (design request → previews → references →
  design selection → pickup → contact → submit), resumable within a
  session.
- FR-2: AI preview generation via OpenAI (image generation), with
  prompt built from structured inputs + free text.
- FR-3: Upload up to 3 reference images (client-side validate type/size
  before upload).
- FR-4: Store-specific pickup slot picker respecting store hours,
  lead time, and capacity.
- FR-5: Order confirmation + shareable/bookmarkable tracking page.
- FR-6: Full UI localized in ko / ja / en, with locale auto-detected and
  user-switchable.

### 5.2 Shop-facing
- FR-7: Orders list with status filters, search, and pickup-date
  sorting.
- FR-8: Order detail view: request data, references, AI previews,
  selected design, customer contact, status history, internal notes.
- FR-9: Status update workflow with a fixed, configurable-later status
  set (see architecture doc).
- FR-10: Store settings: profile, hours/slots, staff/roles.
- FR-11: Staff invite + role assignment (Owner invites Staff by email).
- FR-12: Basic dashboard metrics (orders by status, upcoming pickups).

### 5.3 Platform-facing
- FR-13: Store (tenant) onboarding/provisioning flow.
- FR-14: Platform Super Admin console for store management & support.
- FR-15: Usage metering hooks (AI generation count, image storage) to
  support future plan tiers/billing.

### 5.4 Non-functional
- NFR-1: **Tenant isolation** — enforced at the database layer (Row
  Level Security), not just application logic.
- NFR-2: **i18n** for ko/ja/en across all customer- and shop-facing UI,
  including date/time/currency formatting per locale/store region.
- NFR-3: **Mobile-first** responsive design; customer flow must be fully
  usable on a 360–430px wide viewport with no horizontal scrolling.
- NFR-4: **Extensibility** for Stripe, Toss, LINE, KakaoTalk, WhatsApp
  without schema-breaking changes (see architecture doc, integration
  abstraction layer).
- NFR-5: **Availability**: target 99.5% for MVP (single-region Vercel +
  Supabase).
- NFR-6: **Image handling cost/perf**: reference images and AI previews
  served via CDN (Cloudflare), not directly from origin storage.
- NFR-7: **Auditability**: status changes and role-sensitive actions are
  logged with actor, timestamp, store_id.
- NFR-8: **Data privacy**: customer contact info and images are
  tenant-scoped and not exposed cross-tenant, including to Platform
  Super Admins outside of an explicit support/impersonation flow.

---

## 6. Success Metrics (MVP)

- Time from "customer opens order page" to "order submitted" (target:
  median < 6 minutes).
- % of orders that used at least one AI preview.
- % of orders where selected design = an AI preview vs. reference-only.
- Shop staff time-to-first-status-update after order received.
- Store activation rate (stores that complete onboarding and receive
  ≥1 order within 14 days).

---

## 7. MVP Scope vs. Future Phases

### MVP (Phase 1)
- Single-store multi-tenant core: auth, roles, store settings.
- Customer ordering flow as described in §4.1 (no payment collection).
- AI preview generation (OpenAI), reference image upload (≤3), Cloudflare
  R2/Images storage + CDN delivery.
- Shop dashboard: order queue, order detail, status updates, pickup
  calendar, staff management.
- i18n: ko / ja / en.
- Email notifications only (order confirmation, status change).
- Platform Super Admin: minimal store provisioning + support view.

### Phase 2
- Payments: Stripe (international) + Toss (Korea) — deposit and/or
  full payment, refunds, payment status in order lifecycle.
- Notification channels: LINE, KakaoTalk, WhatsApp (in addition to
  email), via a unified notification abstraction.
- Store subscription billing/plan tiers tied to usage metering (AI
  generations/month, image storage, staff seats).
- Design catalog/templates library reusable across orders.
- Analytics dashboard (conversion funnel, popular designs, revenue).

### Phase 3
- Multi-location stores (one tenant, multiple pickup locations).
- Customer accounts spanning multiple stores (opt-in identity linking).
- Public store discovery/marketplace (optional, opt-in per store).
- Automated capacity/lead-time recommendations (ML on historical
  throughput).
- White-label custom domains per store.

---

## 8. Open Questions (for stakeholder confirmation before build)

1. Is a customer account required, or is guest checkout with a
   tracking-link the primary MVP path? (Assumption: guest-first, optional
   account.)
2. Who owns AI generation cost — platform-wide OpenAI key with metered
   billing to stores, or store-provided key? (Assumption: platform key,
   metered.)
3. Do stores need custom domains in MVP, or is a subdomain/slug
   sufficient? (Assumption: subdomain/slug only in MVP.)
4. Pricing/plan tiers — flat SaaS fee vs. usage-based? (Not required to
   answer for architecture, but affects the metering schema.)

---

*See [`02_DB_Schema.md`](./02_DB_Schema.md) for data model and
[`03_Architecture.md`](./03_Architecture.md) for system design, tenant
isolation, auth, API, and folder structure.*
