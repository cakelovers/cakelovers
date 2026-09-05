# System Architecture
## Multi-Tenant B2B SaaS Platform for Custom Cake Shops

Companion to [`01_PRD.md`](./01_PRD.md) (product) and
[`02_DB_Schema.md`](./02_DB_Schema.md) (data model). This document covers
tenant isolation, auth/roles, the two core flows, API design, folder
structure, scaling risks, and phasing.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind · shadcn/ui ·
Supabase (Postgres + Auth + Storage) · OpenAI (image generation) ·
Cloudflare (CDN/DNS, future Workers) · Vercel (hosting).

---

## 1. High-Level System Diagram

```
                         ┌─────────────────────┐
                         │   Cloudflare (DNS,   │
                         │   CDN, image proxy)  │
                         └──────────┬───────────┘
                                    │
                         ┌──────────▼───────────┐
                         │   Vercel (Next.js 15) │
                         │  App Router: RSC +    │
                         │  Route Handlers +     │
                         │  Server Actions       │
                         └──┬────────────┬───────┘
                            │            │
              ┌─────────────▼─┐      ┌───▼─────────────┐
              │   Supabase    │      │   OpenAI API     │
              │ Postgres+RLS  │      │ (image gen)      │
              │ Auth          │      └──────────────────┘
              │ Storage       │
              └───────────────┘
                            │
              (future) ┌────▼─────────────────────────┐
                        │ Stripe / Toss (payments)      │
                        │ LINE / KakaoTalk / WhatsApp    │
                        │ (notifications, via outbox)    │
                        └────────────────────────────────┘
```

Tenant resolution happens at the edge/middleware layer (subdomain or
path segment → `store_id`), then flows through every server-side call as
an explicit, verified value — never trusted from the client body.

---

## 2. Tenant Isolation Strategy

Isolation is enforced in **three independent layers**, so a bug in any
one layer does not equal a cross-tenant data leak (defense in depth).

### Layer 1 — Routing & tenant resolution
- Each store is addressed by a **slug**: `storeslug.cakelovers.app`
  (subdomain, preferred) or `cakelovers.app/s/storeslug` (path-based
  fallback, simpler for MVP/local dev and for stores without custom
  domain UX needs yet).
- Next.js **middleware** resolves the slug → looks up `stores.id` →
  attaches it to the request (header/cookie for downstream RSC/route
  handlers). This is a **lookup for routing convenience only** — it is
  never itself the authorization boundary.

### Layer 2 — Application-layer authorization
- Every server action / route handler that touches tenant data
  re-derives `store_id` from **the authenticated session**
  (`store_members` for staff, `customers.auth_user_id` for customers —
  guest and full-account customers alike, since guests hold a real
  anonymous session per §3.1) — **not** from the URL, not from a
  client-supplied field in the request body.
- A shared `getTenantContext()` helper (see §7 folder structure) is the
  single place this resolution happens, so every API surface uses the
  same logic instead of each route reimplementing it.

