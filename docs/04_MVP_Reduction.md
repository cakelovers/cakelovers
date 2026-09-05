# MVP Reduction: Bare-Minimum Single-Order Path

Companion to [`01_PRD.md`](./01_PRD.md), [`02_DB_Schema.md`](./02_DB_Schema.md),
[`03_Architecture.md`](./03_Architecture.md). Those documents describe the
**full target architecture**. This document is a **reduction pass** for a
solo founder optimizing for fastest build, lowest cost, and smallest
maintenance burden — before any code is written.

**Guiding rule:** the MVP must do exactly one thing well — take a customer
from "I want a cake" to "shop owner sees a complete order and can mark it
done" — and nothing else. Every feature below is tested against that rule.
If it isn't required to complete one order end-to-end, it is cut or
deferred, even if it was in the original architecture.

---

## 1. The Bare-Minimum Core Transaction

This is the only flow MVP must support, and every decision below is judged
against it:

```
Customer opens store link
  → describes the cake (text only — this is the entire AI generation input)
  → generates an AI preview, may regenerate (no reference images involved)
  → selects the preferred preview
  → (optionally) uploads up to 3 reference images — for the shop's
    production use only, not a design input, not a selectable option
  → picks a pickup date/time
  → enters name + phone/email
  → submits
      → order is saved (description, selected preview, reference images,
        pickup info, contact info, all in one write)
      → confirmation shown (email optional-nice-to-have, not blocking)
Shop owner opens /admin dashboard (a real, custom-built page — not
Supabase Studio)
  → sees the order in a list
  → opens it, sees the description, the AI preview (the approved design)
    and the reference photos (production aids) shown as two distinct,
    clearly-labeled sections, plus pickup info and contact details
  → changes status via a dropdown (e.g. New → Done)
```

Everything else — staff roles, capacity limits, notification channels,
audit trails, platform-level tenant-provisioning tooling, billing — is
explicitly **not** required to complete this loop and is deferred.
(The shop owner's own `/admin` dashboard is *not* on this deferred
list — see the correction in §2a below.)

---

## 2a. Correction: "Supabase Studio as admin console" Was Ambiguous

An earlier version of this document said the shop-facing admin console
could be replaced by Supabase Studio. **That was too broad and has been
corrected.** Two different things were being conflated:

1. **The shop owner's operational dashboard** (order list, order detail,
   status updates, customer info, AI previews, reference images) — this
   is a **required, custom-built `/admin/[storeSlug]` app section**,
   full stop. Supabase Studio is a raw database table editor; it cannot
   show an order's images side-by-side, cannot present a status
   workflow, and is not something a non-technical shop owner should ever
   need to touch. This was never actually removed from MVP scope in the
   table below — but the wording risked implying otherwise, so it is
   called out explicitly here.
2. **Platform-level tenant provisioning** (creating a new `stores` row
   and its first owner account when onboarding a pilot shop) — this
   *is* still done via Supabase Studio's Table Editor/SQL Editor,
   because it's a founder-only action, done rarely, with no shop owner
   ever seeing it. Items #1 and #2 in the table below refer to this,
   not to the shop owner's dashboard.

The "custom admin console" row in the §4 table below has been reworded
accordingly.

## 2. What Gets Removed From MVP

