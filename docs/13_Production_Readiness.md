# Production Readiness Review

Companion to every prior doc in this series — this is the pre-deployment
gate: what's actually safe to put in front of real users, what isn't yet,
and the exact steps to get the current build onto Vercel.

**Scope:** deployment readiness only. No new business features were
added — the two changes in this phase (site metadata, a real README,
and a Storage bucket configuration fix) are production hygiene, not
features.

---

## 1. Git & Version Control

- Git repository initialized at the project root, default branch renamed
  `master` → `main`.
- **Initial commit status:** blocked on git identity. This machine has no
  `user.name`/`user.email` configured, and per this session's own
  operating constraints, git config is not something that gets changed
  without you doing it yourself. Run once, with your own info:
  ```bash
  git config --global user.name "Your Name"
  git config --global user.email "you@example.com"
  ```
  Then the initial commit (already staged and drafted) can be created.
- No remote configured yet — nothing has been pushed anywhere. Recommend
  GitHub as the remote, since that's what Vercel's Git integration
  expects for automatic deploy-on-push.

## 2. `.gitignore` Review

Reviewed the existing file (present since the Next.js scaffold phase) —
no changes needed. It correctly excludes:
- `node_modules`, `.next`, `/out`, `/build`
- `.env*` **except** `.env.example` (the negation pattern was verified
  working, not just present — confirmed `.env.local` does not appear in
  `git status` or `git add -A` output)
