# V1 Payment Workflow — Product Specification

Implementation-ready specification for the Cake Lovers V1 manual-payment
workflow. Companion to
[`02_DB_Schema.md`](./02_DB_Schema.md),
[`07_schema.sql`](./07_schema.sql), and
[`14_Business_Workflow_Roadmap.md`](./14_Business_Workflow_Roadmap.md) —
this document supersedes the §2/§3/§7 sketches in doc 14 with concrete
columns, states, UI, and migration steps. **No code in this document.**

---

## 0. Scope and decisions locked

In V1:

- **Manual bank transfer only.** No payment gateway, no bank API, no
  automated reconciliation.
- **Full amount, one payment.** No deposit/balance split in V1 (revisit
  post-pilot — see §9).
- **No pricing enforcement, no subscription billing, no plan limits.**
  Every feature in this spec is available to every store during the
  pilot. "Starter / Growth / Pro" exist only in a pricing doc.
- **Full customer + order history for everyone.**
- The customer order page stays **public, unguessable-UUID access**, no
  customer login — consistent with
  [`03_Architecture.md` §3.1](./03_Architecture.md).

Out of V1 (see §9): AlimTalk automation, payment screenshot upload,
customer "I've paid" button, overdue reminders, Kanban board, deposit
support, CRM, billing.

---

## 1. Database changes

Two new migrations, applied with `supabase db push` (same flow as
[`09_Supabase_Execution_Checklist.md` §5](./09_Supabase_Execution_Checklist.md)).
Existing migration files are `0001_schema.sql` and `0002_rls_policies.sql`;
these are `0003` and `0004`.

### 1.1 `orders` — new columns

| Column | Type | Null | Notes |
|---|---|---|---|
| `quoted_price_krw` | `integer` | yes | KRW has no subunit — store won directly, no cents scaling. `CHECK (quoted_price_krw IS NULL OR quoted_price_krw > 0)`. `NULL` until the owner quotes. |
| `payment_requested_at` | `timestamptz` | yes | Stamped the first time the owner copies the payment message. Not re-stamped on subsequent copies. Drives the deadline shown to the customer. |
| `paid_at` | `timestamptz` | yes | Stamped when the owner clicks **Mark as paid**. Cleared if the order is moved back to `payment_pending`. |
| `paid_confirmed_by` | `uuid` | yes | `REFERENCES auth.users(id) ON DELETE SET NULL`. Audit only in V1 — not surfaced in the UI. |
| `payment_reference` | `text` | yes | The 입금자명 string the customer must transfer under. Computed once when the quote is entered (§5.2) and stored so it stays stable even if the customer row changes. |
| `cancellation_reason` | `text` | yes | Free text captured in the cancel dialog (e.g. `미입금`). Optional; shown to staff, and used to tailor the customer page copy for a non-payment cancellation. |

All six are covered by the **existing** `orders` RLS policies
(`"customers and staff can view relevant orders"` for SELECT,
`"staff can update their store's orders"` for UPDATE, per
[`09` §7](./09_Supabase_Execution_Checklist.md)). **No new `orders`
policy is required** — state this explicitly in the migration comment so
a reviewer doesn't go looking.

### 1.2 Bank account settings — new table `store_payment_settings`

A dedicated 1:1 table, **not** columns on `stores`, for one reason: the
`"public can view active stores"` policy is `TO anon, authenticated
USING (is_active = true)`, so any column added to `stores` becomes
readable by anyone holding the anon key for every active store. Bank
account numbers should not be bulk-harvestable. A separate table with a
members-only policy keeps them off the public row; the storefront reads
them through the service-role client it already uses (§4.1).

```
store_payment_settings
  store_id                uuid  PK  REFERENCES stores(id) ON DELETE CASCADE
  bank_name               text  null
  bank_account_number     text  null
  bank_account_holder     text  null   -- 예금주; shown so the customer verifies before sending
  payment_instructions    text  null   -- optional free line, e.g. "입금자명을 꼭 확인해 주세요"
  payment_deadline_hours  integer NOT NULL DEFAULT 24
                                CHECK (payment_deadline_hours BETWEEN 1 AND 168)
  updated_at              timestamptz NOT NULL DEFAULT now()
```