| # | Item (from original docs) | Why it's cut | Where it goes |
|---|---|---|---|
| 1 | **Self-serve store onboarding/signup flow** | You are the only "platform operator" and will have a handful of pilot shops. Provisioning a `stores` row by hand via the Supabase SQL editor takes 30 seconds and needs zero UI, zero validation logic, zero email verification flow. | Phase 2 (once you have more stores than you want to onboard by hand) |
| 2 | **Platform Super Admin console** (`/admin`, `platform_admins` table, `platform_role` enum) | No UI is needed to manage 1–5 pilot stores. You already have full access via the Supabase dashboard (Table Editor + SQL Editor act as your admin console for free). | Phase 2 (once store count makes hand-managing painful) |
| 3 | **`owner` vs `staff` role distinction** (`store_role` enum, permission branching) | For one order to move end-to-end, you only need "is this logged-in user allowed into this store's dashboard at all?" — a single yes/no. Splitting permissions (only owners edit settings, etc.) has no bearing on completing an order. | Phase 2 (add the enum value + a handful of `if role === 'owner'` checks once you actually have staff accounts) |
| 4 | **In-app staff invite flow** | Supabase Auth already has "invite user by email" built into its Admin API / dashboard. Building your own invite UI + `store_members` pending-row logic duplicates a solved problem. | Use Supabase's built-in invite for MVP; build in-app invite UI only in Phase 2 if hand-inviting via dashboard becomes frequent enough to hurt |
| 5 | **`plans` / `store_subscriptions` tables** | No billing exists yet. Empty tables you migrate, type, and maintain but never query are pure maintenance cost with zero MVP benefit. | Phase 2, created alongside the Stripe/Toss integration that actually uses them |
| 6 | **`notifications_outbox` table + background worker/cron drain pattern** | This pattern exists to support multiple async channels and retry/audit semantics. MVP has exactly one channel (email) and one trigger point (order submitted). A direct, synchronous `await sendEmail(...)` call inside the submit handler does the same job with one function call and no extra table, no cron job, no "pending/sent/failed" state machine to maintain. | Phase 2, when LINE/KakaoTalk/WhatsApp are actually added and retry/audit actually matters |
| 7 | **Async AI-generation job pattern** (`ai_preview_status` queued/generating/failed, polling or Realtime subscription, background worker) | A single OpenAI image generation call (text-only prompt, per the corrected workflow) typically completes well inside a normal HTTP request/response window. Doing it synchronously inside the Route Handler that the client already awaits removes an entire subsystem (job state, polling endpoint or Realtime channel, worker). | Phase 2, only if generation latency/timeouts actually become a measured problem at higher volume |
| 7a | **The `ai_previews` table itself, for every generated candidate** | The customer may regenerate several times before picking a favorite. There is no product reason to store the ones they didn't pick — the shop only ever needs to see the one design the customer approved. Candidates live only in browser state until selection; a database row (and a permanent Storage copy) is written **once**, for the selected preview, at order-submit time. | Phase 2, if you later want generation history/analytics (e.g. "which prompts produce the best previews") — reintroduce as an additive table, no impact on existing orders |
| 8 | **`order_status_history` table** | A full audit trail of every status transition is not needed to complete or track one order — the *current* status on the `orders` row is sufficient for both the customer tracking page and the shop dashboard. | Phase 2 (useful once you want production analytics like "average time in each stage") |
| 9 | **`order_notes` as a separate table** | A history of internal notes with authorship isn't needed for MVP; a single `internal_note text` column on `orders` covers "the shop owner leaves themselves a note." | Phase 2, if multiple staff members start needing threaded/attributed notes |
| 10 | **`audit_log` table** | Sensitive-action audit logging matters once you have multiple staff members and roles to misuse. A solo founder acting on their own store's data doesn't need to audit themselves, and RLS already prevents the only real risk (cross-tenant access) without a log. | Phase 2, introduced alongside role/permission expansion |
| 11 | **Pickup capacity & blackout-date system** (`pickup_blackouts` table, `max_orders_per_slot`, slot-availability computation) | "Process a single order" only needs a date/time input with a sane minimum-lead-time check (e.g. "at least 24 hours from now"), not a capacity-aware slot engine. | Phase 2, once order volume is high enough that a shop can actually get double-booked |
| 12 | **`design_requests` as a separate table with 7 structured columns** (size, shape, flavor, occasion, budget_min/max, allergies) | Each structured field is a form input, a validation rule, and a column to maintain, for information a free-text description already captures for a first version. Collapse to one `description text` column on `orders` itself — no join needed to read an order, and it's the single text field the AI-preview prompt is built from (per the corrected workflow — description is the *only* generation input). | Phase 2, re-introduce structured fields incrementally only for whichever field turns out to matter for real shop workflows (likely flavor + allergies first) |
| 12a | **Any "selected reference image" concept** (`orders.selected_reference_image_id`, comparing references against the AI preview) | Reference images are never a design choice — they're production aids uploaded *after* the customer already picked their AI preview. There is nothing to "select" among them; all uploaded references are simply shown together. | N/A — this is a permanent correction, not a deferral; it was a modeling mistake in the original schema, not a scope cut |
| 13 | **Subdomain-per-store routing** (`storeslug.cakelovers.app`, wildcard DNS/SSL on Cloudflare) | Wildcard subdomain + SSL configuration is real infrastructure work (DNS, cert provisioning, Vercel domain config) that a path segment (`cakelovers.app/s/storeslug`) achieves with zero infrastructure — Next.js dynamic routes handle it natively. | Phase 2/3, once a store specifically asks for it as a branding request, or custom domains become a paid-plan feature |
| 14 | **Cloudflare as an explicit CDN/proxy layer in front of Supabase Storage** | Supabase Storage already serves files through its own CDN. Standing up a separate Cloudflare proxy/Worker in front of it is an infrastructure piece with no functional benefit until image egress cost or transform needs (resizing) actually show up. | Phase 2, when either cost or the need for on-the-fly image transforms justifies it |
| 15 | **Custom signed-URL issuing API route for uploads** (`/api/.../reference-images`) | Supabase Storage's client SDK can upload directly from the browser, governed entirely by a Storage RLS policy — no server code needed to "issue" anything. | Not deferred — replaced outright (see §4 Supabase-native replacements) |
| 16 | **`notification_channel` enum pre-populated with `line`/`kakaotalk`/`whatsapp`** | Postgres lets you append enum values later with a one-line migration. Pre-declaring values you don't use yet adds nothing. | Add each value in Phase 2 exactly when that channel is built |
| 17 | **`payment_status` / `price_cents` as populated, workflow-driving fields** | Keep the *columns* (they're free and prevent an awkward migration later, see §3), but no UI or logic touches them in MVP — price is agreed verbally/offline as today. | Phase 2, wired up alongside Stripe/Toss |
| 18 | **Draft-order concept** (creating a placeholder `orders` row before submission, and the associated status-enum debate flagged in the original architecture doc) | Removed by construction: the client holds all form state locally (including already-uploaded image URLs) and a single `orders` row is inserted **only on final submit**. No partial/abandoned rows, no draft status value, no cleanup job for abandoned drafts. | N/A — this simplification is permanent, not deferred |
| 19 | **i18n framework/library** | The *requirement* (ko/ja/en) stays — it's core to the product, not a nice-to-have. But it doesn't need a full library: a small dictionary-lookup hook (`useTranslation()` reading flat JSON files) is enough for 3 locales and a couple dozen strings. | Reconsider a library (e.g. `next-intl`) only if the number of locales or pluralization/date-formatting needs grow in Phase 2 |

---

## 3. What Must Stay (Non-Negotiable for MVP)

These are required specifically because removing them breaks the single
end-to-end order transaction or a hard product/legal requirement:

| Item | Why it can't be cut |
|---|---|
| **`stores` table + `store_id` on every tenant table** | This *is* the multi-tenant product. Without it there's no way to have more than one shop, which is the whole point of "SaaS platform," not just this MVP. |
| **Row Level Security on every tenant table** | The cheapest possible tenant isolation — it's a few lines of SQL per table, already native to Supabase, and its absence is the single highest-severity risk in a multi-tenant product (one shop seeing another's customer data/images). Cutting this is the one place "smallest maintenance burden" must lose to correctness. |
| **Storage path isolation (`{store_id}/{order_id}/...`) + Storage RLS policies** | Same reasoning as above, applied to images. Free to implement (a path convention + one policy), and the failure mode without it (cross-tenant image exposure) is severe. |
| **`store_members` (simplified: no role column needed, just membership)** | Needed to answer "can this logged-in user see this store's dashboard at all" — the minimum viable authorization check. |
| **Supabase Auth for shop owner login** | The dashboard needs *some* login; Supabase Auth is zero-setup-cost (already part of the stack) so there's no cheaper alternative to reach even for MVP. |
| **Guest customer flow (no account required)** | Confirmed in the previous review round — required for the fastest possible customer-side conversion; building a mandatory-account flow would be *more* work, not less. |
| **`customers`, `orders` tables (trimmed)** | The literal transaction record. Cannot be simplified further without losing the ability to represent an order at all. |
| **`reference_images` (up to 3, production-reference only) and a single persisted AI preview per order (no candidate history)** | Explicit PRD requirements for the customer flow (upload references for the shop, see/select an AI preview) — trimmed in *implementation* (see §2 items 7 and 7a) but not removed as a feature. |
| **Pickup date/time field with a minimum-lead-time check** | A cake shop cannot function without knowing when to have the cake ready; this is core business logic, just implemented as a simple validation instead of a capacity-aware engine. |
| **Order status field on `orders` (current value only)** | The shop owner's entire dashboard value proposition is "see orders and move them along" — the status field is the product, not an extra. |
| **Mobile-first responsive UI** | Explicit, non-negotiable requirement — the primary customer surface is a phone. This costs nothing extra with Tailwind (it's a default posture, not an add-on). |
| **ko / ja / en localization** | Explicit, non-negotiable product requirement, not a scaling concern — simplified in *implementation* (§2 item 19) but not cut. |
| **API-level tenant validation on every route/action** (re-deriving `store_id` from the session, never trusting client input) | The second of the three defense-in-depth layers approved in the last review round — costs nothing beyond writing the check correctly once and reusing it. |

---

## 4. Custom Code Eliminated by Supabase-Native Features

Explicitly answering "what can be replaced by Supabase out-of-the-box
features" — each row below is custom code from the original architecture
that is deleted, not just simplified:

| Original custom plan | Replaced by | Effect |
|---|---|---|
| Custom signed-URL issuing route for reference image upload | **Supabase Storage client SDK** uploading directly from the browser, governed by a Storage RLS policy checking the `store_id` path segment | Deletes an entire API route + its validation logic |
| Custom staff invite flow (`store_members` pending row + invite email) | **Supabase Auth Admin "invite user"** (dashboard button or one Admin API call) | Deletes an invite UI, an email template, and pending-state handling |
| Custom `getTenantContext()` authorization layer doing the heavy lifting of "who can see what" | **RLS policies** do the actual data-access decision; `getTenantContext()` shrinks to "which store slug is in the URL, resolve its id" — a lookup, not an authorization system | Cuts the amount of custom authorization logic to review/maintain; RLS is the audited, tested part (it's Postgres/Supabase's job, not yours) |
| Custom session/cookie handling for auth | **Supabase Auth** (`@supabase/ssr` helpers) | No custom session code at all |
| Custom "who am I, what store am I in" guard duplicated per route | A single **Supabase-aware middleware** using the built-in auth helpers, not a bespoke system | One file, using library-provided primitives |
| Custom async job/polling system for AI preview status | **None needed** — synchronous call/response (see §2 item 7); if async is ever reintroduced later, prefer **Supabase Realtime** (built-in) over a hand-rolled polling endpoint | Removes a subsystem entirely for MVP; keeps a built-in option in reserve for Phase 2 |
| Custom outbox/worker for notifications | **None needed for MVP** — a direct `await` call to an email API (e.g. Resend) inside the submit handler; if async fan-out is needed later, prefer **Supabase Edge Functions on a schedule** over a custom cron+worker | Removes a table and a background process for MVP |
| Custom UI for **platform-level tenant provisioning** (creating a `stores` row for a new pilot shop) — *not* the shop owner's own dashboard, which stays a required custom build (§2a) | **Supabase Studio** (Table Editor + SQL Editor), used directly and only by the founder | Removes the need for any self-serve onboarding/signup flow or platform console in MVP |
| Custom guest-order tracking token (signing + verifying an opaque link) | **Supabase Anonymous Auth** — every guest gets a real session/`auth.uid()` the moment they start an order, so the same RLS policy that covers logged-in customers covers guests too | Removes a whole class of custom auth code (token generation, verification, expiry handling) |

Net effect: the custom application code you actually write and maintain
shrinks to the ordering form, the AI-preview call, the dashboard list/detail
views, and RLS policies — everything else is either a Supabase primitive or
deleted outright.

---

## 5. Revised MVP Schema (Delta from `02_DB_Schema.md`)

**Kept, unchanged:** `stores` (drop `default_locale`/`supported_locales`
complexity down to a single `locale` column if only one locale per store is
needed at launch — optional micro-simplification), `customers`
(`auth_user_id` always populated — see Supabase Anonymous Auth, §4),
`reference_images` (unchanged in shape; corrected in *meaning* — see
§2 item 12a — they carry no "selected" flag and no relation to AI
generation).

**Kept, simplified:**
- `store_members`: drop `role` column for MVP (add back in Phase 2).
- `orders`: absorb `design_requests` into a single `description text`
  column (also the literal text sent to OpenAI, per the corrected
  workflow); keep `pickup_date`/`pickup_time_start`/`pickup_time_end`,
  `status` (now just `order_status` with a minimal set:
  `new`, `in_progress`, `ready`, `completed`, `cancelled`); add
  `internal_note text` (replaces `order_notes` table); add
  `ai_preview_storage_path text` and `ai_preview_prompt text` directly
  on `orders` (replaces the `ai_previews` table and
  `selected_ai_preview_id` FK — see below); drop
  `selected_reference_image_id` entirely (§2 item 12a); keep
  `price_cents`/`payment_status`/`currency` as **unused-but-present**
  columns (near-zero cost, avoids a Phase-2 migration to add them back).

**Removed entirely for MVP:** `design_requests`, `ai_previews` (§2 item
7a — only the customer's selected preview is kept, as two plain columns
on `orders`, not a child table), `order_status_history`, `order_notes`,
`audit_log`, `notifications_outbox`, `pickup_blackouts`, `plans`,
`store_subscriptions`, `platform_admins`.

**Removed enums:** `platform_role`, `store_role` (temporarily —
`store_members` is just a membership row for MVP), `ai_preview_status`
(no longer a stored value — generation is synchronous, and only a
successful result is ever persisted).

This is roughly **10 tables removed** and **2 tables simplified** out of
the original ~14 tenant/platform tables — the schema you actually
migrate and maintain for MVP is: `stores`, `store_members`, `customers`,
`orders`, `reference_images` (**5 tables**), plus RLS policies and
storage bucket policies.

---

## 6. Phase 2 (Add Back Once MVP Is Validated and Has Real Usage)

- `store_role` (owner/staff) + in-app staff invite UI
- `order_status_history` (for production analytics)
- `order_notes` (if multiple staff need attributed notes)
- `audit_log` (once role/permission expansion creates something worth
  auditing)
- Pickup capacity + blackout dates (once double-booking is a real,
  observed problem)
- Structured design-request fields, reintroduced incrementally by
  observed need (likely flavor + allergies first)
- `ai_previews` as a real table again (generation history/analytics),
  plus an async AI-generation queue + Realtime/polling — only if
  synchronous calls measurably start timing out or feel slow at real
  volume, or if candidate-history data turns out to matter
- Notification outbox + LINE/KakaoTalk/WhatsApp channels
- Stripe + Toss payments, `plans`/`store_subscriptions` billing
- Cloudflare CDN/proxy layer in front of Storage (cost/perf driven)
- Self-serve store onboarding flow (once hand-provisioning becomes the
  bottleneck)

## 7. Phase 3 (Only Once Platform Has Meaningfully Scaled)

- The `/platform` operator console + `platform_admins`/impersonation
  (the shop owner's own `/admin` dashboard is separate and already
  required from MVP — see §2a)
- Subdomain-per-store routing with wildcard DNS/SSL
- Multi-location stores
- Cross-store customer identity linking (opt-in)
- Public store discovery/marketplace
- Custom domains per store
- Multi-region deployment

---

## 8. What This Buys You

- **Fewer tables to migrate and type**: 5 vs. ~14.
- **No background workers, cron jobs, or queues to operate or debug** —
  every user-facing action completes within one request/response cycle.
- **No platform-level provisioning app to build** — Supabase Studio
  covers the founder's own store-provisioning needs (the shop owner's
  `/admin` dashboard is still built, just doesn't need a *separate*
  platform console alongside it).
- **No invite/notification infrastructure to build** — Supabase Auth
  invites and a single direct email call cover MVP.
- **No custom guest-auth code** — Supabase Anonymous Auth means guest
  and account-holding customers are handled by the exact same session
  and RLS logic everywhere.
- **Fewer authorization code paths** — RLS carries the isolation
  guarantee; application code only needs to resolve "which store," not
  re-implement "who can see what."
- **A schema that still won't need a breaking migration for Phase 2** —
  every removed feature was either (a) a brand-new table addable later
  with no impact on existing data, or (b) a column already present but
  unused (`price_cents`, `payment_status`), so Phase 2 work is additive.

**This is still architecture only — no code, Next.js app, or packages
have been created.** Ready to proceed to implementation planning once
you confirm this reduced scope.