- `.vercel` (the folder Vercel's CLI creates locally when linked)
- `*.tsbuildinfo`, `next-env.d.ts` (generated, regenerate on install)

## 3. Secrets Audit

Checked three ways before staging anything:
1. **Pattern scan** across `src/`, `docs/`, and config files for OpenAI
   key prefixes, Supabase secret-key prefixes, and JWT-shaped strings —
   zero matches outside `.env.local` itself.
2. **Staged-file review** (`git add -A` then `git status --short`) —
   confirmed `.env.local` is absent from the staged list; confirmed
   `.env.example` (staged) contains only empty key names, no values.
3. **Service-role/OpenAI key usage audit** — grepped every reference to
   `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` in `src/`: both are
   used only inside Server Components, Route Handlers, and one
   server-only lib module (`lib/supabase/service-role.ts`) — never in a
   `"use client"` file, so neither can end up in a browser bundle.
4. **Leftover debug code check** — a temporary in-page debug hook was
   used during earlier verification phases to sign in test accounts
   directly from the browser console (see Phase 4/5 verification
   sessions). Confirmed zero remaining references (`TEMP-DEBUG`,
   `__debugSupabase`) anywhere in `src/`.

**Result: clean.** No secret has ever been written to a tracked file.

## 4. Initial Commit

Drafted and ready, pending only the git identity step in §1:
```
Initial commit: Cake Lovers MVP

Multi-tenant cake shop ordering platform. Customer wizard (description,
AI preview generation/selection, reference photos, pickup, submit),
public order tracking, and a staff admin dashboard (order queue, detail,
status workflow), built on Next.js 15 + Supabase (Postgres, Auth,
Storage) + OpenAI image generation.
```
All application source, `docs/`, config files, and `.env.example` are
staged; `.env.local` and build artifacts are not.

## 5. Environment Variables

| Variable | Used by | Vercel scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server Supabase clients | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server Supabase clients | Production, Preview, Development |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only (Storage uploads/signing, admin dashboard queries, public tracking page) | Production, Preview, Development — **never** exposed to a `NEXT_PUBLIC_*` name |
| `OPENAI_API_KEY` | Server-only (`/api/stores/[storeSlug]/ai-preview`) | Production, Preview, Development |

Reviewed and corrected this phase: `NEXT_PUBLIC_SUPABASE_URL` had
previously been set with a `/rest/v1/` suffix copied from the wrong
dashboard field, caught during Phase 3's live testing. The value in the
current `.env.local` is the corrected bare project URL — copy that
exact value into Vercel, not whatever was originally in the setup docs.

No other environment variables exist. There is no build-time-only
variable and no per-environment behavioral branching (staging vs.
production both talk to the same single Supabase project — see
[`04_MVP_Reduction.md`](./04_MVP_Reduction.md) for why one project for
both is the deliberate MVP choice).

## 6. Production Security Review

- **Auth:** guests via Supabase Anonymous Auth (no password anywhere in
  the customer flow); staff via passwordless magic link. No password
  storage/hashing exists anywhere in this codebase — Supabase Auth
  handles both entirely.
- **Session handling:** `@supabase/ssr` cookie-based sessions, refreshed
  by `middleware.ts` on every request — standard, unmodified pattern.
- **Authorization:** every admin route re-derives store membership from
  the session server-side (`getStoreMembership`) before rendering
  anything; the public tracking page is intentionally unauthenticated
  by design (orderId-as-credential, see
  [`03_Architecture.md`](./03_Architecture.md)) and selects only
  customer-safe columns — `internal_note` is never queried there.
- **Service-role key usage:** confirmed scoped to exactly what was
  documented as an explicitly-reviewed exception (Storage
  upload/signing, where no bucket-level RLS exists yet) — never used as
  a general query bypass. This is the single most important thing to
  re-audit if this codebase changes hands or grows: every new
  `createServiceRoleClient()` call site should be justified the same
  way the existing ones are.
- **Input validation:** every write path (`ai-preview`, `orders`
  submission, admin status/note updates) validates on the server, not
  just the client — verified by direct `curl`/`fetch` testing against
  the routes in earlier phases, bypassing the UI entirely.
- **No secrets in error responses:** confirmed both the AI-preview route
  and the order-submission route return generic messages on failure
  while logging the real error server-side only (verified live in
  Phase 5 — a genuine Postgres error never reached the client).

## 7. RLS Review

All 5 tables have RLS **enabled**, with policies exactly as deployed in
[`09_Supabase_Execution_Checklist.md` §7](./09_Supabase_Execution_Checklist.md#7-implementing-rls-policies):

| Table | Policy shape |
|---|---|
| `stores` | Public select of active stores; members additionally see their own store regardless of `is_active` |
| `store_members` | Select own membership rows only; no insert/update/delete via the API — provisioning is service-role/manual by design |
| `customers` | Insert own row (`auth_user_id = auth.uid()`); select own row or, for staff, their store's rows; **no update policy** (a known, deliberate MVP limitation — a returning customer's stale contact info won't refresh) |
| `orders` | Insert scoped to the customer's own verified `(customer_id, store_id)` pair; select own or store's; **update is staff-only** |
| `reference_images` | Insert scoped through the owning order/customer chain; select own or store's |

This has been the **most exercised part of the whole system** —
verified empirically, not just by reading the SQL, across every prior
phase: cross-tenant isolation tests (two stores, confirmed zero leakage
either direction), guest-vs-staff access boundaries, and the
duplicate-submission/rollback tests in Phase 3 all depend on these
policies working correctly, and all passed.

**No changes made or needed this phase.**

## 8. Storage Permissions Review

**Finding, and fixed this phase:** both buckets were correctly private
(`public: false`) but had **no `file_size_limit` or
`allowed_mime_types` configured at the bucket level** — despite being
documented as 5MB / image-only since
[`09_Supabase_Execution_Checklist.md` §4](./09_Supabase_Execution_Checklist.md#4-creating-storage-buckets),
that configuration was never actually applied to the live buckets. The
application code's own validation (`lib/storage/reference-image.ts`)
was the *only* thing enforcing it — a second, independent layer that
should exist regardless of application code correctness was silently
missing.

**Fixed via the Storage Management API** (not a schema change — a
`PUT /storage/v1/bucket/{id}` call, well within the service-role key's
normal capability):
- `reference-images`: 5MB limit, `image/jpeg|png|webp|heic`
- `ai-previews`: 5MB limit, `image/png`

Verified via a follow-up `GET /storage/v1/bucket` call showing both
limits applied.

**Still true, and correct by design:** no bucket-level *RLS* policies
exist on `storage.objects` — all reads/writes go through the
service-role client inside already-authorized server code (Route
Handlers, Server Components gated by `getStoreMembership`), per the
explicitly-reviewed pattern established in Phase 3. This is not a gap;
it's the documented alternative to standing up bucket RLS policies,
and it's been re-justified, not just carried forward, in every phase
that added a new signed-URL or upload code path.

## 9. OpenAI Usage Limits Review

This is the **highest-priority finding in this entire review.**

The AI-preview rate limiter
([`lib/ai/rate-limit.ts`](../src/lib/ai/rate-limit.ts)) is an
**in-memory `Map`**, explicitly documented in its own code comments as
a temporary MVP measure. In local development, where one Node process
lives for the whole session, this genuinely enforces "10 generations
per hour per client." **On Vercel, this guarantee is much weaker than
it looks:**

- Vercel reuses warm serverless instances for a period, so the limit
  holds *within* a single warm instance, but resets completely on cold
  start, on redeploy, and — critically — **is not shared across
  concurrent instances**. Under real concurrent traffic, Vercel can
  and will spin up multiple instances of the same function, each with
  its own independent counter. A client hitting the endpoint
  aggressively enough to trigger horizontal scaling could realistically
  get several times the intended quota before any single instance's
  counter reflects it.
- This directly controls real spending: every successful request past
  the intended limit is a billed OpenAI image generation call.

**Not fixed this phase** — a durable, cross-instance rate limiter
(a database-backed counter, or a service like Upstash Redis) is
meaningfully sized infrastructure work, not a deployment-readiness
tweak, and this phase's instructions were explicit about not adding new
features. Flagging it here as the clearest concrete argument for why
this MVP should launch to a small, known pilot audience first, not an
open public link — the in-memory limiter is a real backstop against
*accidental* abuse (a confused customer mashing "regenerate"), not
against anyone who actually wants to run the bill up.

**Recommended before any wider-than-pilot launch:** replace the Map
with a row in a small Postgres table (already have the database; no
new infra needed) or a managed rate-limit service, keyed the same way
(`getClientKey`) but persisted.

**Also worth doing, cheaply, regardless:** set a hard monthly spending
cap on the OpenAI account itself, in the OpenAI platform dashboard
(Settings → Limits). This can't be checked or set via the API key this
project uses — it's an account-level dashboard setting — but it's the
one true backstop no application-level bug can bypass, and costs
nothing to set up now.

## 10. Other Findings From This Review (Fixed)

- **Site metadata** (`src/app/layout.tsx`) was still the unmodified
  `create-next-app` default (`title: "Create Next App"`) — every page
  in the entire app showed this in the browser tab across every prior
  phase's testing. Fixed to reflect the actual product.
- **README** was still the default scaffold README (generic Next.js
  getting-started boilerplate, no mention of what this project actually
  is). Replaced with a real one describing the product, pointing to
  `docs/`, and listing the key routes.

## 11. Known Gaps (Not Blockers, Not Fixed This Phase)

- **Root route (`/`)** is still the default Next.js template landing
  page — a visitor to the bare domain sees Next.js boilerplate, not
  anything about Cake Lovers. Every real product route
  (`/s/[slug]/order`, `/admin/[slug]/orders`, `/orders/[id]`) works
  correctly; there's just nothing at the root yet. Low priority since
  real traffic arrives via a specific store's link, not the bare
  domain — but worth a redirect or minimal page before any public
  announcement.
- **No order-confirmation email** and no status-change notification —
  already tracked as a Phase 2 item since the original architecture
  docs.
- **Store provisioning is fully manual** (direct database
  inserts/API calls) — fine for one pilot store, not for onboarding a
  second or third without hand-holding.
- **No error monitoring/alerting** (Sentry or equivalent) — right now,
  a production error is only visible if someone manually checks Vercel's
  function logs.
- **Single region, single Supabase project** for both would-be staging
  and production use — an accepted, documented MVP tradeoff, not new
  information.

---

## 12. Vercel Deployment Instructions

1. **Push to a Git remote** (GitHub recommended):
   ```bash
   git remote add origin <your-repo-url>
   git push -u origin main
   ```
2. **Import the project** at [vercel.com/new](https://vercel.com/new),
   selecting the pushed repository. Vercel auto-detects Next.js — no
   build command changes needed (`next build` / `next start` are the
   defaults this project uses as-is).
3. **Add environment variables** before the first deploy (Project
   Settings → Environment Variables), for **all three** environments
   (Production, Preview, Development) — using the corrected values from
   §5, not the historical `/rest/v1/`-suffixed one:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
4. **Deploy.** First deploy will run `next build` — this was already
   verified to succeed locally in this phase (`npm run build`, clean,
   all 10 routes compiled: 3 static, 7 dynamic as expected for the
   auth/cookie-dependent ones).
5. **Update Supabase Auth settings** for the real deployed domain
   (currently still pointing at `localhost:3000` from the original
   setup):
   - **Site URL** → `https://<your-vercel-domain>`
   - **Redirect URLs** → add `https://<your-vercel-domain>/**` (keep
     the `localhost:3000/**` entry too, for continued local development)
6. **Smoke-test against the deployed URL** (not just locally) — repeat
   the four flows in §13 below against the real Vercel deployment
   before telling anyone about it.
7. **Set the OpenAI spending cap** (§9) — do this before, not after,
   sharing the link with anyone outside this session.

---

## 13. Pre-Deployment Verification (This Phase)

Run against the **production build** (`npm run build && npm run start`),
not dev mode, since that's what Vercel actually runs. `npm run build`
succeeded cleanly (all 10 routes compiled — 3 static, 7 dynamic, exactly
as expected for the auth/cookie-dependent ones).

| Flow | Result |
|---|---|
| Customer ordering flow | ✅ Full 7-step wizard against the live production server: description → real OpenAI generation → select → skip references → pickup → contact + note → submit. Anonymous session cookie confirmed established correctly under `next start`. |
| Order submission | ✅ Order + customer rows, preview upload, and `customer_note` all verified directly against the database after submission — exact match with what was entered in the UI. |
| Admin dashboard | ✅ Order list showed the real order; detail page correctly displayed the AI preview, description, and customer note; a live status transition (`new` → `in_progress`) was performed through the UI and confirmed persisted in the database. Auth guard separately confirmed: a session without store membership is correctly redirected to `/login` under the production build. |
| Tracking page | ✅ The wizard's own "View your order status" link was followed through to `/orders/[orderId]`, which correctly rendered status, design, description, customer note, pickup info, and contact details with no session at all. |

All four flows were tested with real data against the real Supabase
project, through the actual `next start` production server — not dev
mode, and not mocked. All test data created for this verification pass
was deleted afterward (orders, customers, storage objects, and the
temporary staff account used to test the admin flow).

**Method note:** verifying the admin flow's authenticated path in a
production build (no hot-reload) required a temporary, one-line debug
hook in `src/app/login/page.tsx` to sign in a test account directly
from the browser console — the same technique used in Phases 4 and 5.
It was added, used, and removed within this same phase; confirmed
absent from the final build via both a source grep and the final clean
`npm run build` shown above.