- Reuse the existing `set_updated_at()` trigger function
  (`07_schema.sql`) for `updated_at`.
- One row per store, created lazily on first save (upsert on
  `store_id`).
- `ALTER TABLE store_payment_settings ENABLE ROW LEVEL SECURITY`.

### 1.3 `order_status` enum replacement

The current enum is `('new','in_progress','ready','completed',
'cancelled')`. V1 needs `pricing_pending`, `payment_pending`, `paid`,
`making` and retires `new` and `in_progress`. Postgres can add enum
values cheaply but cannot rename/remove an in-use value without a type
swap. Per [`14` §5](./14_Business_Workflow_Roadmap.md), **do the full
swap now** — every existing order is synthetic test data, so this is the
cheapest this change will ever be.

Swap steps (in `0003`):

1. `CREATE TYPE order_status_new AS ENUM ('pricing_pending',
   'payment_pending','paid','making','ready','completed','cancelled');`
2. `ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;`
3. `ALTER TABLE orders ALTER COLUMN status TYPE order_status_new USING (
   CASE status::text
     WHEN 'new'         THEN 'pricing_pending'
     WHEN 'in_progress' THEN 'making'
     ELSE status::text
   END::order_status_new);`
4. `ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'pricing_pending';`
5. `DROP TYPE order_status;`
6. `ALTER TYPE order_status_new RENAME TO order_status;`

Mapping summary: `new → pricing_pending`, `in_progress → making`,
`ready/completed/cancelled` unchanged. Column default moves from `'new'`
to `'pricing_pending'`.

> After real pilot orders exist in the new states, any further enum
> change repeats this dance — note it for whoever builds the Kanban
> phase.

---

## 2. Order lifecycle

```
pricing_pending ─▶ payment_pending ─▶ paid ─▶ making ─▶ ready ─▶ completed
        │                  │            │        │        │
        └──────────────────┴────────────┴────────┴────────┴──▶ cancelled
                                        ▲                │
                                        └────────────────┘  (one step back)
```

### 2.1 State meanings

| State | Meaning |
|---|---|
| `pricing_pending` | Order submitted by the customer. Awaiting the owner's quote. **Default for every new order.** |
| `payment_pending` | Quote entered. Awaiting the bank transfer and the owner's confirmation. |
| `paid` | Owner has manually confirmed the transfer landed. Production may begin. |
| `making` | In production. (Was `in_progress`.) |
| `ready` | Ready for pickup. |
| `completed` | Picked up / done. Terminal. |
| `cancelled` | Cancelled from any non-terminal state. Terminal. |

### 2.2 Transition map (replaces `VALID_STATUS_TRANSITIONS` in `src/lib/admin/order-status.ts`)

| From | Allowed next |
|---|---|
| `pricing_pending` | `payment_pending`, `cancelled` |
| `payment_pending` | `paid`, `cancelled` |
| `paid` | `making`, `payment_pending` (bounced/reversed transfer), `cancelled` |
| `making` | `ready`, `paid` (started by mistake), `cancelled` |
| `ready` | `completed`, `cancelled` |
| `completed` | — |
| `cancelled` | — |

The one-step-back allowances (`paid → payment_pending`,
`making → paid`) come from [`14` §1](./14_Business_Workflow_Roadmap.md).
Everything else stays strict-forward.

### 2.3 Which transitions are dropdown vs. dedicated action

- `pricing_pending → payment_pending` — **only** via the *Enter quote*
  action (§3.1). Never offered in the status dropdown.
- `payment_pending → paid` — **only** via the *Mark as paid* action
  (§3.4). Never offered in the status dropdown.
- `* → cancelled` — via the *Cancel order* action (§3.5), which also
  captures a reason.
- `paid → making`, `making → ready`, `ready → completed`, and the
  documented step-backs — via the existing `StatusUpdateForm` dropdown.
  **Fix required:** the dropdown currently renders *all* statuses; it
  must render only `[currentStatus, ...allowedNext]`.

### 2.4 Invariants (enforced in Server Actions; DB triggers noted as hardening)

