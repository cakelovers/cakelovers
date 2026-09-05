# Supabase Setup Guide

Companion to [`07_schema.sql`](./07_schema.sql) (reviewed, approved,
unchanged by this document) and
[`05_MVP_Implementation_Plan.md` §5](./05_MVP_Implementation_Plan.md#5-supabase-setup-plan).
This is the concrete, step-by-step Supabase configuration to execute
before any application code is written — **Supabase implementation
phase only.**

**Assumptions:** solo founder, MVP/pre-launch stage, optimizing for
lowest cost, deploying the eventual app to Vercel.

---

## 0. Schema Re-Confirmation (from reviewing `07_schema.sql`)

Before configuring anything, this is what the schema needs from
Supabase specifically, since it drives several settings below:

- Uses `auth.users` (foreign keys from `store_members.user_id` and
  `customers.auth_user_id`) → **Supabase Auth must be configured before
  the schema can be meaningfully used** (the tables will apply fine
  without it, but every insert will fail without a real `auth.users`
  row to reference).
- `customers.auth_user_id` is `NOT NULL` and expected to be satisfied by
  **anonymous sessions** for guests → **Anonymous Auth must be enabled**
  (§4).
- Every tenant table has RLS **enabled with zero policies** → the
  database is fully locked down the moment this file is applied; §6/§7
  below cover writing and applying the policies that actually make it
  usable.
- Two Storage buckets are referenced by path convention
  (`reference_images.storage_path`, `orders.ai_preview_storage_path`)
  but are not created by SQL in `07_schema.sql` — that's Storage
  configuration, covered in §5.

Nothing about the schema requires changes to this setup — it's ready to
apply as-is.

---

## 1. Exact Supabase Project Settings

1. Go to [supabase.com](https://supabase.com), sign in with the
   founder's own account (no team/org sharing needed yet — solo
   founder, one collaborator).
2. **New project**:
   - **Organization**: your personal/default org.
   - **Name**: `cakelovers-prod` (see §9 for why this guide recommends
     a single project rather than separate dev/prod projects at MVP
     stage — if you follow that recommendation, this is just
     `cakelovers`).
   - **Database password**: generate a strong random password via the
     dialog's generator button; **save it in a password manager
     immediately** — it's shown once and is separate from any API key.
   - **Region**: pick based on where your first pilot shop(s) actually
     are. For a Korea/Japan-focused launch, **Northeast Asia (Seoul)**
     or **Northeast Asia (Tokyo)** are the right choices — whichever is
     closer to your first real pilot store. This is a one-time,
     effectively-permanent decision (moving projects later means a
     full data migration), so don't default to a US region out of
     habit.
   - **Pricing plan**: start on **Free**. It costs $0/month and is
     sufficient for building and for early pilot testing (500MB
     database, 1GB file storage, 50,000 monthly active users). See §10
     for exactly when to upgrade to Pro ($25/month) — not yet.
3. Wait for provisioning (~2 minutes), then open the project dashboard.
4. **Note the free-tier auto-pause behavior now, so it doesn't surprise
   you later**: a Free project pauses itself after 7 days with no API
   activity. During active development this never triggers (you're
   hitting it constantly); it can trigger during a quiet period before
   you have real pilot traffic. Unpausing is a one-click action in the
   dashboard — not data loss, just a few minutes of downtime. Not worth
   paying to prevent until you have a real pilot shop depending on
   uptime (§10).

---

## 2. Required Supabase Configuration

In **Project Settings**:

- **General → Project name**: confirm it matches what you named it.
- **Database → Connection pooling**: leave **enabled**, mode
  **Transaction** (the default). This matters specifically because
  Vercel's serverless/Edge functions open many short-lived connections
  — direct (non-pooled) connections will exhaust Postgres's connection
  limit quickly under real traffic. Use the **pooled connection string**
  (port 6543) for anything the deployed app connects with; the direct
  connection string (port 5432) is only for one-off admin work (e.g.,
  a local `psql` session), if ever.
- **API → Project API keys**: note the `anon` `public` key and the
  `service_role` `secret` key here — you'll copy both into environment
  variables in §8. **Never use the service_role key anywhere except
  server-only code paths.**
- **API → Exposed schemas**: leave as default (`public` only). Do
  **not** expose the `auth` schema via the Data API — the app never
  needs to query it directly (Supabase Auth's client SDK handles
  `auth.users` access internally).
- **Data API → Max rows**: leave the default (1000) — no MVP query
  approaches this.

Nothing else in General/Database settings needs to change from
defaults for MVP.

---

## 3. Authentication Setup

In **Authentication → Settings** (previously called "URL
Configuration" + "Auth Providers" — exact tab names shift slightly
between Supabase dashboard versions, but the settings below exist under
Authentication regardless of exact tab layout):

1. **Site URL**: set to your eventual production URL (e.g.
   `https://cakelovers.app`). This is used to build links in auth
   emails (magic links). You can update this once you have a real
   domain; until then, set it to your Vercel-assigned URL
   (`https://your-project.vercel.app`) so magic links work in early
   testing.
2. **Redirect URLs**: add both your production URL and
   `http://localhost:3000/**` (wildcard) so magic-link callbacks work
   in local development too. Add your Vercel preview-deployment domain
   pattern (`https://*.vercel.app/**`) once you're testing on preview
   deployments, or add each preview URL manually as needed — a minor
   MVP friction point, not worth automating yet.
3. **Email provider**: leave Supabase's **built-in email sending**
   enabled for MVP. It is rate-limited (a small number of emails per
   hour, intended for low-volume testing — check the current limit in
   your dashboard, it's stated on the Auth settings page) — **this is
   fine for magic-link owner logins at pilot scale** (you and a
   handful of shop owners logging in occasionally) but is **not**
   meant to carry customer order-confirmation email volume once you
   have paying pilot shops. When that day comes, switch to a real
   provider (Resend has a free tier of 3,000 emails/month, no credit
   card required — a natural, low-cost next step) — this is a config
   change, not a schema or architecture change, so it's fine to defer.
4. **Email auth provider settings**: with "Email" provider enabled,
   turn **off** "Confirm email" for this MVP's owner accounts if you
   want frictionless magic-link login (a magic link itself already
   proves email ownership — a separate confirmation step is redundant
   for the OTP/magic-link flow specifically, though it matters more
   for password-based signup, which MVP doesn't use at all per
   [`05_MVP_Implementation_Plan.md` §6.2](./05_MVP_Implementation_Plan.md#62-shop-owner)).
5. **Disable password-based sign-up** if the toggle is available
   separately, or simply never build a password sign-up form — MVP's
   owner auth is magic-link only (§6.2 of the implementation plan), so
   there's nothing that needs a password provider active.
6. **JWT expiry / refresh token settings**: leave at Supabase defaults
   (1 hour access token, refresh token rotation on) — no MVP reason to
   change these.

---

## 4. Anonymous Auth Setup

This is the one setting the entire guest-checkout flow depends on, per
[`03_Architecture.md` §3.1](./03_Architecture.md#31-identity-provider):

1. **Authentication → Sign In / Providers → Anonymous Sign-Ins**: toggle
   **Enable anonymous sign-ins** to ON. It is **off by default** — this
   is the single most important non-obvious toggle in this entire
   guide, since without it the entire customer ordering flow (which
   depends on `customers.auth_user_id` always being populated) cannot
   function for guests.
2. **Abuse protection — enable a CAPTCHA provider.** Because anonymous
   sign-in is a public, unauthenticated endpoint, it's a natural target
   for automated abuse (mass account creation, which costs you nothing
   directly but is the first step toward abusing the AI-generation rate
   limit per-session, per
   [`05_MVP_Implementation_Plan.md` §9](./05_MVP_Implementation_Plan.md#9-ai-generation-implementation-plan)).
   - Recommended: **Cloudflare Turnstile** — free, and you're already
     using Cloudflare elsewhere in the stack, so no new vendor
     relationship. Create a Turnstile site key/secret in the Cloudflare
     dashboard, then paste them into **Authentication → Settings →
     Bot and Abuse Protection → Turnstile** in Supabase.
   - This does mean the sign-up form (invisible as it is to the
     customer) needs to run a Turnstile challenge — a small,
     well-documented client-side integration when you get to building
     the order wizard. Flagging the *setting* here now; the actual
     integration is application code, out of scope for this document.
   - If you want to ship faster and add this slightly later: it's safe
     to launch without it for a first pilot (low, known traffic you can
     watch manually) and add it before any public/unsupervised
     traffic. Don't skip it indefinitely.
3. **No cleanup job needed for MVP**: anonymous users persist in
   `auth.users` indefinitely unless explicitly deleted. At pilot scale
   this is a trivial amount of storage; a periodic cleanup of old,
   never-converted anonymous users is a reasonable Phase 2 chore, not
   an MVP concern.

---

## 5. Storage Bucket Setup

Create via **Storage** in the dashboard (or via SQL — either works;
the dashboard is faster for a one-time setup like this):

1. **`reference-images`**
   - Public: **No** (private bucket — access only via RLS policy or a
     server-generated signed URL, per
     [`06_Final_DB_Review.md` §5](./06_Final_DB_Review.md#5-storage-strategy)).
   - File size limit: **5 MB** per file (generous for a phone-camera
     reference photo, small enough to keep egress/storage cost
     predictable).
   - Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`,
     `image/heic` (iPhone camera default — worth allowing explicitly
     since your customers are mobile-first).
2. **`ai-previews`**
   - Public: **No** (same reasoning).
   - File size limit: **5 MB**.
   - Allowed MIME types: `image/png` (or whatever your OpenAI image
     model returns — confirm the actual output format when you build
     §9 of the implementation plan, and match it here).
3. **Not created for MVP**: `store-branding` (Phase 2 — nothing in MVP
   uploads a logo, per
   [`04_MVP_Reduction.md`](./04_MVP_Reduction.md)).
4. **Path convention** (enforced by the RLS policies in §6, not by a
   bucket setting): `{store_id}/{order_id}/{filename}` for both
   buckets. Nothing to configure here beyond knowing the convention —
   the policies are what actually enforce it.

---

## 6. RLS Implementation Strategy

`07_schema.sql` already **enabled** RLS on all 5 tables with no
policies — meaning right now, nothing can read or write any of them
except via the `service_role` key. This section is the strategy for
the follow-up migration that makes the database actually usable; per
[`06_Final_DB_Review.md` §6](./06_Final_DB_Review.md#6-rls-strategy),
every policy reduces to one of two shapes:

**Staff/owner access** (applies to `orders`, `reference_images`, and
staff read-access to `customers`):
```sql
store_id in (
  select store_id from store_members where user_id = auth.uid()
)
```

**Customer access** (applies to `customers` and `orders`, scoped to
the customer's own rows):
```sql
customer_id in (
  select id from customers where auth_user_id = auth.uid()
)
-- (or, on `customers` itself: auth_user_id = auth.uid())
```

**Important Supabase-specific detail:** an anonymous session is *not*
a separate Postgres role — Supabase issues it a normal `authenticated`
JWT with an `is_anonymous: true` claim. This means `auth.uid()` works
identically for guests and full accounts, and **no policy needs to
special-case anonymous users** — the same two shapes above cover both.

**Table-by-table policy plan** (to write as the actual next migration,
`0002_rls_policies.sql` — SQL not included in this document, since this
document is Supabase *configuration*, not the policy migration itself):

| Table | Policies needed |
|---|---|
| `stores` | Public `select` of non-sensitive columns (slug, name, locale, is_active) for the storefront to render — everything else store-scoped via `store_members`. |
| `store_members` | `select` for the member's own rows (so the app can check "am I a member of this store"); no `insert`/`update`/`delete` policy for authenticated users at all — membership rows are only ever written via the `service_role` key, by hand, per §7 of the implementation plan. |
| `customers` | `insert`: a new session may insert a row where `auth_user_id = auth.uid()`. `select`: own rows (customer shape) **or** store-member rows (staff shape). No `update`/`delete` policy — customer rows are write-once. |
| `orders` | `insert`: customer shape, and only where `customer_id` resolves to a `customers` row the inserting session owns. `select`: customer shape or staff shape. `update`: **staff shape only** (status changes) — customers never update an order after submitting. |
| `reference_images` | `insert`: customer shape, scoped through `order_id → orders.customer_id` ownership. `select`: customer shape or staff shape. No `update`/`delete` — images are write-once. |

**Testing before any app code touches this** (per
[`05_MVP_Implementation_Plan.md` §5](./05_MVP_Implementation_Plan.md#5-supabase-setup-plan),
step 6 — repeated here because it matters enough to restate): after
applying the policies, use the SQL editor or two real test sessions
(one anonymous, one a second test "store") to confirm a session scoped
to Store A gets **zero rows**, not an error, when querying Store B's
orders. A policy that silently returns nothing is correct; a policy
that throws or — worse — returns Store B's data is the one bug class
this whole exercise exists to prevent.

---

## 7. Migration Execution Order

Using the Supabase CLI (see §9 for install/link steps):

```
supabase/migrations/
├─ 0001_schema.sql          -- exactly docs/07_schema.sql, copied in as-is
├─ 0002_rls_policies.sql    -- the policies from §6, written next
└─ 0003_storage_buckets.sql -- bucket creation + their own RLS policies (§5)
```

**Order matters and is fixed:**
1. `0001_schema.sql` first — tables, keys, indexes, RLS *enabled*
   (already written and approved).
2. `0002_rls_policies.sql` second — cannot be written before the tables
   exist; the database is intentionally unusable (fully locked) in the
   gap between step 1 and step 2, which is fine since no application
   code exists yet to be affected by that.
3. `0003_storage_buckets.sql` third — bucket creation can technically
   happen anytime, but keeping it last means every SQL migration that
   defines "what data can exist" runs before any migration touching
   binary storage.

**Apply with:**
```bash
supabase link --project-ref <your-project-ref>
supabase db push
```
`db push` applies any migration files not yet recorded as applied, in
filename order — hence the numeric prefixes. After pushing, regenerate
TypeScript types (needed once application code begins, harmless to run
now to confirm the schema applied correctly):
```bash
supabase gen types typescript --project-id <your-project-ref> > src/types/database.ts
```
(This command will succeed even before `src/` exists as a folder if run
with a different output path — the point here is confirming the CLI
can talk to the deployed schema, not the exact file path yet.)

---

## 8. Required Environment Variables

| Variable | Where it's used | Where it lives |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server Supabase clients | Vercel env vars (all environments) + local `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server Supabase clients (RLS-governed, safe to expose) | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** — the handful of code paths that need to bypass RLS (per [`03_Architecture.md` §2](./03_Architecture.md#layer-3--database-layer-enforcement-postgres-rls)) | Vercel env vars, **never** prefixed `NEXT_PUBLIC_`, never in a file that reaches the browser bundle |
| `OPENAI_API_KEY` | Server-only, the AI-preview route handler | Vercel env vars + local `.env.local` |
| `SUPABASE_DB_URL` (pooled connection string) | Only needed if any tooling connects directly to Postgres outside the Supabase client SDK (e.g., a migration script run from a non-CLI tool) | Vercel env vars, server-only, if used at all |

**Practical setup:**
- Vercel: **Project Settings → Environment Variables**, set each for
  **Production**, **Preview**, and **Development** separately (Vercel
  supports different values per environment — use this if you ever
  spin up a second Supabase project for staging, per §9's note on when
  that becomes worth doing; for now, the same single-project values go
  in all three).
- Local: a single `.env.local` file at the project root, **listed in
  `.gitignore` from the very first commit** — never commit real keys,
  even to a private repo.
- Provide a checked-in `.env.example` (no real values, just the key
  names) once the app repo exists, so future-you (or a future
  collaborator) knows what's needed without hunting through this doc.

---

## 9. Local Development Setup

**Recommendation for a solo founder at MVP stage: skip running
Supabase locally via Docker.** Supabase's CLI can spin up a full local
Postgres+Auth+Storage stack, which is the right call for a team with
multiple developers needing isolated environments — but for one person,
pre-launch, it's extra moving parts (Docker Desktop running, local
stack drift from prod, syncing migrations both ways) for a benefit
(no cloud dependency while coding) that doesn't matter yet: the Free
cloud project already costs $0 and has no meaningful latency penalty
for a solo dev's normal workflow.

**Simpler setup that fits the constraints (lowest cost, fastest MVP):**

1. **One Supabase project, used for both development and production**
   at this stage. There is no real customer data to protect from
   development mistakes yet, and running two projects means twice the
   config to keep in sync for zero benefit pre-launch. Revisit this
   the moment you have a real pilot shop's real customer data in the
   database — at that point, create a second `cakelovers-staging`
   project (still Free tier) and point local development at that
   instead, keeping `cakelovers-prod` untouched by development work.
2. **Install the Supabase CLI** (`brew install supabase/tap/supabase`
   on macOS, or the npm/scoop equivalent on Windows) — needed for
   `supabase link` and `supabase db push` regardless of whether you run
   the local stack.
3. `supabase login`, then `supabase link --project-ref <ref>` from the
   project root once the Next.js app is scaffolded.
4. Local `.env.local` points at the **same cloud project's** URL/keys
   (§8) — `npm run dev` talks directly to the real (free-tier) Supabase
   project during development.
5. **One safety habit to adopt from day one**, precisely because
   dev and prod are the same project: never run a destructive SQL
   statement ad hoc in the Studio SQL editor against this project
   without thinking about it as if it were production — because for
   MVP, it is.

---

## 10. Security Checklist

Run through this before considering the Supabase side "done" for MVP:

- [ ] RLS is **enabled** on all 5 tables (`07_schema.sql` already does
      this) **and** policies are applied and tested with two distinct
      test identities confirming cross-tenant access returns nothing
      (§6).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` exists **only** in server-side
      environment variables, never in a `NEXT_PUBLIC_*` variable, never
      committed to git, never logged.
- [ ] Both Storage buckets (`reference-images`, `ai-previews`) are
      **private**, with their own RLS-style storage policies mirroring
      the path-prefix (`store_id`) check (§5, §6).
- [ ] **Anonymous sign-ins** are enabled (§4) — verify by actually
      testing the flow, not just checking the toggle, since a
      misconfigured redirect/CORS setting can silently break it.
- [ ] A CAPTCHA provider (Turnstile) is configured before any
      unsupervised public traffic reaches the anonymous sign-in
      endpoint (§4) — acceptable to defer past the very first,
      founder-supervised pilot test, not past that.
- [ ] **Site URL** and **Redirect URLs** in Auth settings list only
      domains you actually control (your Vercel domain(s) and
      localhost for dev) — an overly broad wildcard here is a phishing
      vector for magic-link auth.
- [ ] `.env.local` (and any other file with real keys) is in
      `.gitignore` **before** the first commit that could contain one.
- [ ] The database password (from project creation, §1) is stored in a
      password manager, not in a chat log, doc, or plaintext file.
- [ ] You're aware of the Free-tier backup limitation: **point-in-time
      recovery is a Pro-plan feature**; Free-tier daily backups have
      short retention. This is an acceptable risk while there's no real
      customer data, and is one of the concrete triggers (alongside
      avoiding auto-pause) for upgrading to **Pro ($25/month)** the
      moment a real pilot shop's real orders are flowing through the
      system — budget for that as the actual "launch" cost, not a
      later nice-to-have.
- [ ] Only you (the founder) has dashboard/Studio access at this stage
      — Supabase project collaborators should be added deliberately,
      not by default, per person who actually needs direct database
      access (which, per this whole architecture, should be nobody but
      you — shop owners use `/admin`, never Studio).

**This is the last document before application code begins.** Once
this Supabase configuration is complete and the security checklist
above is checked off, implementation proceeds per
[`05_MVP_Implementation_Plan.md`](./05_MVP_Implementation_Plan.md)
starting at its own step 2 (Next.js app skeleton) — no code has been
written yet by this document either.
