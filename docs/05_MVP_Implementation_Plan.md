# MVP Implementation Plan

Companion to [`01_PRD.md`](./01_PRD.md), [`02_DB_Schema.md`](./02_DB_Schema.md),
[`03_Architecture.md`](./03_Architecture.md),
[`04_MVP_Reduction.md`](./04_MVP_Reduction.md) — all approved. This
document turns that approved architecture into an actual build plan: what
to build, in what order, and where each piece lives. **Still no
application code, no `create-next-app`, no package installs — this is
the plan to execute next, not the execution.**

Constraints driving every decision below: **solo founder, lowest
maintenance, lowest operating cost, fastest MVP.**

---

## 1. Development Phases

Four phases, each one a working, demoable increment — not four
disconnected chunks of work. You should be able to show something real
at the end of each phase.

| Phase | Name | Ends with | Approx. effort |
|---|---|---|---|
| **0** | Foundation | Supabase project configured, schema + RLS live, Next.js app skeleton deployed to Vercel, empty pages behind auth guards | 1–2 days |
| **1** | Customer Ordering Flow | A real customer can go from typing a description to a submitted order, end-to-end, on a phone | 3–5 days |
| **2** | Admin Dashboard | The founder (as a pilot shop owner) can log in, see the order from Phase 1, view its preview/reference images, and change its status | 2–3 days |
| **3** | Polish & Launch Readiness | i18n across both surfaces, mobile QA pass, email confirmation wired, first real pilot store provisioned | 2–4 days |

Total: roughly **2–3 weeks of solo, part-time-friendly work** — small
enough to stay motivating, each phase individually shippable if timeline
pressure hits.

**Explicitly not a phase here:** payments, extra notification channels,
staff roles, platform console — all Phase 2/3 per
[`04_MVP_Reduction.md`](./04_MVP_Reduction.md), out of scope for this
plan.

---

## 2. Build Sequence (What, In Order, And Why That Order)

This is the dependency-ordered sequence underlying the phases above.
Each step only depends on steps above it — no step requires something
from later in the list, which is what keeps this buildable solo without
backtracking.

1. **Supabase project** created, region chosen, env vars captured.
2. **Database schema migration** — the 5 MVP tables + enums (§5 below),
   applied via SQL migration files (not click-ops in Studio, so the
   schema is reproducible and version-controlled).
3. **RLS policies** for all 5 tables, written and tested *before* any
   UI exists (test via the Supabase SQL editor / a small script that
   asserts cross-tenant access fails — cheap insurance, done once).
4. **Storage buckets** (`reference-images`, `ai-previews`,
   `store-branding`) + their RLS policies.
5. **Next.js 15 app skeleton** (App Router, TypeScript, Tailwind,
   shadcn/ui installed) deployed to Vercel — an empty "hello" page is
   enough to prove the pipeline works end-to-end before building
   features on top of it.