1. `pricing_pending → payment_pending` requires `quoted_price_krw IS NOT
   NULL AND > 0`. Enforced in the `setQuote` action. Optional hardening:
   a `BEFORE UPDATE` trigger rejecting the transition when the price is
   null.
2. `quoted_price_krw` is editable while status is `pricing_pending` or
   `payment_pending`. It is **frozen** once status is `paid` or later.
   Editing it in `payment_pending` does **not** change status and does
   **not** clear `payment_requested_at`.
3. `paid_at` and `paid_confirmed_by` are set together on `Mark as paid`
   and cleared together on `paid → payment_pending`.
4. `payment_reference` is computed exactly once, at first quote entry,
   and never recomputed.
5. `payment_requested_at` is set on the first *Copy payment message*
   and never overwritten.
6. `cancellation_reason` is written only by the *Cancel order* action.

---

## 3. Admin UI

All changes are on `/admin/[storeSlug]/orders/[orderId]`
(`src/app/admin/[storeSlug]/orders/[orderId]/page.tsx`) plus a new
settings page. A new **Payment** section renders between the status
control and the "AI-generated design" section, switching on
`order.status`.

### 3.1 Enter quote — state `pricing_pending`

- **Fields:** one integer input, label `견적 금액 (₩)`. Accepts digits
  only; strip commas on submit.
- **Button:** `견적 저장` (Save quote).
- **Server Action `setQuote(storeSlug, orderId, amountKrw)`:**
  1. Re-read order, assert status is `pricing_pending` and belongs to
     the store.
  2. Validate `amountKrw` is an integer `> 0` (reject `0`, negatives,
     non-numeric).
  3. Compute `payment_reference` (§5.2).
  4. `UPDATE orders SET quoted_price_krw = $1, payment_reference = $2,
     status = 'payment_pending'`.
  5. `revalidatePath` the list and detail routes.
- **Helper text:** "견적을 저장하면 주문이 '입금 대기' 상태로 넘어갑니다."

### 3.2 Show / edit quote — state `payment_pending`

- Display: `견적 금액: ₩68,000` using
  `Intl.NumberFormat('ko-KR')`.
- **Edit quote** toggles the same input inline. Submitting calls
  `updateQuote(storeSlug, orderId, amountKrw)` — same validation as
  §3.1 but **no status change** and **no reference recompute**.
- If `payment_requested_at IS NOT NULL`, show a subtle reminder:
  "금액을 수정하면 고객에게 새 메시지를 다시 보내야 합니다." (V1 does
  not auto-notify — see §5.4.)

### 3.3 Request payment / copy message — state `payment_pending`

- **Guard:** if the store has no `store_payment_settings` row, or
  `bank_account_number` is blank, replace the button with:
  "결제 메시지를 만들려면 먼저 [설정]에서 계좌 정보를 입력하세요."
  linking to §3.6. Button disabled until bank info exists.
- **Button:** `결제 메시지 복사` (Copy payment message).
- Behaviour (client component):
  1. Server component renders the fully-built message string (§5) into
     the client component as a prop.
  2. On click: `navigator.clipboard.writeText(message)` (HTTPS-only;
     fine on the Vercel domain).
  3. Fire-and-await a light Server Action `markPaymentRequested(
     storeSlug, orderId)` that sets `payment_requested_at = now()`
     **only if currently null**.
  4. Show a transient "복사되었습니다" confirmation.
- After `payment_requested_at` is set, show "요청함 · {relative time}".
- Re-copying is always allowed and just re-copies the current text.

### 3.4 Mark as paid — state `payment_pending`

- **Button:** `입금 확인` (Mark as paid), visually primary.
- **Confirm dialog:** "입금을 확인하셨나요? '결제 완료'로 변경되며
  제작을 시작할 수 있습니다." — Confirm / Cancel.
- **Server Action `markAsPaid(storeSlug, orderId)`:**
  1. Re-read; assert status is `payment_pending`.
  2. `UPDATE orders SET status = 'paid', paid_at = now(),
     paid_confirmed_by = auth.uid()`.
  3. `revalidatePath`.

### 3.5 Cancel order — states `pricing_pending`, `payment_pending` (and later stages via existing flow)

