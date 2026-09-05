# Next.js Project Setup — Scaffold Only

Companion to [`05_MVP_Implementation_Plan.md`](./05_MVP_Implementation_Plan.md)
(§3 folder structure, §6 auth plan) and the now-complete
[`09_Supabase_Execution_Checklist.md`](./09_Supabase_Execution_Checklist.md).
Supabase is live: schema deployed, RLS deployed, buckets created,
Anonymous Auth on. This document scaffolds the Next.js app that will
talk to it — **infrastructure and wiring only. No order wizard, no
admin dashboard, no API routes, no OpenAI calls yet.** Those begin in
the next phase, once this scaffold is confirmed working end-to-end.

**Where this runs:** project root, `C:\Users\akigo\cakelovers` — the
same directory that already contains `docs/` and `supabase/`.

---

## 1. `create-next-app` Command

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

Run this **from the project root** (`.` as the target, not a new
subfolder) — the directory already has `docs/` and `supabase/` in it,
which is fine; `create-next-app` will note the directory isn't empty
and ask to continue. Say yes; it won't touch those folders.

Flag-by-flag, and why each is set this way:
- `--typescript` — matches the approved stack; also required for the
  generated `src/types/database.ts` (§4) to be useful.
- `--tailwind` — matches the approved stack. Note: current
  `create-next-app` ships **Tailwind v4**, which is CSS-first — don't
  be surprised if there's no `tailwind.config.ts` file; configuration
  lives in `src/app/globals.css` via `@import "tailwindcss"` and
  `@theme` blocks instead. This is expected, not a setup mistake.
