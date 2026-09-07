# V1 Payment Workflow — Release Checklist

Deployment checklist for the manual-payment workflow specified in
[`15_V1_Payment_Workflow_Spec.md`](./15_V1_Payment_Workflow_Spec.md).

Branch: `feat/v1-payment-workflow`.

---

## 0. What ships in this release

| Area | Change |
|---|---|
| DB | `order_status` enum swap (`new → pricing_pending`, `in_progress → making`, adds `payment_pending`, `paid`); six new `orders` columns; new `store_payment_settings` table + RLS |
| Admin | Payment section on the order-detail page (enter/edit quote, copy payment message, mark as paid, undo payment, cancel with reason, start making); new `/admin/[storeSlug]/settings` page; `Settings` link in the admin header; `견적` column on the order list; status dropdown now shows only valid next states |
| Customer | `/orders/[orderId]` renders payment state — amount, bank account, `입금자명` reference, deadline — per order status |
| Lib | `buildPaymentMessage`, `buildPaymentReference`, KRW/timezone formatters, `store_payment_settings` read helpers, `getSiteUrl` |
| Env | new optional `NEXT_PUBLIC_SITE_URL` |

Not in this release (see spec §9): PIPA consent baseline (spec §7 step 10 —
tracked separately), AlimTalk, "입금했어요" button, Kanban, deposits.

---

## 1. Pre-deploy — Supabase SQL migrations (RUN THESE MANUALLY)

There is no linked Supabase CLI project in this repo, so apply the SQL by
hand in the **Supabase dashboard → SQL Editor**, in this exact order,
against the project in `.env.local`
(`NEXT_PUBLIC_SUPABASE_URL` = `rpccqnsnwwrdokfkqsha`):

- [ ] **1.** Run `supabase/migrations/0003_payment_workflow.sql`
      — enum swap + `orders` columns + `store_payment_settings` table.
- [ ] **2.** Run `supabase/migrations/0004_payment_rls.sql`
      — the three members-only policies on `store_payment_settings`.

Both files are guarded (enum swap runs only while the old `new` label
still exists; every `add column` / `create table` / `create policy` is
`IF NOT EXISTS` or drop-then-create). Re-running either file is a no-op —
safe if you are unsure whether it already ran.

If you later link the Supabase CLI (`supabase link` then `supabase db
push`), these same two files are picked up as migrations `0003` / `0004`.

### Post-migration verification (in the SQL editor)

- [ ] `select unnest(enum_range(null::order_status));` returns exactly:
      `pricing_pending, payment_pending, paid, making, ready, completed, cancelled`.
- [ ] `select column_name from information_schema.columns where table_name
      = 'orders' and column_name in ('quoted_price_krw',
      'payment_requested_at','paid_at','paid_confirmed_by',
      'payment_reference','cancellation_reason');` returns all six.
- [ ] `select * from store_payment_settings;` succeeds (empty result is
      expected).
- [ ] `select polname from pg_policies where tablename =
      'store_payment_settings';` returns the three `members can …` policies.
- [ ] Any pre-existing test orders now read `status = 'pricing_pending'`
      (was `new`) — `select status, count(*) from orders group by 1;`.

---

## 2. Environment variables

- [ ] `NEXT_PUBLIC_SITE_URL` — **optional**. When unset the app derives the
      origin from Vercel's forwarded-host headers, which is correct for
      normal deploys. Set it only to pin a custom apex domain
      (e.g. `https://cakelovers.app`). If set, add it to the Vercel
      project (Production + Preview) and redeploy.