### Layer 3 — Database-layer enforcement (Postgres RLS)
- As detailed in [`02_DB_Schema.md` §7](./02_DB_Schema.md#7-row-level-security-rls-strategy),
  RLS is enabled on every tenant-scoped table, with policies keyed off
  `auth.uid()` joined through `store_members`/`customers`.
- This is the **backstop**: even if application code had a bug and
  queried the wrong `store_id`, Postgres itself refuses to return or
  mutate rows outside the caller's tenant membership.
- Supabase **service-role** access (which bypasses RLS) is used only in
  a small number of explicitly-reviewed server-only code paths (the
  AI-preview generation route, which writes no tenant rows at all and
  so barely needs it; admin impersonation) — never in code reachable
  directly from client input without its own manual authorization
  check. Guest customers need **no** service-role path — they carry a
  real RLS-covered session per §3.1.

### Layer 4 (storage) — path-namespaced buckets
- Object storage paths are `{store_id}/{order_id}/{file}` (see DB doc
  §6). Storage policies check the path's leading `store_id` segment
  against the caller's tenant membership, mirroring the DB RLS pattern
  for binary assets that don't live in Postgres rows.

### Anti-patterns explicitly avoided
- **No shared tables without `store_id`** for anything customer- or
  order-related.
- **No trusting a `store_id` passed in a request body/query string** as
  an authorization input — it's only ever a hint for which public page
  to render pre-auth.
- **No cross-tenant joins** in application queries; if a Platform Admin
  needs cross-tenant visibility, that's a distinct, audited code path
  (see §5.1), not a relaxed version of the normal query.

---

## 3. Authentication & Role Management

### 3.1 Identity provider
- **Supabase Auth** for all authenticated identities (store owners,
  staff, platform admins, and customers who choose to create an
  account). Supports email/password + OAuth (Google) out of the box;
  Kakao/LINE login as social providers can be added in Phase 2 without
  changing the role model.
- **Guest customers** (no account) are supported for the core ordering
  flow (approved: guest-first, confirmed in the architecture review) via
  **Supabase Anonymous Auth**: the moment a customer starts an order, the
  client silently creates an anonymous Supabase session (`auth.uid()`
  exists, no email/password prompt, invisible to the customer). This
  session is what the browser holds for that visit.
  - This means a guest customer is **not a special case** anywhere else
    in the system — `customers.auth_user_id` is always populated, RLS
    policies for "a customer can see their own order" are identical for
    guests and account-holders, and no custom token signing/validation
    code exists at all (a meaningful simplification over a hand-rolled
    guest-token scheme — see
    [`04_MVP_Reduction.md`](./04_MVP_Reduction.md#4-custom-code-eliminated-by-supabase-native-features)).
  - **Trade-off, accepted for MVP:** the tracking page relies on that
    browser's session, so it only works reliably in the same browser the
    order was placed in. Supabase supports upgrading an anonymous user to
    a permanent account later (Phase 2), which is the natural path to a
    "log in on any device to see your order" feature if that becomes a
    real customer need. The confirmation email is a fallback record of
    the order for MVP even without a fully portable tracking link.

### 3.2 Role model
Two independent role dimensions, matching the two enums in the DB
schema:

| Dimension | Enum | Values | Scope |
|---|---|---|---|
| Store role | `store_role` | `owner`, `staff` | Per `(store_id, user_id)` row in `store_members` |
| Platform role | `platform_role` | `super_admin`, `support` | Global, in `platform_admins` |

- A single Supabase `auth.users` row can have **multiple `store_members`
  rows** (one person on staff at two shops) — the active store for a
  dashboard session is chosen via a store-switcher UI and carried in
  the URL (`/admin/[storeSlug]/...`), not stored as a single global
  "current store" on the user.
- `owner` vs `staff` permission differences (MVP):
  - Both: view orders, update order status, add internal notes.
  - `owner` only: manage staff/roles, edit store settings/hours,
    (future) billing.
- Platform roles are entirely separate from store roles — a platform
  `support` user does **not** automatically get store-level access; any
  cross-tenant support action is a distinct, logged flow (§5.1).

### 3.3 Session → tenant context resolution
```
Request arrives
  → Supabase session cookie validated (covers full accounts and
    anonymous/guest sessions alike — both are ordinary Supabase sessions)
  → getTenantContext(request):
      - if staff/owner session: read store_members for auth.uid(),
        intersect with the :storeSlug in the URL → active store_id + role
      - if customer session (including anonymous/guest sessions, which
        are ordinary Supabase sessions): resolve customers row via
        auth_user_id → store_id locked to that customer's store
      - if platform admin: no implicit store_id; must explicitly pass
        target store_id, which is itself validated against
        platform_admins + written to audit_log
  → All downstream DB access uses Supabase client scoped to this
    session (RLS applies) — service-role client used only for the
    admin-impersonation path noted above (guest customers need no
    service-role path at all now that they hold a real anonymous
    session).
```

### 3.4 Authorization enforcement points
- **Middleware**: coarse — is there a valid session at all for protected
  routes (`/admin/**` — the shop owner/staff dashboard, `/platform/**` —
  the platform-operator console)?
- **Route handlers / Server Actions**: role check (`owner`-only actions
  reject `staff`) plus tenant context resolution as above.
- **RLS**: final backstop at the data layer, as described in §2.

---

## 4. Customer Ordering Flow (System View)

Maps to PRD §4.1, **corrected per architecture review** to the actual
business workflow: the AI preview is generated and selected **before**
any reference image is uploaded, and reference images are never an AI
input or a "design option" — they exist solely to help the shop owner
during production. Sequence:

1. **GET `/s/[storeSlug]`** (or subdomain) → middleware resolves
   `store_id`, page renders store branding/locale defaults (RSC reads
   `stores` + `store_settings` — public, non-sensitive fields only). An
   anonymous Supabase session is created for the visitor at this point
   (see §3.1) if one doesn't already exist.
2. Customer types a **cake design description** (free text, client
   component, local state only — nothing is written to the database
   yet, so an abandoned session never litters the `orders` table).
3. **POST `/api/stores/[storeSlug]/ai-preview`** — a stateless,
   text-in/image-out route:
   - Builds the OpenAI prompt **from the text description alone**
     (server-side prompt construction, never a client-supplied raw
     prompt, to keep prompt-injection and cost/abuse under control).
     Reference images are never part of this call — there are none yet,
     and there never will be as an input even after upload.
   - Calls OpenAI image generation and returns the resulting image
     URL(s)/data directly in the response.
   - **Writes nothing to the database.** The candidate preview(s) live
     only in client-side state until the customer either regenerates
     (discarding the previous candidate) or selects one.
   - Enforces a per-session generation rate limit (e.g. a small fixed
     cap per anonymous session) to bound OpenAI cost from unlimited
     regeneration — see §10 risks.
4. Customer may **regenerate** any number of times up to the rate limit,
   each call repeating step 3 and replacing the displayed candidate(s).
5. Customer **selects their preferred preview** — a pure client-side
   selection (which candidate's URL/prompt to keep); still no database
   write.
6. Customer **uploads up to 3 reference images** — uploaded directly
   from the browser to a temporary, session-scoped path in the
   `reference-images` Storage bucket using the Supabase client SDK,
   governed entirely by a Storage RLS policy (no custom signed-URL
   server code — see §7/§10). These are explicitly framed in the UI as
   **production reference photos for the shop, not a design choice** —
   they never affect, replace, or get compared against the AI preview.
7. Pickup slot picker: date/time input validated against a minimum
   lead-time rule computed from `store_settings` (MVP: a simple
   lead-time check, not a capacity/blackout engine — see
   [`04_MVP_Reduction.md`](./04_MVP_Reduction.md)); re-validated
   server-side at submit, never trusted from the client alone.
8. Customer enters contact info (name, phone, email) and **submits the
   order** — **POST `/api/stores/[storeSlug]/orders`** — a single
   request that atomically:
   - creates the `customers` row (or reuses one, keyed by the session's
     `auth_user_id`),
   - inserts the `orders` row with the description, pickup date/time,
     and contact info,
   - persists **only the selected** AI preview as an `ai_previews` row
     (re-uploading/copying its image into permanent, tenant-scoped
     Storage) and links it via `orders.selected_ai_preview_id` —
     candidates the customer didn't pick are simply discarded, never
     written anywhere,
   - links the already-uploaded reference images (moved/re-pathed from
     their temporary location into the permanent
     `{store_id}/{order_id}/...` path) to the new `order_id`,
   - sends the confirmation notification directly (a synchronous email
     call — no outbox/queue for MVP, see
     [`04_MVP_Reduction.md`](./04_MVP_Reduction.md)).
9. Customer sees an in-app confirmation and is shown/emailed a link to
   `/s/[storeSlug]/orders/[orderId]/track` — authorized by their
   (possibly anonymous) Supabase session per §3.1, not a custom token.

> **Why no draft order row:** because nothing is persisted until step 8,
> the `orders` table only ever contains real, intentional submissions —
> there is no `draft` status, no cleanup job for abandoned sessions, and
> no ambiguity about what counts as "an order" for the shop dashboard to
> display.

---

## 5. Admin Dashboard Flow (System View) — the Shop Owner's `/admin`

Maps to PRD §4.2. **This is a dedicated, custom-built Next.js app
section — not Supabase Studio.** Supabase Studio is used only by the
founder, directly, to provision `stores` rows at the platform level
(§5.1); it is never exposed to a shop owner and cannot show a
production-friendly order/image view, so it is not a substitute for this
section at any phase.

1. **`/admin/[storeSlug]`** — protected route; middleware confirms
   session, `getTenantContext` confirms membership in `storeSlug`'s
   store, redirects to a store-switcher if the user has no membership
   there.
2. **Orders queue** (`/admin/[storeSlug]/orders`) — server component
   fetches `orders` filtered by `store_id` (RLS-enforced regardless),
   status, and pickup-date range; paginated.
3. **Order detail** (`/admin/[storeSlug]/orders/[orderId]`) — joins
   `reference_images`, `ai_previews`, `order_status_history`,
   `order_notes`, shown as **two visually distinct sections**: the
   customer's approved **AI-generated design** (the design intent to
   build toward) and the customer's **reference photos** (production
   aids — color/texture/inspiration only), so staff never confuse "what
   the customer approved" with "extra context they attached." Images
   rendered via Cloudflare-fronted CDN URLs, not signed URLs recomputed
   per view, where the bucket allows it; private buckets use
   short-lived signed URLs generated server-side per request.
4. **Status update** — Server Action validates the actor's role
   (`owner` or `staff`), validates the transition is a legal forward
   move in `order_status` (simple linear guard in MVP — no arbitrary
   jumps like `completed → submitted`), writes the new `orders.status`
   and an `order_status_history` row in one transaction, enqueues a
   customer notification via the outbox.
5. **Pickup calendar view** — aggregate query on `orders (store_id,
   pickup_date)` grouped by date, for capacity visibility.
6. **Store settings / staff management** (`owner`-only) — mutates
   `store_settings`, `store_members` (invite flow uses Supabase Auth's
   built-in "invite user" rather than a custom invite UI — see
   [`04_MVP_Reduction.md`](./04_MVP_Reduction.md)).

> `order_status_history` and `order_notes` are the full/future shape of
> this flow. MVP simplifies both away (current status only, a single
> `internal_note` column) — see
> [`04_MVP_Reduction.md`](./04_MVP_Reduction.md) for the trimmed version
> actually built first.

### 5.1 Platform-Level Store Provisioning (Not a Coded Route in MVP)

The `stores` table itself has to be populated somehow — for MVP and
through Phase 2, the founder does this directly via **Supabase Studio's**
Table Editor/SQL Editor (create a `stores` row, create the owner's
`auth.users` account, insert the matching `store_members` row). This is
the one place Supabase Studio genuinely is the operator interface — but
the "operator" here is the founder acting as the platform, never a shop
owner, and the action (provisioning a new tenant) is infrequent enough
that no UI is justified yet.

A real `/platform` console (`platform_admins`, `platform_role`,
self-serve store signup, cross-tenant support/impersonation with
`audit_log`) is Phase 3 scope, built only once manually provisioning
stores is frequent enough to be the bottleneck — see
[`04_MVP_Reduction.md`](./04_MVP_Reduction.md).

---

## 6. API Architecture

### 6.1 Style
- **Server Actions** for same-origin form mutations that don't need to
  be called from anywhere else (status update, settings edit, staff
  invite) — simplest, type-safe, no separate client fetch layer.
- **Route Handlers** (`app/api/...`) for: anything called from a
  client-side effect with custom loading/error UI (AI preview
  generation, polling), anything that needs to be a stable contract for
  future consumers (webhooks from Stripe/Toss, future mobile clients),
  and file upload signing.
- No separate standalone backend service in MVP — Next.js Route
  Handlers/Server Actions are the entire API surface, deployed on
  Vercel. This is revisited only if a workload (e.g. AI generation
  queueing) needs to run outside the request/response lifecycle (§9).

### 6.2 URL/Namespace conventions
```
/api/stores/[storeSlug]/ai-preview            (stateless text→image, no DB write)
/api/stores/[storeSlug]/orders                (single endpoint: creates order + persists selected preview + links reference images)
/api/stores/[storeSlug]/orders/[orderId]
/api/stores/[storeSlug]/orders/[orderId]/status
/api/stores/[storeSlug]/pickup-availability
/api/stores/[storeSlug]/settings
/api/stores/[storeSlug]/members
/api/webhooks/openai            (if async callbacks are used later)
/api/webhooks/stripe             (Phase 2)
/api/webhooks/toss               (Phase 2)
/api/platform/stores             (Platform Super Admin only — Phase 3; MVP has no coded route here at all, see §5.1 below)
```
Reference images have **no dedicated API route** — the browser uploads
them directly to Supabase Storage via the client SDK, governed by a
Storage RLS policy (see §7, §10).
Every handler under `/api/stores/[storeSlug]/**` runs the same
`getTenantContext` + role-check pipeline before touching data (shared
middleware/wrapper, not copy-pasted per route).

### 6.3 Versioning & stability
- No `/v1/` prefix in MVP (single first-party client). Add versioning
  only when an external/public API is actually exposed (not currently
  planned) — avoids premature complexity.

### 6.4 Error model
- Consistent JSON error shape `{ error: { code, message } }`, with
  tenant-mismatch and auth failures returning 403/404 indistinguishably
  from "not found" where leaking existence would itself be a tenant
  info leak (e.g. requesting another store's `orderId` returns 404, not
  403, so as not to confirm the ID exists).

---

## 7. File & Folder Structure

Proposed structure for when implementation begins (not created yet):

```
cakelovers/
├─ docs/
│  ├─ 01_PRD.md
│  ├─ 02_DB_Schema.md
│  └─ 03_Architecture.md
├─ src/
│  ├─ app/
│  │  ├─ (marketing)/                    # platform marketing site, locale-agnostic or i18n'd
│  │  │  └─ page.tsx
│  │  ├─ s/[storeSlug]/                  # customer-facing storefront + ordering flow
│  │  │  ├─ page.tsx                     # landing / start order
│  │  │  ├─ order/
│  │  │  │  ├─ page.tsx                  # multi-step order form (client-driven)
│  │  │  │  └─ [orderId]/track/page.tsx  # tracking page (Supabase session-authorized, §3.1)
│  │  │  └─ layout.tsx                   # resolves store from slug, sets locale
│  │  ├─ admin/[storeSlug]/              # authenticated shop owner/staff dashboard (§5) — NOT Supabase Studio
│  │  │  ├─ orders/
│  │  │  │  ├─ page.tsx                  # queue
│  │  │  │  └─ [orderId]/page.tsx        # detail (AI preview + reference photos shown separately)
│  │  │  ├─ calendar/page.tsx
│  │  │  ├─ settings/page.tsx
│  │  │  ├─ members/page.tsx
│  │  │  └─ layout.tsx                   # auth guard + store-switcher
│  │  ├─ platform/                       # platform-operator console (§5.1) — Phase 3, not built in MVP
│  │  │  ├─ stores/page.tsx
│  │  │  └─ layout.tsx                   # platform_admins guard
│  │  └─ api/
│  │     ├─ stores/[storeSlug]/...       # route handlers, mirrors §6.2
│  │     ├─ webhooks/...
│  │     └─ platform/...
│  ├─ components/
│  │  ├─ ui/                             # shadcn/ui primitives
│  │  ├─ order-flow/                     # design request form, preview gallery, slot picker
│  │  └─ admin/                          # order table, status stepper, image viewer (AI preview vs. reference photos)
│  ├─ lib/
│  │  ├─ supabase/
│  │  │  ├─ server.ts                    # server-side client (session-scoped, RLS-respecting)
│  │  │  ├─ service-role.ts              # service-role client, imported only by explicitly reviewed modules
│  │  │  └─ middleware-client.ts
│  │  ├─ tenant/
│  │  │  └─ get-tenant-context.ts        # the single resolution function referenced in §3.3
│  │  ├─ openai/
│  │  │  └─ generate-cake-preview.ts     # prompt construction + call, server-only
│  │  ├─ notifications/
│  │  │  ├─ send-email.ts                # MVP: direct synchronous send, called from order submit
│  │  │  ├─ outbox.ts                    # Phase 2: enqueue helper, once >1 channel/retry semantics are needed
│  │  │  └─ channels/email.ts            # Phase 2 channel interface; line.ts/kakaotalk.ts/whatsapp.ts added later
│  │  ├─ payments/                       # Phase 2: stripe.ts, toss.ts behind a shared interface
│  │  └─ i18n/
│  │     ├─ locales/{ko,ja,en}.json
│  │     └─ config.ts
│  ├─ middleware.ts                       # tenant slug resolution + auth guard entry point
│  └─ types/
│     └─ database.ts                      # generated Supabase types
├─ supabase/
│  └─ migrations/                         # SQL migrations mirroring 02_DB_Schema.md
├─ public/
└─ package.json
```

Rationale for the two top-level authenticated areas (`admin` — the shop
owner/staff dashboard, always built — vs. `platform` — the operator
console, **not built in MVP**, see §5.1) being physically separate from
the public `s/[storeSlug]` tree: it makes it structurally obvious (and
easy to lint/guard at the layout level) which routes require which auth
level, rather than threading a single dynamic tree with mixed
public/private segments. In MVP the `platform/` folder simply doesn't
exist yet — provisioning happens in Supabase Studio (§5.1) — so this
isn't extra code carried for no reason, just a placement decision for
when Phase 3 needs it.

---

## 8. Notification Abstraction (Future: LINE / KakaoTalk / WhatsApp)

**MVP note:** MVP sends email **directly and synchronously** from the
order-submit and status-update code paths (a plain `await sendEmail(...)`
call) — no outbox table, no background sender. See
[`04_MVP_Reduction.md`](./04_MVP_Reduction.md) for why. The design below
is the **Phase 2 target**, adopted once a second channel (LINE,
KakaoTalk, WhatsApp) or retry/audit semantics are actually needed:

- Notifications are written to `notifications_outbox` (DB doc §5) rather
  than sent inline from request handlers. A single
  `enqueueNotification()` call from order submit/status-change code
  paths becomes channel-agnostic.
- A background sender (Vercel Cron hitting a route handler, or a
  Supabase Edge Function on a schedule) drains `pending` outbox rows and
  dispatches via a `channels/{email,line,kakaotalk,whatsapp}.ts` module
  behind a shared `NotificationChannel` interface (`send(payload):
  Promise<{providerMessageId} | error>`).
- Adding LINE/KakaoTalk/WhatsApp then means: implement one new channel
  module + store a per-customer channel preference — **no change to the
  order/status code that enqueues notifications.**
- Store-level channel enablement (e.g. "this store has KakaoTalk
  configured") is a `store_settings` concern, not hardcoded.

---

## 9. Cross-Store Customer Identity

A person who orders from Store A and Store B gets two `customers` rows
(DB doc §5), optionally sharing one `auth.users.id` if they created an
account. This is a deliberate MVP tradeoff:

- **Pro-isolation**: Store A can never see that the same person ordered
  from Store B, or infer anything about Store B's business from shared
  customer data — consistent with NFR-8 (no cross-tenant data exposure)
  even for identity, not just orders/images.
- **Cost**: no single "customer profile" across stores; the customer
  re-enters contact info per store (acceptable — this mirrors how
  people already interact with independent local shops).
- Phase 3 could add an **opt-in** cross-store identity link (explicit
  customer action, not automatic), if a real product need emerges.

---

## 10. Scaling Risks & Mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| **OpenAI cost/latency spikes** | AI preview generation is the most expensive, slowest, most abusable operation (a bad actor could hammer generation for free image production). | Per-order and per-store rate limits enforced server-side (not client); async generation with `queued/generating` status instead of blocking the request; usage metering table ready for future plan-tier caps (PRD FR-15). |
| **Noisy-neighbor tenants** | One high-traffic store's order volume/image storage could degrade others sharing the same Postgres instance/connection pool. | Supabase connection pooling (PgBouncer) sized for concurrent tenants; indexes on `store_id` keep per-tenant queries cheap regardless of total table size; watch for a future move to per-large-tenant read replicas if one store dramatically outgrows others. |
| **Image storage growth & egress cost** | 3 reference images + N AI previews per order, across potentially many stores, is a lot of binary data with unbounded growth. | Cloudflare CDN caching in front of Storage to cut egress; lifecycle policy to archive/delete images for orders older than N months (configurable, store-agnostic default); image resizing/compression on upload. |
| **RLS policy complexity growing over time** | As features (multi-location, cross-store identity, admin impersonation) are added, RLS policies risk becoming inconsistent or having gaps. | Centralize policy patterns, cover with automated tests that assert cross-tenant access is denied (a dedicated test suite that logs in as Store A and asserts every Store B resource 404s), review RLS changes as a required part of any schema PR. |
| **Guest session portability** | Guest tracking relies on the browser's Supabase anonymous session (§3.1) — it doesn't follow the customer to a different browser/device, unlike a mailed magic link. | Acceptable for MVP (confirmation email is the fallback record); revisit by offering "upgrade this session to an account" (a native Supabase Anonymous-Auth flow) in Phase 2 if customers ask for cross-device tracking. |
| **Single-region deployment** | Vercel + Supabase in one region means latency for far-away tenants (e.g. Japan store on a US-region DB) and a single-region outage blast radius. | Acceptable for MVP; choose Supabase region based on initial customer geography (likely a Korea/Japan-adjacent region, e.g. `ap-northeast-1`/Seoul-equivalent when available); revisit multi-region only if/when tenant geography actually spreads. |
| **Synchronous request-lifecycle AI calls** | Route Handlers on Vercel have execution time limits; a slow OpenAI response could hit function timeouts. MVP deliberately calls OpenAI synchronously (§4) rather than building a queue, so this is a real, accepted limit, not a hypothetical. | A single text-to-image call comfortably fits inside Vercel's function time limit in practice; if that stops being true at scale, move to a fire-and-poll pattern (enqueue, return fast, client polls or subscribes via Supabase Realtime) — Phase 2, not before it's an observed problem. |
| **AI-generation cost abuse without a submitted order** | Because preview generation writes nothing to the database (§4), a bad actor could still rack up OpenAI cost by hammering the generate endpoint repeatedly without ever submitting an order — storage cost is naturally bounded (only submitted orders get permanent images), but OpenAI API cost is not. | A simple per-session (anonymous `auth.uid()`) generation cap (e.g. N calls/hour) is cheap to implement as a first line of defense; revisit with IP-based or Cloudflare-level rate limiting only if actual abuse is observed. |
| **Locale/timezone correctness for pickup scheduling** | Pickup slot math (store timezone vs. customer's browser timezone vs. server UTC) is a classic multi-region bug source. | All slot computation done server-side in the **store's** IANA timezone (`stores.timezone`), never trusting client-computed local time; store times as `date` + `time` in store-local terms plus the store's timezone, not as raw UTC timestamps, to avoid DST drift bugs. |
| **Role/permission drift as roles grow** | Adding more granular roles later (e.g. "baker" vs "front-of-house") could require touching every authorization check site. | All checks route through `getTenantContext`/role-check helpers (§3.4, §7) rather than being duplicated inline per route, so new roles are added in one place. |
| **Platform admin cross-tenant access abuse potential** | Impersonation/support tooling is inherently a controlled tenant-isolation bypass. | Every platform-admin cross-tenant read/write is a distinct, minimal code path using its own audited helper (not the general query path), and is written to `audit_log` with actor + target store (DB doc §5). |

---

## 11. MVP Scope vs. Future Phases (Architecture View)

This mirrors PRD §7 but from a build-order perspective:

**MVP build order** (see [`04_MVP_Reduction.md`](./04_MVP_Reduction.md)
for the fully trimmed scope this maps to):
1. `stores`, `store_members`, auth (incl. Supabase Anonymous Auth) + RLS
   foundation. `stores` rows provisioned manually via Supabase Studio
   (§5.1) — no onboarding UI.
2. Customer ordering flow, in the corrected order: description → AI
   preview (text-only, ephemeral until selected) → regenerate/select →
   reference image upload (production reference only) → pickup → submit
   — no payments.
3. `/admin/[storeSlug]` dashboard: orders queue, detail (AI preview and
   reference photos shown separately), status updates — a real, custom
   UI, never Supabase Studio.
4. Direct synchronous email notification on submit/status-change (no
   outbox — see §8).
5. i18n scaffolding for ko/ja/en across both customer and admin UI.

**Deferred to Phase 2 (schema/architecture already accommodates):**
- Stripe + Toss via a `lib/payments/` shared interface, new `payments`
  table, webhook route handlers — `orders.price_cents`/`payment_status`
  already exist.
- LINE/KakaoTalk/WhatsApp + the notification outbox pattern (§8).
- Plan-tier billing via `plans`/`store_subscriptions`.
- `store_role` (owner/staff) and in-app staff invites.

**Deferred to Phase 3:**
- The `/platform` operator console (§5.1), `platform_admins`,
  self-serve store onboarding, and `audit_log` — until manually
  provisioning stores via Supabase Studio is actually the bottleneck.
- Multi-location stores, cross-store customer identity linking, public
  store discovery, custom domains — each noted inline above as a
  deliberate non-goal for the current schema/routing design so MVP
  isn't blocked re-litigating them now.

---

## 12. Summary of Key Decisions for Review

1. Tenant isolation via **`store_id` on every tenant table + RLS +
   path-namespaced storage + API-level validation** (all four layers,
   as reconfirmed in the architecture review), with routing-layer
   tenant resolution treated as a hint, never an authorization source.
2. **Guest-first** customer flow via **Supabase Anonymous Auth** —
   guests get a real, RLS-covered session, not a custom signed token.
3. Corrected ordering flow: **AI preview is generated from the text
   description alone, before reference images exist**; reference
   images are uploaded afterward purely as production reference for
   the shop owner, never a design input or a selectable option.
4. A dedicated, custom-built **`/admin/[storeSlug]`** dashboard is the
   shop owner/staff interface — Supabase Studio is used only by the
   founder, internally, to provision `stores` rows (§5.1), never as a
   shop-owner-facing tool.
5. **No separate backend service** — Next.js Route Handlers/Server
   Actions on Vercel are the entire API surface for MVP.
6. AI generation and notifications are **synchronous/direct in MVP**
   (no queue, no outbox) — both patterns are documented as the Phase 2
   target (§8, §10) to adopt only once actually needed, not built
   ahead of need.
7. Payments and extra notification channels are **schema-ready but
   not built** in MVP, so Phase 2 is additive rather than a migration
   of existing data.

**Awaiting approval before any application code, Next.js app
initialization, or package installation begins.**