6. **Supabase client wiring** (`lib/supabase/server.ts`,
   `middleware-client.ts`) + Supabase Anonymous Auth confirmed working
   (a guest hitting the site gets a session, verifiable in Supabase
   Auth's user list).
7. **First pilot `stores` row** created by hand in Supabase Studio (this
   is the *only* manual step per store for MVP — see
   [`03_Architecture.md` §5.1](./03_Architecture.md#51-platform-level-store-provisioning-not-a-coded-route-in-mvp)),
   plus one `store_members` row linking your own owner account to it.
8. **Customer ordering flow** (Phase 1) — build in the same order a
   customer experiences it: description input → AI preview call →
   regenerate/select → reference upload → pickup picker → submit.
   Building in this order means you can manually test each step against
   real Supabase/OpenAI calls before the next step exists.
9. **Admin dashboard** (Phase 2) — orders queue, then order detail
   (which only becomes meaningful once step 8 has produced real order
   rows to look at), then status update.
10. **i18n pass** — once both flows exist and their copy is finalized,
    extract strings to the ko/ja/en dictionaries (doing this last avoids
    re-translating copy that's still changing).
11. **Email confirmation** wired into the submit handler.
12. **Mobile QA + launch checklist**, then invite your first real pilot
    shop.

---

## 3. Folder Structure

This is the concrete version of the structure sketched in
[`03_Architecture.md` §7](./03_Architecture.md#7-file--folder-structure),
trimmed to exactly what MVP builds (no `platform/`, no `payments/`, no
`outbox.ts` — those stay as comments marking where Phase 2 additions
will go, not as empty files created now):

```
cakelovers/
├─ docs/
│  ├─ 01_PRD.md
│  ├─ 02_DB_Schema.md
│  ├─ 03_Architecture.md
│  ├─ 04_MVP_Reduction.md
│  └─ 05_MVP_Implementation_Plan.md
├─ src/
│  ├─ app/
│  │  ├─ s/[storeSlug]/
│  │  │  ├─ page.tsx                        # store landing / "start your order"
│  │  │  ├─ order/
│  │  │  │  ├─ page.tsx                     # the multi-step order wizard (client component)
│  │  │  │  └─ [orderId]/track/page.tsx     # post-submit tracking page
│  │  │  └─ layout.tsx                      # resolves store by slug, sets locale, ensures anon session
│  │  ├─ admin/[storeSlug]/
│  │  │  ├─ orders/
│  │  │  │  ├─ page.tsx                     # order queue
│  │  │  │  └─ [orderId]/page.tsx           # order detail + status update
│  │  │  └─ layout.tsx                      # auth guard (store_members check)
│  │  ├─ login/page.tsx                     # shop owner login (Supabase Auth UI or a minimal custom form)
│  │  ├─ api/
│  │  │  └─ stores/[storeSlug]/
│  │  │     ├─ ai-preview/route.ts          # POST — stateless text→image
│  │  │     └─ orders/route.ts              # POST — the one order-submit endpoint
│  │  ├─ layout.tsx                          # root layout
│  │  └─ globals.css
│  ├─ components/
│  │  ├─ ui/                                 # shadcn/ui primitives (button, input, select, dialog, etc.)
│  │  ├─ order-flow/
│  │  │  ├─ DescriptionStep.tsx
│  │  │  ├─ PreviewStep.tsx                  # generate/regenerate/select
│  │  │  ├─ ReferenceUploadStep.tsx
│  │  │  ├─ PickupStep.tsx
│  │  │  ├─ ContactStep.tsx
│  │  │  └─ OrderWizard.tsx                  # holds all step state, renders the active step
│  │  └─ admin/
│  │     ├─ OrderTable.tsx
│  │     ├─ OrderStatusSelect.tsx
│  │     └─ OrderImages.tsx                  # renders AI preview + reference photos as separate sections
│  ├─ lib/
│  │  ├─ supabase/
│  │  │  ├─ server.ts                        # server-side client (session-scoped)
│  │  │  ├─ client.ts                        # browser client (for direct Storage uploads, anon sign-in)
│  │  │  └─ middleware-client.ts
│  │  ├─ openai/
│  │  │  └─ generate-cake-preview.ts         # prompt construction + call, server-only
│  │  ├─ email/
│  │  │  └─ send-order-confirmation.ts       # direct call to an email provider, no outbox
│  │  └─ i18n/
│  │     ├─ locales/
│  │     │  ├─ en.json
│  │     │  ├─ ko.json
│  │     │  └─ ja.json
│  │     ├─ config.ts
│  │     └─ useTranslation.ts                # small dictionary-lookup hook, no library
│  ├─ middleware.ts                           # store-slug resolution (routing hint only) + auth guard
│  └─ types/
│     └─ database.ts                          # generated via `supabase gen types typescript`
├─ supabase/
│  └─ migrations/
│     ├─ 0001_init_schema.sql
│     ├─ 0002_rls_policies.sql
│     └─ 0003_storage_buckets.sql
├─ .env.local                                  # not committed
├─ public/
└─ package.json
```

Notably absent, on purpose: `lib/tenant/get-tenant-context.ts` as a
large abstraction. With only one role (member) and no staff/owner
split in MVP, "which store, is this user a member" is a 5-line query
inlined in each route/layout that needs it — introduce the shared
helper the moment it's copy-pasted a third time, not before.

---

## 4. Route Structure

| Route | Type | Auth | Purpose |
|---|---|---|---|
| `/s/[storeSlug]` | Page (RSC) | Public | Store landing page |
| `/s/[storeSlug]/order` | Page (client) | Public (anon session auto-created) | The order wizard |
| `/s/[storeSlug]/orders/[orderId]/track` | Page (RSC) | Customer session (own order only, via RLS) | Post-submit status view |
| `/admin/[storeSlug]/orders` | Page (RSC) | Shop owner session (`store_members`) | Order queue |
| `/admin/[storeSlug]/orders/[orderId]` | Page (RSC + client island for status select) | Shop owner session | Order detail + status update |
| `/login` | Page | Public | Shop owner login (Supabase Auth) |
| `POST /api/stores/[storeSlug]/ai-preview` | Route Handler | Public (rate-limited by session) | Text → image, no DB write |
| `POST /api/stores/[storeSlug]/orders` | Route Handler | Customer session | Creates the order (single transaction) |
| *(status update)* | Server Action, called from the order detail page | Shop owner session | Updates `orders.status` |

No `/api/stores/[storeSlug]/orders/[orderId]/status` route is needed —
a Server Action co-located with the admin order-detail page handles it
directly, per [`03_Architecture.md` §6.1](./03_Architecture.md#61-style)
(Server Actions for same-origin mutations with no other caller).

No dedicated reference-image upload route — the browser uploads
directly to Supabase Storage via the client SDK (§6, §8 below).

---

## 5. Supabase Setup Plan

Concrete, ordered setup checklist:

1. **Create project** in the Supabase dashboard. Choose a region close
   to your first pilot shops' customers (e.g. a Korea/Japan-adjacent
   region) — this is a one-time, hard-to-change-later decision, so
   make it deliberately rather than defaulting to "US East."
2. **Capture env vars**: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (the
   last one server-only, never in a `NEXT_PUBLIC_*` var, never sent to
   the client).
3. **Enable Anonymous Sign-ins** in Auth settings (off by default) —
   this is the one non-obvious toggle the whole guest-checkout flow
   depends on.
4. **Write migrations** (`supabase/migrations/*.sql`), applied via the
   Supabase CLI (`supabase db push` or `supabase migration up`) rather
   than hand-editing in Studio, so the schema is reproducible if you
   ever need a second environment (staging) or a fresh project:
   - `0001_init_schema.sql`: the 5 tables + enums from
     [`04_MVP_Reduction.md` §5](./04_MVP_Reduction.md#5-revised-mvp-schema-delta-from-02_db_schemamd) —
     `stores`, `store_members`, `customers`, `orders`,
     `reference_images`.
   - `0002_rls_policies.sql`: `enable row level security` + policies
     for each table, per [`02_DB_Schema.md` §7](./02_DB_Schema.md#7-row-level-security-rls-strategy)
     (simplified: no `store_role` branching, just "is a member of this
     store" / "is this customer's own row").
   - `0003_storage_buckets.sql` (or dashboard-created + policy SQL):
     `reference-images` and `ai-previews` buckets, both private, with
     path-prefix RLS policies (`{store_id}/{order_id}/...`).
5. **Generate TypeScript types**: `supabase gen types typescript
   --project-id <id> > src/types/database.ts` — re-run this any time
   the schema changes; never hand-maintain these types.
6. **Manual test the RLS policies** before writing any app code: in the
   SQL editor, `set role authenticated; set request.jwt.claims = ...`
   (or use the Supabase CLI's local dev + two test users) to confirm a
   Store A session cannot read a Store B order. This is the single
   highest-value 30 minutes you'll spend on this project — RLS bugs are
   silent until they're a real data leak.
7. **First pilot store provisioning** (manual, repeated per new shop
   for the life of MVP): insert a `stores` row, create the owner's
   `auth.users` account (Supabase Auth → "invite user" or "create
   user"), insert the matching `store_members` row. Document this as a
   short personal runbook (a checklist in your notes, not a doc in this
   repo) since you'll repeat it by hand for every pilot shop.

**No Supabase Edge Functions, no cron jobs, no Realtime subscriptions**
for MVP — every one of those was a Phase 2 item in
[`04_MVP_Reduction.md`](./04_MVP_Reduction.md) and none is needed to
ship.

---

## 6. Authentication Implementation Plan

Two distinct identities to implement, both riding entirely on Supabase
Auth (`@supabase/ssr` for Next.js):

### 6.1 Customer (guest, Anonymous Auth)
- On first load of `/s/[storeSlug]` (or `/s/[storeSlug]/order`), check
  for an existing Supabase session; if none, call
  `supabase.auth.signInAnonymously()` client-side. This is invisible to
  the customer — no form, no button.
- This session's `auth.uid()` is what every subsequent insert
  (`customers`, `orders`) and RLS check keys off.
- No "log out" affordance for guests in MVP — the session simply lives
  in the browser until it expires or storage is cleared.
- No email/password/OAuth flow needed on the customer side at all for
  MVP (accounts are a Phase 2 upgrade path from an anonymous session,
  per [`03_Architecture.md` §3.1](./03_Architecture.md#31-identity-provider)).

### 6.2 Shop owner
- Simplest possible MVP path: **Supabase Auth's magic-link (OTP) email
  sign-in**, not a password. Zero password-reset flow to build, zero
  password storage/hashing to think about, and it's a single
  `supabase.auth.signInWithOtp({ email })` call plus a "check your
  email" screen.
- `/login` page: an email input, calls `signInWithOtp`, shows a
  confirmation message. The magic link redirects back into the app
  with a session already established.
- `admin/[storeSlug]/layout.tsx` checks: (a) is there a session at all
  (redirect to `/login` if not), (b) does a `store_members` row exist
  for `(store_id, auth.uid())` (show a simple "you don't have access to
  this store" message if not — this alone is the entire authorization
  check needed for MVP, since there's no owner/staff distinction yet).
- **No custom invite UI.** For your first pilot shops (which is you,
  provisioning by hand per §5 step 7), just create the user directly in
  Supabase Auth. When a real second staff member needs access later,
  use Supabase Auth's dashboard "invite user" button — still no code.

---

## 7. Admin Dashboard Implementation Plan

Build order within Phase 2 (after Phase 1 has produced at least one
real order to look at):

1. **`admin/[storeSlug]/layout.tsx`** — the auth guard described in
   §6.2. Build and manually verify this first, in isolation, before any
   dashboard content exists (log in, confirm redirect behavior for
   both "no session" and "session but no membership" cases).
2. **Orders queue** (`orders/page.tsx`) — a server component querying
   `orders` filtered by `store_id` (RLS-enforced regardless), sorted by
   `pickup_date`. A single status filter (dropdown or tabs) is enough
   for MVP — skip search, skip pagination until order volume actually
   requires it (a solo shop's daily order count won't).
3. **Order detail** (`orders/[orderId]/page.tsx`) — server component
   rendering, in this order:
   - Customer contact info + pickup date/time (the "can I even make
     this" info, at the top).
   - The **AI-generated preview** (the approved design), clearly
     labeled.
   - The **reference photos**, in a visually distinct section labeled
     as production reference, not design (per
     [`03_Architecture.md` §5](./03_Architecture.md#5-admin-dashboard-flow-system-view--the-shop-owners-admin)).
   - The free-text description and any internal note.
   - Image URLs: since buckets are private, generate short-lived signed
     URLs server-side on each page load (`createSignedUrl`, a few lines,
     no CDN layer needed yet per
     [`04_MVP_Reduction.md`](./04_MVP_Reduction.md)).
4. **Status update** — a Server Action co-located with the order detail
   page: takes `orderId` + new status, re-checks membership, writes
   `orders.status`. A plain `<select>` calling the action on change is
   enough UI — no optimistic-UI complexity needed for a solo owner
   clicking through a handful of orders a day.
5. **(Optional, cut if short on time):** a tiny store-switcher in the
   header if you're managing more than one pilot store — otherwise skip
   entirely for a single-store founder and hardcode navigation.

No calendar view, no capacity dashboard, no analytics — all correctly
deferred per [`04_MVP_Reduction.md`](./04_MVP_Reduction.md).

---

## 8. Customer Ordering Flow Implementation Plan

Build the wizard as **one client component (`OrderWizard.tsx`) holding
all state**, with each step as a child component that reads/writes that
shared state — no routing between steps (no `/order/step-2` URLs to
manage), no external state library needed for a five-step form.

Build order within Phase 1:

1. **`OrderWizard.tsx` shell** — step index in local state, "Next/Back"
   navigation, a simple progress indicator. Render placeholder content
   per step first, so the wizard skeleton and mobile layout are correct
   before wiring any real logic.
2. **`DescriptionStep.tsx`** — a single controlled textarea. This is
   the easiest step and unblocks step 3.
3. **`PreviewStep.tsx`** — calls `POST /api/stores/[storeSlug]/ai-preview`
   with the description; shows a loading state (a few seconds), then
   the returned image(s); a "regenerate" button re-calls the same
   endpoint; clicking a preview marks it "selected" in wizard state
   (just the image URL/data + the prompt text — nothing persisted yet).
4. **`ReferenceUploadStep.tsx`** — client-side upload directly to the
   `reference-images` Storage bucket via `supabase.storage.from(...)`
   using the anonymous session, into a **temporary path** keyed by a
   client-generated `orderId` (a UUID generated once when the wizard
   mounts and carried through to submit — this is what lets
   step-4 uploads and the eventual `orders` insert share an id without
   a draft database row). Enforce "max 3" client-side (disable the
   input at 3) — server-side re-validation happens at submit.
5. **`PickupStep.tsx`** — a date input + a simple time-of-day select
   (morning/afternoon/evening, or a plain time picker); client-side
   validates against a minimum-lead-time constant read from
   `store_settings`-equivalent (MVP: hardcode a sensible default like
   24 hours if you haven't built store-level configurability yet, and
   note that as a known MVP shortcut).
6. **`ContactStep.tsx`** — name, phone, email inputs; this is also the
   final "Review" step — show a summary of everything selected so far
   before the submit button.
7. **Submit** — `POST /api/stores/[storeSlug]/orders` with: the
   client-generated `orderId`, description, selected preview
   (image data/URL + prompt), the pickup date/time, and contact info.
   The route handler does the actual DB work (§9 below) and returns
   success/failure; on success, redirect to
   `/s/[storeSlug]/orders/[orderId]/track`.
8. **Tracking page** — a simple server component reading the order by
   id (RLS ensures only the owning customer session can see it),
   showing description, images, pickup info, and current status as
   plain text (no live-updating needed for MVP — the customer reloads
   the page to check).

Mobile-first note: build and test every step at a 375px viewport from
the start, not as a pass at the end — retrofitting mobile layout onto
five already-built desktop-first steps is much more expensive than
building them narrow first.

---

## 9. AI Generation Implementation Plan

This is the `POST /api/stores/[storeSlug]/ai-preview` Route Handler,
and it is intentionally the smallest, simplest piece of custom logic in
the whole system:

1. **Input**: `{ description: string }` (plus the resolved `storeSlug`
   from the URL). No image inputs, ever.
2. **Prompt construction**: a single server-side template wrapping the
   customer's text (e.g. "A professional, appetizing photo of a custom
   cake: {description}. Studio lighting, plain background.") — this is
   the entire "prompt engineering" for MVP; iterate on the template
   wording based on real output quality, not upfront.
3. **Rate limit check**: before calling OpenAI, check a simple
   per-session counter. Cheapest possible implementation for MVP: a
   single extra column or a tiny table keyed by `auth.uid()` with a
   count + timestamp, checked and incremented in the same request (a
   few lines of SQL via an RPC or just two queries) — reject with a
   friendly "please wait" message past e.g. 5 generations/hour. This is
   the one piece of custom abuse-prevention logic worth building before
   launch, per the risk noted in
   [`03_Architecture.md` §10](./03_Architecture.md#10-scaling-risks--mitigations).
4. **OpenAI call**: a single text-to-image request (e.g. `gpt-image-1`
   or current equivalent), synchronous, `await`ed directly in the route
   handler — no queue, no job table (per
   [`04_MVP_Reduction.md`](./04_MVP_Reduction.md)).
5. **Response**: return the image (URL or base64) directly to the
   client. **Nothing is written to the database or to Supabase Storage
   at this point** — that only happens if/when the customer selects
   this candidate and submits the order (handled inside the
   `/orders` submit route, not here).
6. **Error handling**: if OpenAI fails or times out, return a clear
   error the UI can show with a "try again" affordance — no retry logic
   needed server-side for MVP.
7. **At order submit** (in the `/orders` route, not this one): take the
   customer's selected preview data, upload it into the permanent
   `{store_id}/{order_id}/preview.png` Storage path, and write its path
   + the prompt text as columns on the new `orders` row (no `ai_previews`
   table — see [`04_MVP_Reduction.md` §5](./04_MVP_Reduction.md#5-revised-mvp-schema-delta-from-02_db_schemamd)).
   If the client held a URL-format OpenAI response, fetch it
   server-side within this same request (OpenAI's returned URLs are
   time-limited, so do this promptly rather than deferring it).

Total new external dependency: the OpenAI SDK (or a plain `fetch` call
— the request shape is simple enough that you may not need the SDK at
all for just this one call, which is one fewer dependency to keep
updated).

---

## 10. Recommended Development Order (Day-by-Day Shape)

A concrete suggested sequence for a solo founder working through this;
adjust pace to your own availability, but keep the *order*, since each
step is designed to unblock the next with minimal rework:

1. Supabase project + migrations + RLS + storage buckets + manual RLS
   test (§5). *Nothing visual yet — resist the urge to skip ahead.*
2. Next.js app skeleton, deployed to Vercel, Supabase client wired,
   Anonymous Auth confirmed working end-to-end (§6.1).
3. `OrderWizard` shell with placeholder steps, mobile layout, deployed
   and viewed on an actual phone (§8.1).
4. Description step → AI preview route → preview step wired together
   and working with real OpenAI calls (§8.2–8.3, §9). *This is the
   product's core magic moment — get it feeling good before moving on.*
5. Reference upload step, wired to real Storage uploads (§8.4).
6. Pickup + contact steps, and the real `/orders` submit route
   persisting everything (§8.5–8.7, §9 step 7).
7. Tracking page (§8.8) — closes the loop on the customer side.
8. Provision your own pilot `stores` row + owner account (§5 step 7).
9. Admin auth guard → orders queue → order detail → status update, in
   that order (§7). *Order detail should immediately show the real
   order from step 6 — a satisfying checkpoint.*
10. i18n extraction pass across both flows (§2 step 10).
11. Email confirmation on submit (§2 step 11).
12. Mobile QA pass on real devices, fix layout issues found.
13. Invite your actual first pilot shop owner; walk them through
    placing/receiving a test order together.

**This plan is ready to execute. No application code, Next.js project,
or package has been created yet — say the word and implementation
begins at step 1.**