- [ ] Confirm existing vars unchanged: `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
      `OPENAI_API_KEY`.
- [ ] `.env.example` updated (done in this branch).

---

## 3. Code checks (run before merging)

| Check | Command | Status |
|---|---|---|
| Lint | `npm run lint` | ✅ passes (exit 0) |
| Build + typecheck | `npm run build` | ✅ passes — all 13 routes compile, incl. `/admin/[storeSlug]/settings` and updated `/orders/[orderId]` |
| Pure-logic verification | see §4 | ✅ 9/9 assertions pass |

- [ ] `npm run lint` → 0 errors
- [ ] `npm run build` → succeeds
- [ ] No remaining references to old status strings
      (`grep -rn "in_progress\|'new'" src/` → only comments/migration text)

---

## 4. State-transition & message verification

Verified against spec §2.2 / §2.3 / §5 / §8:

- [x] `VALID_STATUS_TRANSITIONS` matches spec §2.2 exactly:
  - `pricing_pending → {payment_pending, cancelled}`
  - `payment_pending → {paid, cancelled}`
  - `paid → {making, payment_pending, cancelled}`
  - `making → {ready, paid, cancelled}`
  - `ready → {completed, cancelled}`
  - `completed → {}` · `cancelled → {}`
- [x] Status dropdown never offers `payment_pending` as a target (owned by
      *Enter quote* forward and *Undo payment* backward — the latter also
      clears `paid_at` / `paid_confirmed_by`, which a bare status write
      would not).
- [x] Dropdown does not offer `paid` forward from `payment_pending` (owned
      by *Mark as paid*) but **does** offer it as the documented
      one-step-back from `making` (spec §2.3 bullet 4).
- [x] `updateOrderStatus` server action independently rejects any
      transition not in the map.
- [x] `setQuote` rejects `0` / negative / non-numeric and only fires from
      `pricing_pending`; computes `payment_reference` once
      (`{name≤10}-{last4hex uppercased}`, e.g. `홍길동-3F9A`).
- [x] `updateQuote` changes the amount only — no status change, no
      reference recompute, `payment_requested_at` untouched.
- [x] `markPaymentRequested` stamps `payment_requested_at` on first call
      only; later calls are a no-op success.
- [x] `markAsPaid` (`payment_pending → paid`) sets `paid_at` +
      `paid_confirmed_by` together; `undoPayment` (`paid →
      payment_pending`) nulls both together.
- [x] `cancelOrder` writes `cancellation_reason` (trimmed → `NULL` if
      empty) and only from a non-terminal state.
- [x] `buildPaymentMessage` output contains every token from spec §8:
      store name, customer name, collapsed+truncated description, pickup
      `YYYY. M. D. HH:mm`, `{amount}원`, bank line, `예금주`,
      `payment_reference`, `{hours}시간 이내`, absolute deadline
      `M월 D일 HH:mm까지`, order URL. Instructions block omitted cleanly
      when null (no dangling blank line).

These were verified with an ad-hoc `node:test` harness exercising the
actual `src/lib` modules (`order-status`, `payment-reference`,
`payment-message`, `format`) — 9/9 assertions pass.

> Follow-up (not blocking): commit these as real unit tests once a test
> runner is chosen (spec §5.1 / §7 step 4). `package.json` has no test
> runner today, and the `src/lib/payments` modules use extensionless
> relative imports that bare `node --test` cannot resolve without one.

---

## 5. Manual QA on a preview deploy

Do this on a Vercel preview of the branch, signed in as a store member,
with at least one test order.

### Store settings
- [ ] `/admin/[storeSlug]/settings` loads; `Settings` link visible in the
      admin header.
- [ ] Save bank name / account number / holder / instructions / deadline
      hours → "저장되었습니다"; reload shows the saved values.
- [ ] Deadline outside 1–168 is rejected with a Korean error.

### Quote → payment_pending
- [ ] New/`pricing_pending` order shows **견적 금액 (₩)** input; customer
      page shows only "확인 중", no price.
- [ ] Save `0` or letters → visible error, status unchanged.
- [ ] Save `68000` → order becomes `payment_pending`; `견적 금액` and a
      stable `입금자명` (`이름-XXXX`) appear.

### Payment message
- [ ] With bank settings **unset**: copy button replaced by the
      "먼저 설정에서 계좌 정보를 입력하세요" link.
- [ ] With bank settings set: **결제 메시지 복사** copies the full Korean
      message; toast "복사되었습니다"; preview `<details>` shows the same
      text; the order URL uses the right origin.
- [ ] First copy → "요청함 · {time}" appears; copy again → timestamp does
      **not** change.
- [ ] Edit the quote in `payment_pending` → amount changes, status stays,
      `입금자명` unchanged, "요청함" timestamp unchanged, reminder text
      shown.

### Mark as paid / undo
- [ ] **입금 확인** → confirm dialog → order becomes `paid`; section
      collapses to 견적 금액 / 입금 확인 시각 / 입금자명; customer page
      shows "입금이 확인되었습니다".
- [ ] **입금 확인 취소** → back to `payment_pending`; `paid_at` cleared
      (re-check via SQL or by re-entering the flow).
- [ ] **제작 시작** → `making`; production flow (`making → ready →
      completed`) still works via the status dropdown.
- [ ] From `making`, the dropdown still lists `paid` (step-back).

### Cancel
- [ ] **주문 취소** from `pricing_pending` and from `payment_pending` with
      reason `미입금` → order `cancelled`; customer page shows the generic
      cancel line plus the non-payment sentence (reason contains `입금`).
- [ ] Cancel with an empty reason → `cancellation_reason` stored as `NULL`.

### Customer page (`/orders/[orderId]`, incognito / another device)
- [ ] `pricing_pending`: badge "확인 중", no financial info.
- [ ] `payment_pending`: badge "입금 대기"; amount, bank line, `예금주`,
      emphasised `입금자명`, deadline (absolute once requested, else
      "{hours}시간 이내"), instructions if set, footer line.
- [ ] `payment_pending` with bank info missing → "결제 정보 준비 중입니다"
      fallback, no partial bank block.
- [ ] `paid`: badge "입금 확인" + confirmation line.
- [ ] `making` / `ready` / `completed`: production status as before.
- [ ] Bad / non-UUID `orderId` → generic "Order not found".

### Customer ordering still works (regression)
- [ ] Complete a new order through `/s/[storeSlug]/order` (design →
      preview → reference photos → pickup → contact → submit).
- [ ] The new order appears in `/admin/[storeSlug]/orders` at
      `pricing_pending` with `견적 —`.

### Tenant isolation
- [ ] Signed in as a member of store A, `store_payment_settings` for store
      B is not readable (SQL check with that user's JWT, or trust the
      `store_members` join in `0004`).

---

## 6. Deploy

- [ ] SQL migrations §1 applied to the production Supabase project **before**
      the app deploy (the new code references the new enum values and
      columns at runtime).
- [ ] Merge `feat/v1-payment-workflow` → `main`.
- [ ] Vercel builds and promotes to production.
- [ ] Smoke test on production: load `/admin/[storeSlug]/orders`, open one
      order, load its `/orders/[orderId]` page.

---

## 7. Post-deploy

- [ ] Each pilot store's `stores.timezone` is set to `Asia/Seoul` (spec
      §10 open question 1) — deadline formatting is wrong on the default
      `UTC`. Check: `select slug, timezone from stores;`.
- [ ] Each pilot store has completed `/admin/[storeSlug]/settings` (bank
      details) before taking real orders.
- [ ] Watch server logs for `[admin] setQuote failed` / `markAsPaid
      failed` / `payment settings save failed`.

## 8. Rollback

- Code: revert the merge commit and redeploy. The app tolerates the new
  DB columns being present while the old code runs (they are simply
  unused) — **except** the enum: old code expects `new` / `in_progress`.
- If a full rollback is needed, run the inverse enum swap
  (`pricing_pending → new`, `payment_pending → new`, `paid → new`,
  `making → in_progress`) and drop the six columns + `store_payment_settings`.
  Given all data is still synthetic at pilot start, recreating the schema
  from scratch is also acceptable.