- `--eslint` — comes free, no reason to skip it.
- `--app` — App Router, per the architecture (not Pages Router).
- `--src-dir` — matches the `src/` layout already planned in
  [`03_Architecture.md` §7](./03_Architecture.md#7-file--folder-structure).
- `--import-alias "@/*"` — matches every `@/lib/...`, `@/components/...`
  reference already used in prior docs' code sketches.

If the CLI interactively asks about Turbopack for `next dev`, either
answer is fine for MVP — it doesn't affect anything in this document.

---

## 2. Required Package Dependencies

Beyond what `create-next-app` installs (`next`, `react`, `react-dom`,
`typescript`, `tailwindcss`, `eslint`):

```bash
npm install @supabase/ssr @supabase/supabase-js openai
```

| Package | Why |
|---|---|
| `@supabase/ssr` | The current, supported way to use Supabase Auth with Next.js's App Router (cookie-based session handling across Server Components, Route Handlers, and middleware). |
| `@supabase/supabase-js` | The underlying client `@supabase/ssr` builds on; also used directly for the service-role client (§5). |
| `openai` | Official SDK for the AI-preview route — built in the *next* phase, but installing it now keeps this dependency list in one place. |

**Deliberately not installed**, per the lowest-maintenance constraint
running through every prior doc — add these only if a real, felt need
shows up while building features, not preemptively:
- No state-management library (Redux/Zustand/Jotai) — the order wizard
  is one component with local state, per
  [`05_MVP_Implementation_Plan.md` §8](./05_MVP_Implementation_Plan.md#8-customer-ordering-flow-implementation-plan).
- No data-fetching library (React Query/SWR) — Server Components +
  native `fetch` cover MVP's needs.
- No form library (React Hook Form) — a five-step wizard with plain
  controlled inputs doesn't need one yet.
- No validation library (Zod) — add it the moment the order-submit
  route's input validation gets non-trivial; not needed for a scaffold.
- No date library (date-fns/dayjs) — native `Date`/`Intl` cover the
  simple pickup-date and locale-formatting needs in MVP.

### shadcn/ui

```bash
npx shadcn@latest init
```
Accept the defaults it infers from your `create-next-app` setup
(TypeScript, Tailwind CSS variables, `@/components`, `@/lib/utils`).

Then add a small starter set of primitives — enough to prove the
pipeline works, not the full library:
```bash
npx shadcn@latest add button input label card
```
Add more components (`select`, `textarea`, `dialog`, etc.) as each
actual feature needs them in the next phase — no reason to front-load
components nothing uses yet.

---

## 3. Folder Structure

**What this scaffold phase actually creates:**

```
cakelovers/
├─ docs/                          # unchanged — all 10 docs so far
├─ supabase/
│  └─ migrations/                 # unchanged — 0001_schema.sql, 0002_rls_policies.sql
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                # root layout (create-next-app default, lightly edited)
│  │  ├─ page.tsx                  # placeholder home page — proves the deploy pipeline works
│  │  └─ globals.css               # Tailwind v4 entry point
│  ├─ components/
│  │  └─ ui/                       # shadcn/ui primitives land here (button.tsx, input.tsx, ...)
│  ├─ lib/
│  │  ├─ supabase/
│  │  │  ├─ client.ts              # browser client
│  │  │  ├─ server.ts              # server client (Server Components, Route Handlers)
│  │  │  ├─ middleware.ts          # session-refresh helper used by root middleware.ts
│  │  │  └─ service-role.ts        # server-only, bypasses RLS — used sparingly, later
│  │  └─ utils.ts                  # shadcn's cn() helper (created by `shadcn init`)
│  └─ types/
│     └─ database.ts               # generated, never hand-edited (§4)
├─ middleware.ts                   # session refresh only — no tenant/auth logic yet
├─ .env.local                      # already exists from the Supabase checklist — not committed
├─ .env.example                    # new: key names only, safe to commit
├─ .gitignore                      # already exists — confirm it covers Next.js output too
├─ components.json                 # shadcn/ui config, created by `shadcn init`
├─ next.config.ts
├─ postcss.config.mjs
├─ tsconfig.json
└─ package.json
```

**Deliberately not created yet** — these are the *target* shape from
[`03_Architecture.md` §7](./03_Architecture.md#7-file--folder-structure)
and [`05_MVP_Implementation_Plan.md` §3](./05_MVP_Implementation_Plan.md#3-folder-structure),
shown there for reference, but building empty feature folders now would
be scaffolding for its own sake:
- `src/app/s/[storeSlug]/...` (customer storefront + order wizard)
- `src/app/admin/[storeSlug]/...` (shop owner dashboard)
- `src/app/login/`
- `src/app/api/stores/[storeSlug]/...` (AI-preview, orders routes)
- `src/components/order-flow/`, `src/components/admin/`
- `src/lib/openai/`, `src/lib/email/`, `src/lib/i18n/`

These get created one at a time as the next phase actually builds each
feature, per the build order already set in
[`05_MVP_Implementation_Plan.md` §10](./05_MVP_Implementation_Plan.md#10-recommended-development-order-day-by-day-shape).

---

## 4. Environment Variables

`.env.local` should already exist from
[`09_Supabase_Execution_Checklist.md` §8](./09_Supabase_Execution_Checklist.md#8-environment-variables)
with the three Supabase values. Add the OpenAI key now, since OpenAI is
part of this phase's stack setup even though the route that uses it is
built later:

```
NEXT_PUBLIC_SUPABASE_URL=<from Supabase project settings>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase project settings>
SUPABASE_SERVICE_ROLE_KEY=<from Supabase project settings — server-only>
OPENAI_API_KEY=<from platform.openai.com>
```

Create `.env.example` (committed, no real values — so a future you, on
a new machine, knows what's needed):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
```

Confirm `.gitignore` (created in the Supabase checklist phase) also
covers what `create-next-app` needs ignored — it generates one with
`node_modules`, `.next`, `.env*.local` already in it; just confirm it
merged correctly rather than got overwritten.

**Vercel, once the app is pushed to a git repo:**
- Create the Vercel project, import the repo.
- **Project Settings → Environment Variables**: add all four variables
  above for **Production**, **Preview**, and **Development**.
- Do this before the first deploy, or the first deploy will build but
  the app will fail at runtime when it can't reach Supabase.

---

## 5. Supabase Client Setup

Three client files plus one middleware helper — this is the standard
Supabase-recommended pattern for Next.js App Router, containing **no
app-specific logic** (no tenant resolution, no auth guards — those are
features, built next phase). This is purely "how does any server or
browser code in this app talk to Supabase at all."

**`src/lib/supabase/client.ts`** — browser client (used by client
components, e.g. for direct Storage uploads later):
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**`src/lib/supabase/server.ts`** — server client for Server Components
and Route Handlers (reads/writes the session cookie):
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component that can't set cookies directly —
            // safe to ignore as long as middleware.ts is refreshing sessions.
          }
        },
      },
    }
  )
}
```

**`src/lib/supabase/middleware.ts`** — session-refresh helper, called
from root `middleware.ts`:
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refreshes the session if expired. Required for Server Components,
  // which cannot write cookies themselves.
  await supabase.auth.getUser()

  return supabaseResponse
}
```

**`middleware.ts`** (project root) — scaffold-only version, session
refresh with no routing/tenant logic yet (that's a feature, added when
the customer/admin routes exist):
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

**`src/lib/supabase/service-role.ts`** — server-only client that
bypasses RLS. Used sparingly, later, only in explicitly-reviewed code
paths (per
[`03_Architecture.md` §2](./03_Architecture.md#layer-3--database-layer-enforcement-postgres-rls)):
```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

**Generated types** — do not hand-write `src/types/database.ts`:
```bash
supabase gen types typescript --project-id <project-ref> > src/types/database.ts
```
Re-run this any time the schema changes.

---

## 6. Recommended Project Initialization Sequence

In order — each step assumes the previous one succeeded:

1. `npx create-next-app@latest .` with the flags in §1, from the
   project root.
2. `npm install @supabase/ssr @supabase/supabase-js openai` (§2).
3. `npx shadcn@latest init`, then `npx shadcn@latest add button input
   label card` (§2).
4. Confirm `.env.local` has all four variables (§4); create
   `.env.example` alongside it; confirm `.gitignore` covers both
   Next.js and Supabase-related files correctly.
5. Create the four Supabase client/middleware files exactly as in §5.
6. Create the scaffold-only root `middleware.ts` (§5).
7. Run `supabase gen types typescript --project-id <project-ref> >
   src/types/database.ts` (§5) — confirms the CLI can reach your live
   schema and gives you real types before any feature code needs them.
8. `npm run dev` — confirm the placeholder home page loads at
   `localhost:3000` with Tailwind styles applied and no console errors.
9. Temporarily import and render one shadcn component (e.g. the
   `Button` you added) on the placeholder home page, just to confirm
   the shadcn pipeline (Tailwind classes + `cn()` + component) actually
   renders correctly end-to-end. Remove or leave it — it's a throwaway
   proof, not a real feature.
10. `git init` (if not already a repo), first commit — with
    `.gitignore` already excluding `.env.local` and `node_modules`,
    confirmed by checking `git status` shows neither before committing.
11. Push to a git remote (GitHub), import the repo into a new Vercel
    project, add all four environment variables for Production,
    Preview, and Development (§4), deploy.
12. Visit the deployed Vercel URL and confirm the same placeholder page
    loads there — this proves the full pipeline (Vercel ↔ Supabase ↔
    env vars) before any real feature is built on top of it.

**Checkpoint at the end of this document:** a deployed Next.js app,
styled with Tailwind, with shadcn/ui wired in, talking to the live
Supabase project via properly separated browser/server/service-role
clients, with generated database types — and **zero business logic**.
The next phase begins building the customer ordering flow on top of
this, per
[`05_MVP_Implementation_Plan.md` §8](./05_MVP_Implementation_Plan.md#8-customer-ordering-flow-implementation-plan).
