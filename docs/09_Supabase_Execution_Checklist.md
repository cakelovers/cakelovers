# Supabase Execution Checklist

Companion to [`07_schema.sql`](./07_schema.sql) (the schema to apply)
and [`08_Supabase_Setup_Guide.md`](./08_Supabase_Setup_Guide.md) (the
settings and reasoning behind each step). This document is the
**literal, in-order, check-it-off sequence** for standing up the real
Supabase project. Nothing here is new decision-making — every choice
was already made in `08`; this is just executing it.

**Assumes:** solo founder, this is the first MVP, **no Supabase project
exists yet.** Work through this top to bottom — later steps assume
earlier ones are done.

**Still no application code, no Next.js.** This checklist ends with a
Go/No-Go gate (§10) that must pass before any of that begins.

---

## 1. Creating the Supabase Project

- [ ] Go to [supabase.com](https://supabase.com) and sign in (create an
      account first if you don't have one).
- [ ] Click **New Project**.
- [ ] **Organization**: use your personal/default organization (no
      team needed — solo founder).
- [ ] **Name**: `cakelovers` (per
      [`08`](./08_Supabase_Setup_Guide.md#9-local-development-setup),
      one project serves both development and production for now).
- [ ] **Database Password**: click the generator, let it create a
      strong random password.
- [ ] **Immediately copy that password into your password manager.**
      It is shown once. If you lose it, you'll need to reset it later
      (possible, but an avoidable annoyance).
- [ ] **Region**: choose **Northeast Asia (Seoul)** or **Northeast Asia
      (Tokyo)** — whichever is closer to your first real pilot shop.
      This cannot be easily changed later.
- [ ] **Pricing Plan**: leave on **Free**.
- [ ] Click **Create new project** and wait (~2 minutes) for
      provisioning to finish.

**Checkpoint:** you should now see the project dashboard with a green
"Project is healthy" style indicator (exact wording varies by dashboard
version) and a left sidebar with Table Editor, Authentication, Storage,
etc.

---

## 2. Required Project Settings

- [ ] Go to **Project Settings → General**. Confirm the project name is
      correct.
- [ ] Go to **Project Settings → Database → Connection Pooling**.
      Confirm pooling is **enabled** and mode is **Transaction**
      (Supabase's default — you're just confirming, not changing).
- [ ] While there, note the **Connection string (pooled, port 6543)** —
      this is the one to use later if anything ever connects directly
      to Postgres outside the Supabase client SDK. You don't need to
      copy it anywhere yet.
- [ ] Go to **Project Settings → Data API**. Confirm **Exposed
      schemas** is set to `public` only (default — the `auth` schema
      should **not** be listed here).
- [ ] Go to **Project Settings → API**. This page has your project URL
      and two keys (`anon` `public` and `service_role` `secret`) —
      you'll copy these into environment variables in §8. Leave this
      tab open or bookmarked; you'll come back to it.

**Checkpoint:** no settings needed to change from Supabase's defaults
in this section — you were confirming, not configuring.

---

## 3. Enabling Anonymous Auth

- [ ] Go to **Authentication → Sign In / Providers** (Supabase dashboards
      sometimes label this **Authentication → Providers**, or list
      "Anonymous Sign-Ins" under **Authentication → Settings** —
      whichever tab structure you see, look for "Anonymous").
- [ ] Toggle **Allow anonymous sign-ins** to **ON**. This is off by
      default — this single toggle is what the entire guest-checkout
      flow depends on. **Do not skip this.**
- [ ] Go to **Authentication → URL Configuration** (or **Settings**,
      depending on dashboard version):
  - [ ] Set **Site URL** to `http://localhost:3000` for now (you'll
        update this to your real Vercel domain once the app is
        deployed — this is a placeholder that's safe to change later).
  - [ ] Add `http://localhost:3000/**` to **Redirect URLs**.
- [ ] **Email auth provider**: confirm the **Email** provider is
      enabled (it is by default). Turn **off** "Confirm email" if that
      toggle is visible under the Email provider's settings — MVP uses
      magic-link login for shop owners, which already proves email
      ownership on its own.
- [ ] **Optional, can defer**: set up Cloudflare Turnstile under
      **Authentication → Settings → Bot and Abuse Protection**, per
      [`08` §4](./08_Supabase_Setup_Guide.md#4-anonymous-auth-setup).
      Check this box once done, or explicitly note it as deferred and
      move on — either is fine for a first pilot.

**Checkpoint:** Anonymous sign-ins toggle is ON. Full behavioral
confirmation that anonymous sign-in actually works end-to-end happens
naturally the first time application code calls it (Phase 0/1 of
[`05_MVP_Implementation_Plan.md`](./05_MVP_Implementation_Plan.md)) —
that's expected, not a gap in this checklist.

---

## 4. Creating Storage Buckets

- [ ] Go to **Storage** in the left sidebar.
- [ ] Click **New bucket**.
  - [ ] Name: `reference-images`
  - [ ] Public bucket: **OFF** (leave private)
  - [ ] File size limit: `5` MB
  - [ ] Allowed MIME types: `image/jpeg,image/png,image/webp,image/heic`
  - [ ] Create.
- [ ] Click **New bucket** again.
  - [ ] Name: `ai-previews`
  - [ ] Public bucket: **OFF**
  - [ ] File size limit: `5` MB
  - [ ] Allowed MIME types: `image/png` (adjust later if your OpenAI
        model returns a different format — confirm when you build the
        AI-preview route)
  - [ ] Create.
- [ ] Confirm both buckets show a **closed lock icon** (or equivalent
      "private" indicator) in the bucket list — not the "public" badge.

**Checkpoint:** two private buckets exist: `reference-images`,
`ai-previews`. No `store-branding` bucket yet (Phase 2, per
[`04_MVP_Reduction.md`](./04_MVP_Reduction.md)).

---

## 5. Applying `schema.sql`

Using the Supabase CLI (install it first if you haven't:
`npm install -g supabase` or `brew install supabase/tap/supabase`):

- [ ] In your project root (`C:\Users\akigo\cakelovers`), run:
  ```bash
  supabase login
  ```
  (opens a browser window to authenticate the CLI to your account).
- [ ] Initialize the Supabase project structure:
  ```bash
  supabase init
  ```
  This creates a `supabase/` folder — this is infrastructure config,
  not application code, so it's correct to create it now, before any
  Next.js app exists (matches the folder structure planned in
  [`03_Architecture.md` §7](./03_Architecture.md#7-file--folder-structure)).
- [ ] Create the migrations folder if `init` didn't already:
  ```bash
  mkdir -p supabase/migrations
  ```
- [ ] Copy the full contents of [`07_schema.sql`](./07_schema.sql) into
      a new file:
  ```
  supabase/migrations/0001_schema.sql
  ```
- [ ] Link the CLI to your actual project (find `<project-ref>` in the
      Supabase dashboard URL or **Project Settings → General**):
  ```bash
  supabase link --project-ref <project-ref>
  ```
  (it will prompt for the database password from §1).
- [ ] Push the migration:
  ```bash
  supabase db push
  ```

**Checkpoint:** the command should report `0001_schema.sql` applied
successfully, with no errors. If it errors, read the error message
before retrying — do **not** repeatedly re-run `db push` against
partial failures without understanding what failed first.

---

## 6. Verifying Tables

- [ ] In the Supabase dashboard, go to **Table Editor**. Confirm you
      see exactly these 5 tables: `stores`, `store_members`,
      `customers`, `orders`, `reference_images`.
- [ ] Click into `orders` and spot-check columns exist: `description`,
      `status`, `pickup_date`, `pickup_time`, `ai_preview_storage_path`,
      `ai_preview_prompt`, `internal_note`, `created_at`, `updated_at`.
- [ ] Go to **Database → Enumerated Types** (or run the SQL below) and
      confirm both `locale_code` and `order_status` exist with the
      expected values.
- [ ] Open the **SQL Editor** and run:
  ```sql
  select table_name, row_security
  from information_schema.tables
  join pg_tables on pg_tables.tablename = information_schema.tables.table_name
  where table_schema = 'public';
  ```
  Or more simply, in the Table Editor, click each table's **RLS**
  toggle indicator — all 5 should already show **RLS enabled** (with
  zero policies yet, meaning zero rows are currently accessible via the
  API — that's correct and expected at this point).

**Checkpoint:** 5 tables, correct columns, both enums present, RLS
shown as enabled on all 5 tables.

---

## 7. Implementing RLS Policies

Create `supabase/migrations/0002_rls_policies.sql` with the following,
matching the policy shapes from
[`06_Final_DB_Review.md` §6](./06_Final_DB_Review.md#6-rls-strategy) and
[`08` §6](./08_Supabase_Setup_Guide.md#6-rls-implementation-strategy):

```sql
-- stores: public can see active stores (storefront rendering);
-- members can see their own store regardless of active status
create policy "public can view active stores"
on stores for select
to anon, authenticated
using (is_active = true);

create policy "members can view their own store"
on stores for select
to authenticated
using (id in (select store_id from store_members where user_id = auth.uid()));

-- store_members: a user can see their own membership rows only
-- (no insert/update/delete policy — memberships are created only via
-- the service_role key, by hand, per the founder's own runbook)
create policy "users can view their own memberships"
on store_members for select
to authenticated
using (user_id = auth.uid());

-- customers: a session can create its own customer row, and see
-- either its own row or (if staff) their store's customer rows
create policy "customers can insert their own row"
on customers for insert
to authenticated
with check (auth_user_id = auth.uid());

create policy "customers can view their own row, staff can view their store's"
on customers for select
to authenticated
using (
  auth_user_id = auth.uid()
  or store_id in (select store_id from store_members where user_id = auth.uid())
);

-- orders: a customer can create an order for themselves, in their own
-- store; customers and staff can each view their own scope; only
-- staff can update (status changes)
create policy "customers can insert their own orders"
on orders for insert
to authenticated
with check (
  exists (
    select 1 from customers c
    where c.id = customer_id
      and c.auth_user_id = auth.uid()
      and c.store_id = orders.store_id
  )
);

create policy "customers and staff can view relevant orders"
on orders for select
to authenticated
using (
  customer_id in (select id from customers where auth_user_id = auth.uid())
  or store_id in (select store_id from store_members where user_id = auth.uid())
);

create policy "staff can update their store's orders"
on orders for update
to authenticated
using (store_id in (select store_id from store_members where user_id = auth.uid()))
with check (store_id in (select store_id from store_members where user_id = auth.uid()));

-- reference_images: a customer can attach images to their own order;
-- customers and staff can each view relevant images; no update/delete
create policy "customers can insert reference images on their own orders"
on reference_images for insert
to authenticated
with check (
  exists (
    select 1 from orders o
    join customers c on c.id = o.customer_id
    where o.id = order_id
      and c.auth_user_id = auth.uid()
      and o.store_id = reference_images.store_id
  )
);

create policy "customers and staff can view relevant reference images"
on reference_images for select
to authenticated
using (
  exists (
    select 1 from orders o
    join customers c on c.id = o.customer_id
    where o.id = order_id and c.auth_user_id = auth.uid()
  )
  or store_id in (select store_id from store_members where user_id = auth.uid())
);
```

Then apply and verify:

- [ ] `supabase db push`
- [ ] In the dashboard, go to **Authentication → Policies** (or **Table
      Editor → [table] → RLS Policies**). Confirm each table listed
      above shows its expected policies.

### Manual isolation test (do this before writing any app code)

- [ ] Go to **Authentication → Users → Add user**, create two test
      users: `test-store-a@example.com` and `test-store-b@example.com`
      (any password — you won't log in as them normally). Copy each
      user's UUID.
- [ ] In the **SQL Editor**, as the default `postgres` role (which
      bypasses RLS — this is expected and fine for seeding test data),
      insert two stores, one `store_members` row per test user linking
      them to their respective store, and one `customers` row per user:
  ```sql
  insert into stores (id, slug, name) values
    ('11111111-1111-1111-1111-111111111111', 'store-a', 'Store A'),
    ('22222222-2222-2222-2222-222222222222', 'store-b', 'Store B');

  insert into store_members (store_id, user_id) values
    ('11111111-1111-1111-1111-111111111111', '<store-a-user-uuid>'),
    ('22222222-2222-2222-2222-222222222222', '<store-b-user-uuid>');

  insert into customers (store_id, auth_user_id, name) values
    ('11111111-1111-1111-1111-111111111111', '<store-a-user-uuid>', 'Test Customer A');
  ```
- [ ] Simulate "logged in as the Store A user" and confirm you can see
      Store A's data but **not** Store B's:
  ```sql
  set local role authenticated;
  set local "request.jwt.claims" = '{"sub": "<store-a-user-uuid>", "role": "authenticated"}';

  select * from stores;          -- expect: only Store A (plus any other active stores' public rows)
  select * from store_members;   -- expect: only the Store A membership row
  select * from customers;       -- expect: only Test Customer A
  ```
- [ ] Reset and repeat with the Store B user's UUID, confirming you now
      see Store B's rows and **not** Store A's `store_members`/
      `customers` rows.
- [ ] Delete the two test users and their rows once satisfied (or leave
      them — they cost nothing and are clearly labeled `test-*`).

**Checkpoint:** cross-tenant queries return **zero rows**, never an
error and never the other tenant's data. This is the single most
important checkpoint in this entire document — do not proceed past it
on a "looks probably fine" basis.

---

## 8. Environment Variables

- [ ] Go back to **Project Settings → API** (from §2).
- [ ] Copy the **Project URL** → this is `NEXT_PUBLIC_SUPABASE_URL`.
- [ ] Copy the **`anon` `public`** key → this is
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Copy the **`service_role` `secret`** key → this is
      `SUPABASE_SERVICE_ROLE_KEY`. **Treat this like a password** — it
      bypasses every RLS policy you just wrote.
- [ ] Create a file at the project root:
  ```
  C:\Users\akigo\cakelovers\.env.local
  ```
  with:
  ```
  NEXT_PUBLIC_SUPABASE_URL=<your project url>
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<your anon key>
  SUPABASE_SERVICE_ROLE_KEY=<your service role key>
  ```
  (`OPENAI_API_KEY` and any email-provider key are added later, when
  those integrations are actually built — not a Supabase concern.)
- [ ] Create a `.gitignore` file at the project root (if one doesn't
      exist yet) containing at least:
  ```
  .env.local
  .env*.local
  node_modules
  .next
  ```
  **Do this before your first `git init`/commit**, not after.
- [ ] Note for later (not an action now): when the app is deployed to
      Vercel, these same three values get pasted into **Vercel Project
      Settings → Environment Variables** for Production, Preview, and
      Development — that step happens during Next.js setup, out of
      scope for this checklist.

**Checkpoint:** `.env.local` exists locally with real values,
`.gitignore` excludes it, and you have not pasted any of these values
into this chat, a public doc, or a commit.

---

## 9. Verifying Everything Works

A final functional pass before declaring the Supabase side done:

- [ ] **Schema**: §6's checkpoint passed.
- [ ] **RLS isolation**: §7's manual test passed (zero cross-tenant
      rows).
- [ ] **Storage buckets are actually private**: in the **Storage**
      dashboard, upload a test file into `reference-images` manually,
      then try opening its public URL
      (`<project-url>/storage/v1/object/public/reference-images/<path>`)
      in an incognito browser window — it should **fail** (private
      buckets reject the public URL pattern; only the private
      `.../object/authenticated/...` path with a valid signed
      URL/session works). If it loads without any auth, the bucket is
      misconfigured as public — go back to §4 and fix it.
- [ ] **Anonymous Auth toggle**: confirmed ON in §3 (full behavioral
      test deferred to first app code, as noted there — that's
      expected).
- [ ] **Auth email**: confirmed the Email provider is on and "Confirm
      email" is off (or you've deliberately decided to leave it on and
      accounted for that in your login-flow plan).
- [ ] **Migrations are reproducible**: run `supabase db push` a second
      time with no new migration files — it should report nothing to
      apply (idempotent), confirming your migration files are the
      actual source of truth for the schema, not something hand-edited
      in Studio afterward.
- [ ] **Delete your test rows** from §7 (test stores/users/customers)
      once you're confident, so the database starts clean — or
      explicitly note you're leaving them as known-safe fixtures and
      remember they exist.

---

## 10. Go / No-Go Checklist Before Next.js Development

All of the following must be true. If anything is unchecked, **stop and
fix it here** — every one of these is dramatically cheaper to fix now,
before application code exists, than after.

- [ ] Supabase project created, in a region appropriate for your first
      pilot shop.
- [ ] Database password saved in a password manager.
- [ ] Connection pooling confirmed enabled (Transaction mode).
- [ ] `auth` schema **not** exposed via the Data API.
- [ ] Anonymous sign-ins **enabled**.
- [ ] Site URL and Redirect URLs set (even as localhost placeholders).
- [ ] "Confirm email" decision made deliberately (off, for magic-link
      flow — or explicitly on with a plan for it).
- [ ] Two private Storage buckets created: `reference-images`,
      `ai-previews`, with size/MIME limits set.
- [ ] `0001_schema.sql` applied — all 5 tables + 2 enums exist exactly
      as specified in [`07_schema.sql`](./07_schema.sql).
- [ ] `0002_rls_policies.sql` applied — every table has its expected
      policies visible in the dashboard.
- [ ] **The manual cross-tenant isolation test in §7 passed** — this is
      the one item on this list that is not optional under any time
      pressure.
- [ ] Storage bucket privacy manually confirmed (public URL access
      fails) for at least one test upload.
- [ ] `.env.local` populated with real `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] `.gitignore` excludes `.env.local` and exists **before** any git
      commit in this project.
- [ ] `supabase db push` is idempotent (a second run applies nothing
      new).

**If every box above is checked: GO.** Proceed to
[`05_MVP_Implementation_Plan.md`](./05_MVP_Implementation_Plan.md),
starting at its step 2 (Next.js app skeleton) — the Supabase side is
done and verified.

**If any box is unchecked: NO-GO.** Resolve it within this checklist
before writing a single line of application code — every prior document
in this series was written on the premise that the database and its
isolation guarantees are solid *before* a UI exists to obscure whether
they actually are.