- **Button:** `주문 취소`.
- **Dialog:** reason input, label `취소 사유 (선택)`, placeholder
  `예: 미입금`.
- **Server Action `cancelOrder(storeSlug, orderId, reason)`:**
  1. Re-read; assert status is non-terminal.
  2. `UPDATE orders SET status = 'cancelled', cancellation_reason =
     NULLIF(trim($1), '')`.
  3. `revalidatePath`.

### 3.6 State `paid` and later

- Payment section collapses to a read-only summary: `견적 금액`,
  `입금 확인 시각` (`paid_at`, formatted in `stores.timezone`),
  `입금자명` (`payment_reference`).
- **Primary button on `paid`:** `제작 시작` → status dropdown value
  `making` (or a dedicated button calling the existing
  `updateOrderStatus`).
- **Undo payment** (secondary, on `paid`): confirm dialog → Server
  Action `undoPayment` → `status = 'payment_pending'`, `paid_at = NULL`,
  `paid_confirmed_by = NULL`. Copy: "입금이 취소/반려된 경우에만
  사용하세요."

### 3.7 Store settings page — new route `/admin/[storeSlug]/settings`

- Guarded by `getStoreMembership` exactly like the orders routes.
- One form, unstyled is acceptable for V1:
  `은행명`, `계좌번호`, `예금주`, `추가 안내 문구 (선택)`,
  `입금 기한 (시간)` (number, default 24, min 1, max 168).
- **Server Action `savePaymentSettings(storeSlug, values)`:** upsert
  into `store_payment_settings` keyed on `store_id`. Trim all text;
  store empty strings as `NULL`.
- Add a link to this page from the admin header
  (`src/app/admin/[storeSlug]/layout.tsx`).

### 3.8 Order list page

- `src/app/admin/[storeSlug]/orders/page.tsx`: add a `견적` column
  showing `₩{quoted_price_krw}` or `—`.
- Verify the new status values render acceptably. `formatStatusLabel`
  only replaces the first `_`, which is fine for these values
  (`payment_pending → "payment pending"`). A `STATUS_LABELS` map (Korean
  labels) is the eventual home for localization — not required for V1
  since the admin UI is otherwise English, but create the map now so
  labels live in one place.

---

## 4. Customer order page

`src/app/orders/[orderId]/page.tsx`. Already public, already reads via
the service-role client. No auth change.

### 4.1 Query changes

- Extend the existing `orders` select to also pull:
  `quoted_price_krw, payment_requested_at, paid_at, payment_reference,
  cancellation_reason`.
- Add a **second** service-role query (or a nested select) for
  `store_payment_settings` by the order's `store_id`, selecting
  `bank_name, bank_account_number, bank_account_holder,
  payment_instructions, payment_deadline_hours`.
- `store_payment_settings` is **never** exposed through any
  anon-accessible route — only this server component, only for the
  store of the order being viewed.

### 4.2 Rendering by status

| Status | What the customer sees |
|---|---|
| `pricing_pending` | Badge "확인 중". Text: "주문이 접수되었어요. 사장님이 디자인을 확인한 뒤 견적을 알려드립니다." No price, no bank info. |
| `payment_pending` | Badge "입금 대기". Full payment block (§4.3). |
| `paid` | Badge "입금 확인". Text: "입금이 확인되었습니다. 곧 제작이 시작돼요." |
| `making` / `ready` / `completed` | Production status exactly as today. |
| `cancelled` | Text: "주문이 취소되었습니다." If `cancellation_reason` contains a non-payment note, still show the generic line; if it clearly indicates non-payment (owner's discretion), append: "입금이 확인되지 않아 취소되었습니다. 다시 주문해 주세요." |

### 4.3 `payment_pending` payment block

Rendered only in this state (and never with empty bank fields — if bank
info is somehow missing, show "결제 정보 준비 중입니다. 사장님의 안내를
기다려 주세요." instead):

- **결제 금액:** `₩{quoted_price_krw}` (`ko-KR` formatting).
- **입금 계좌:** `{bank_name} {bank_account_number}` /
  `예금주: {bank_account_holder}`.
- **입금자명 (중요):** `{payment_reference}` — visually emphasised, with
  the line "이 이름으로 정확한 금액을 입금해 주세요. 입금자명이 다르면
  확인이 늦어질 수 있어요."
- **입금 기한:** if `payment_requested_at` is set,
  `{payment_requested_at + payment_deadline_hours}` formatted as
  `M월 D일 HH:mm` in `stores.timezone`; otherwise
  `{payment_deadline_hours}시간 이내`.
- **{payment_instructions}** if present.
- Footer: "입금 후 사장님이 확인하면 제작이 시작됩니다. 확인까지 시간이
  걸릴 수 있어요."

No customer-facing action button in V1 (the "입금했어요" button is §9).

---

## 5. Payment request message template

### 5.1 The template (single hardcoded Korean string)

Built by a **pure function** `buildPaymentMessage(input)` in a new
`src/lib/payments/payment-message.ts`, unit-tested, called from the
admin order-detail server component.

```
[{store_name}] 주문 결제 안내

안녕하세요, {customer_name}님!
주문하신 케이크의 견적이 확정되었습니다.

• 주문 내용: {description_short}
• 픽업: {pickup_date} {pickup_time}
• 결제 금액: {amount}원

■ 입금 계좌
{bank_name} {bank_account_number}
예금주: {bank_account_holder}

■ 입금자명 (아래 이름으로 입금해 주세요)
{payment_reference}
{payment_instructions_block}
■ 입금 기한
{deadline_hours}시간 이내 ({deadline_datetime}까지)

입금이 확인되면 제작이 시작됩니다.
주문 상태는 아래 링크에서 확인하실 수 있어요.
{order_url}
```

### 5.2 Token sources and formatting

| Token | Source | Formatting |
|---|---|---|
| `{store_name}` | `stores.name` | verbatim |
| `{customer_name}` | `customers.name` | verbatim |
| `{description_short}` | `orders.description` | first 40 chars; append `…` if truncated; collapse newlines to spaces |
| `{pickup_date}` | `orders.pickup_date` | `YYYY. M. D.` |
| `{pickup_time}` | `orders.pickup_time` | `HH:mm` |
| `{amount}` | `orders.quoted_price_krw` | `Intl.NumberFormat('ko-KR')` → `68,000` |
| `{bank_name}` `{bank_account_number}` `{bank_account_holder}` | `store_payment_settings` | verbatim |
| `{payment_reference}` | `orders.payment_reference` | verbatim (see §5.3) |
| `{payment_instructions_block}` | `store_payment_settings.payment_instructions` | if present: `\n{value}\n`; if null: empty string (no blank line) |
| `{deadline_hours}` | `store_payment_settings.payment_deadline_hours` | integer |
| `{deadline_datetime}` | `now()` at copy time `+ deadline_hours` | `M월 D일 HH:mm`, in `stores.timezone` |
| `{order_url}` | `${NEXT_PUBLIC_SITE_URL}/orders/${order.id}` | requires new env var `NEXT_PUBLIC_SITE_URL` (production domain) |

> The message uses `{deadline_datetime}` computed from `now()` at copy
> time, and `markPaymentRequested` stamps `payment_requested_at = now()`
> in the same click, so the message and the customer page agree.

### 5.3 `payment_reference` format

```
{name_stripped}-{SHORT}
```

- `name_stripped` = `customers.name` with whitespace removed, capped at
  10 characters.
- `SHORT` = last 4 hex characters of `orders.id`, uppercased.
- Example: `홍길동-3F9A`.
- Rationale: unique enough at a single shop's daily volume, short enough
  to type into a bank transfer 입금자명 field, and ties the transfer to
  one order. Computed once in `setQuote` and stored.

### 5.4 Delivery

- V1 delivery is **clipboard only**. The owner pastes into KakaoTalk /
  Instagram DM / SMS themselves.
- No automated send, no per-channel integration.
- Editing the quote after sending does **not** notify the customer —
  the owner re-copies and re-sends manually (§3.2 reminder text).

---

## 6. Migration plan

### 6.1 `supabase/migrations/0003_payment_workflow.sql`

1. `order_status` type swap (§1.3, steps 1–6).
2. `ALTER TABLE orders ADD COLUMN` for the six columns in §1.1, with the
   `quoted_price_krw` CHECK and the `paid_confirmed_by` FK.
3. `CREATE TABLE store_payment_settings` (§1.2) + `set_updated_at`
   trigger.
4. `ALTER TABLE store_payment_settings ENABLE ROW LEVEL SECURITY`.
5. Comment block stating that the new `orders` columns need **no** new
   policy (existing SELECT/UPDATE policies cover them).

### 6.2 `supabase/migrations/0004_payment_rls.sql`

`store_payment_settings` policies, mirroring the `store_members` join
pattern used everywhere else in `0002`:

| Policy | For | Predicate |
|---|---|---|
| `"members can view their store's payment settings"` | `SELECT` `TO authenticated` | `store_id IN (SELECT store_id FROM store_members WHERE user_id = auth.uid())` |
| `"members can insert their store's payment settings"` | `INSERT` `TO authenticated` | `WITH CHECK` (same predicate) |
| `"members can update their store's payment settings"` | `UPDATE` `TO authenticated` | `USING` + `WITH CHECK` (same predicate) |

No `DELETE` policy (settings are edited, never deleted). No `anon`
policy — the storefront reads this table via the service-role client
only.

### 6.3 Data migration

None beyond the enum `USING` cast. All existing orders are synthetic
test data ([`14` §5](./14_Business_Workflow_Roadmap.md)); there is
nothing to backfill. `quoted_price_krw` etc. are simply `NULL` on any
pre-existing test rows.

### 6.4 Application code that must ship in the same deploy

The migration cannot deploy alone — the app references the old enum
values at compile time. In the **same PR**:

- `src/lib/admin/order-status.ts` — replace `ORDER_STATUSES` and
  `VALID_STATUS_TRANSITIONS` with the §2 values/map. TypeScript will
  flag every stale `"new"` / `"in_progress"` reference; fix each.
- Add `NEXT_PUBLIC_SITE_URL` to `.env.local`, `.env.example`, and
  Vercel project env.
- Any seed/test helpers using the old status strings.

### 6.5 Verification

- `supabase db push` reports `0003` then `0004` applied.
- Re-run `supabase db push` → "nothing to apply" (idempotent, per
  [`09` §checklist](./09_Supabase_Execution_Checklist.md)).
- Existing admin order flow still loads; a test order shows status
  `pricing_pending`; the `making`/`ready`/`completed` path still works.
- Cross-tenant check unchanged: a member of store A cannot
  `SELECT`/`UPDATE` store B's `store_payment_settings`.

---

## 7. Implementation order

Each step is independently shippable and testable. Steps 1–9 are the V1
payment feature; step 10 is a parallel launch-blocker.

1. **Migrations `0003` + `0004` + `order-status.ts` update + env var.**
   One PR. Deploy. Verify §6.5.
2. **Store payment settings** — `store_payment_settings` read/write,
   `savePaymentSettings` action, the `/admin/[storeSlug]/settings` form,
   header link. Prerequisite for the message.
3. **`payment_reference` + `setQuote` action + Enter-quote UI**
   (`pricing_pending → payment_pending`). Payment section, `pricing_pending`
   branch only.
4. **`buildPaymentMessage` pure function + unit tests.** Depends on 2
   (bank fields) and 3 (`payment_reference`, `quoted_price_krw`).
5. **Copy-payment-message button + `markPaymentRequested` action** —
   `payment_pending` branch, including the "add bank settings first"
   guard.
6. **Mark-as-paid + confirm dialog + `markAsPaid` action**
   (`payment_pending → paid`); `paid` branch UI with `제작 시작` and
   `Undo payment`.
7. **Cancel-with-reason** (`cancelOrder` action, `cancellation_reason`)
   from `pricing_pending` / `payment_pending`.
8. **Customer order page** — payment-state rendering (§4), extended
   service-role query, `store_payment_settings` read.
9. **Order list** — `견적` column; `STATUS_LABELS` map; dropdown option
   filtering fix (§2.3).
10. **PIPA baseline (parallel track, launch-blocking, independent of the
    payment code):** consent checkbox + `privacy_consented_at` at order
    submission (`src/app/api/stores/[storeSlug]/orders/route.ts`),
    a privacy policy page, and a stated retention period.

### Can wait until after launch (see §9)

Kanban board; "입금했어요" customer button; overdue flag + reminder
message; "cake is ready" copy-message; deposit / `amount_requested_krw`;
AlimTalk automation; screenshot upload; CRM; subscription billing;
payment gateway; i18n; auto-cancel on deadline.

---

## 8. Acceptance criteria

- A new order is created with status `pricing_pending` and no price.
- Saving a valid quote moves it to `payment_pending`, stores
  `quoted_price_krw`, and stores a stable `payment_reference` of the
  form `이름-XXXX`.
- Saving a quote of `0`, a negative, or non-numeric input is rejected
  with a visible error and no state change.
- With bank settings unset, the copy-message button is disabled and
  points the owner to settings.
- With bank settings set, the copied message contains: store name,
  customer name, truncated description, pickup date/time, formatted
  amount with `원`, bank line, `예금주`, `payment_reference`, deadline in
  hours **and** an absolute datetime, and the correct
  `NEXT_PUBLIC_SITE_URL` order link.
- First copy stamps `payment_requested_at`; subsequent copies do not
  change it.
- Editing the quote in `payment_pending` changes the amount, keeps the
  status and `payment_reference`, and does not clear
  `payment_requested_at`.
- Mark-as-paid moves `payment_pending → paid` and sets `paid_at` +
  `paid_confirmed_by`.
- Undo-payment moves `paid → payment_pending` and nulls both.
- Cancelling from `payment_pending` sets `cancelled` +
  `cancellation_reason`.
- The customer page shows nothing financial in `pricing_pending`; shows
  amount + bank + reference + deadline in `payment_pending`; shows a
  confirmation line in `paid`.
- `store_payment_settings` is not readable by a member of a different
  store, nor via the anon key.
- `supabase db push` is idempotent on a second run.

---

## 9. Deferred — explicitly not in V1

| Item | Why deferred | Revisit trigger |
|---|---|---|
| Deposit / balance (`amount_requested_krw`) | Full-amount keeps V1 state trivial | A pilot shop asks for 예약금 (expected) |
| "입금했어요" customer button (`customer_marked_paid_at`) | Cheap, but not core | Fast-follow after launch |
| Overdue flag + one-click reminder message | Needs the list/board work | With the Kanban phase |
| "Cake is ready" copy-message | Same mechanism, new template | Fast-follow |
| Kakao AlimTalk automation | Per-shop Kakao channel + business reg + template approval + prepaid balance; concierge-onboard first | Post-PMF, when shops ask to stop copy-pasting |
| Payment screenshot upload + confirmation queue | Pro-tier enhancement | Post-PMF |
| CRM (tags, segments, export) | Pro-tier | Post-PMF |
| Subscription billing + plan enforcement | Tier lines unvalidated | After pilot usage data |
| Payment gateway (Toss / KakaoPay) | Manual confirm is sufficient at pilot volume | When reconciliation demonstrably breaks (volume / peak season) |
| Auto-cancel on deadline + slot logic | Risky without reminders | With reminders + capacity work |

---

## 10. Open questions

1. **Store timezone.** `stores.timezone` defaults to `'UTC'`. Deadline
   formatting (§5.2, §3.6) is wrong unless each pilot store is set to
   `'Asia/Seoul'`. Add it to store onboarding, or default new stores to
   `'Asia/Seoul'` for the pilot.
2. **`NEXT_PUBLIC_SITE_URL`.** Confirm the exact production domain to
   hardcode into env.
3. **`paid_confirmed_by` display.** Audit-only in V1 (no member
   directory to resolve names). Confirm that's acceptable, or add a
   minimal "confirmed by {email}" using the auth user.
4. **Description truncation length.** 40 chars is a guess; adjust after
   seeing real order descriptions.
5. **Non-payment cancellation copy.** §4.2 leaves it to owner
   discretion whether the customer sees "입금이 확인되지 않아
   취소되었습니다." Consider a structured `cancellation_reason` enum
   later instead of free text.
