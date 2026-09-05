# Final Database Review (Pre-`schema.sql`)

Last pass over the approved MVP schema
([`02_DB_Schema.md`](./02_DB_Schema.md),
[`04_MVP_Reduction.md`](./04_MVP_Reduction.md)) before generating
[`07_schema.sql`](./07_schema.sql). This review re-applies the same
"smallest possible MVP" pressure one more time, specifically against
columns and design choices that survived earlier cuts — and reverses a
couple of earlier calls that don't hold up under stricter scrutiny.

**Confirmed constraints for this pass:** solo founder, one core
transaction (order in → order tracked → order fulfilled), AI previews
are text-only and only the selected one is ever stored, reference
images are shop-production-reference only and never gate or select
anything.

---

## 1. Database Schema — Table-by-Table Review

### `stores`

| Column (prior plan) | Verdict | Reasoning |
|---|---|---|
| `slug`, `name` | **Keep** | Core identity — required for tenant routing. |
| `timezone` | **Keep** | Actually used: pickup-date lead-time validation needs to reason in the store's local time, not server UTC (see [`03_Architecture.md` §10](./03_Architecture.md#10-scaling-risks--mitigations)). Not speculative. |
| `default_locale` **+** `supported_locales[]` | **Cut → collapse to one `locale` column** | Two columns doing the job of "which language does this store default to." `supported_locales` implied a per-store language-restriction feature (some stores support fewer languages than others) that nothing in the PRD asks for — MVP ships all three languages (ko/ja/en) everywhere, always. One `locale` column (the storefront's default before a customer switches) is all that's used. |
| `country_code` | **Cut for MVP** | Zero MVP feature reads this column — it was added speculatively for a future Stripe-vs-Toss routing decision. Adding it back in Phase 2, when a real payment-routing feature needs it, is a trivial additive `ALTER TABLE`, so keeping it unused today buys nothing. |
| `status` (text: active/suspended/onboarding) | **Cut → replace with `is_active boolean`** | "Onboarding" has no meaning without an onboarding flow (there isn't one — stores are provisioned by hand). The only real MVP need is "can the founder switch a store's public page off" — a boolean covers that in one bit instead of an open-ended text enum. |

### `store_members`

| Column | Verdict | Reasoning |
|---|---|---|
| `store_id`, `user_id` | **Keep** | The entire point of the table: is this auth user allowed into this store's `/admin`. |
| `role` | **Already cut** (confirmed) | No owner/staff distinction exists yet; re-added in Phase 2 alongside staff invites. |
| `invited_by` | **Cut** | Attribution for an invite flow that doesn't exist in MVP — every membership row is created by hand in Supabase Studio by the founder. Nothing reads this column. Reintroduce with the real invite feature in Phase 2. |

### `customers`

| Column | Verdict | Reasoning |
|---|---|---|
| `store_id`, `auth_user_id`, `name`, `phone`, `email` | **Keep** | Directly used by the order flow and by RLS (`auth_user_id = auth.uid()`). |
| `preferred_locale` | **Cut for MVP** | Nothing in the approved MVP flow reads it back — the confirmation email (§9 of the implementation plan) can use the same locale the customer was actively using in the browser at submit time (passed as a value in the submit request, not persisted) or simply default to the store's `locale`. Storing a column that's written once and never read is exactly the kind of speculative field this review is for. |
| `updated_at` | **Not added** | A customer row in MVP is written once at order-submit time and never edited afterward — there is no "edit my contact info" feature. An `updated_at` column that's set once and never changes again is dead weight (and a maintenance trap: a future column that silently never updates is worse than no column). |

### `orders`

| Column (prior plan) | Verdict | Reasoning |
|---|---|---|
| `store_id`, `customer_id`, `description`, `pickup_date`, `status` | **Keep** | The transaction record itself. |
| `pickup_time_start` **+** `pickup_time_end` | **Cut → collapse to one `pickup_time`** | The two-column range was inherited from the capacity/slot-engine design, which was already cut in [`04_MVP_Reduction.md`](./04_MVP_Reduction.md). With no slot engine, there is no "slot duration" to represent — a single point-in-time pickup time is all the flow collects and all the shop dashboard needs to show. |
| `customer_note` (separate from `description`) | **Cut** | This duplicated `description` — both were "free text from the customer." MVP's ordering flow collects exactly one free-text field (the design description); a second, undifferentiated note field invites confusion about which one the shop should read. One field, `description`. |
| `ai_preview_storage_path`, `ai_preview_prompt` | **Keep, and made `NOT NULL`** | This is the corrected replacement for the old `ai_previews` table (only the selected preview is ever persisted, per this session's requirement). Making both `NOT NULL` is a *new, stricter* decision this pass: the customer's own workflow (steps 2–4) makes selecting a preview mandatory before they can proceed to pickup/submit, so an order without a stored preview shouldn't be representable in the schema at all — catch that at the database level, not just in application logic. |
| `internal_note` | **Keep** | Cheapest possible replacement for the cut `order_notes` table; directly used by the admin dashboard. |
| `price_cents`, `currency`, `payment_status` | **Reversed: cut for MVP** | `04_MVP_Reduction.md` originally kept these as "unused but present, near-zero cost, avoids a Phase 2 migration." On stricter review, that reasoning doesn't hold: adding a nullable column later is *also* a trivial, non-breaking migration — there's no real cost being avoided by keeping them now, only unused schema surface today. Cutting them is the more honest "smallest possible MVP" call; they come back in Phase 2 exactly when Stripe/Toss integration needs them. |
| `updated_at` | **Keep** | Unlike `customers`, `orders` rows are genuinely mutated after creation — status changes are the core of the admin dashboard's job. |

### `reference_images`

| Column | Verdict | Reasoning |
|---|---|---|
| `store_id`, `order_id`, `storage_path`, `position` | **Keep** | Core to the feature; `store_id` denormalized for RLS/storage-path consistency with every other tenant table. |
| `cdn_url` | **Cut** | The implementation plan ([`05_MVP_Implementation_Plan.md` §7](./05_MVP_Implementation_Plan.md#7-admin-dashboard-implementation-plan)) already decided images are served via short-lived **signed URLs generated at read time**, not a cached/stored URL — so a `cdn_url` column would never be written to or read from. Same logic removes the equivalent field from `orders`' preview columns (no `ai_preview_cdn_url`). |
| `updated_at` | **Not added** | A reference image is uploaded once and never edited — same reasoning as `customers`. |

---

## 2. Table Relationships

```
stores 1───* store_members
stores 1───* customers
stores 1───* orders
orders 1───* reference_images   (0 to 3 rows — optional, per workflow step 5)
customers 1───* orders
```

- `orders.customer_id` is `on delete restrict` — an order is a
  transaction record; a customer row should never be able to
  disappear out from under a real order (there is currently no
  "delete customer" feature, but the constraint documents the intended
  invariant either way).
- `reference_images.order_id` is `on delete cascade` — reference photos
  have no independent meaning once their order is gone.
- **No relationship represents "selected reference image"** — confirmed
  correct per this session's requirement; reference images are never a
  selectable design option, so there is nothing to model as a selection
  (this was already fixed in the prior architecture round and is
  reconfirmed here, not reopened).
- **No `ai_previews` table**, and therefore no relationship to one —
  the selected preview is two plain columns on `orders`, not a foreign
  key to a child table, which is the direct schema expression of "only
  the final selected preview is stored."

This is now a **strict tree**, one level deep past `stores`, with a
single optional child (`reference_images`) off `orders`. There is no
table in this schema whose purpose is only to join two other tables —
every table is either the tenant root, a membership row, or a real
business record.

---

## 3. Future Scalability

The schema is deliberately narrow, but every likely Phase 2/3 addition
is **additive**, not a restructuring:

| Future need | How it's added | Breaking? |
|---|---|---|
| Staff roles | `ALTER TABLE store_members ADD COLUMN role ...` | No |
| Payments (Stripe/Toss) | `ALTER TABLE orders ADD COLUMN price_cents ...` + new `payments` table | No |
| AI generation history/analytics | New `ai_previews` table, populated going forward; existing `orders.ai_preview_*` columns keep working unchanged as "the winner" | No |
| Order status history / audit trail | New `order_status_history` table, written to going forward | No |
| Notification channels beyond email | New `notifications_outbox` table + channel modules | No |
| Store capacity/blackout dates | New `pickup_blackouts` table; `orders.pickup_time` unaffected | No |
| Cross-store customer identity | Additive linking table, opt-in; today's one-`customers`-row-per-store model is untouched | No |
| Platform-level admin console | New `platform_admins` table; nothing in this schema references it | No |

The one column worth flagging as a **soft constraint to watch**:
`orders.status` as a Postgres enum. Postgres allows `ALTER TYPE ...
ADD VALUE` (additive, safe) but does **not** allow easily removing or
renaming a value once used by existing rows. This is an acceptable,
well-understood tradeoff — just don't rename `'new'`/`'ready'`/etc.
later; add new values instead of repurposing old ones.

---

## 4. Multi-Tenant Design

Unchanged from the approved architecture, reconfirmed as right-sized:

- `store_id` is denormalized onto every tenant-scoped table
  (`store_members`, `customers`, `orders`, `reference_images`), even
  where it's technically derivable via a join (e.g.
  `reference_images.store_id` could be reached via `order_id →
  orders.store_id`). This is **intentional, not redundant data** — it's
  what lets every RLS policy be a single flat predicate on the row
  itself instead of a subquery through a parent table, which is both
  simpler to write correctly and cheaper to execute (index on `store_id`
  directly, no join required at policy-evaluation time).
- No shared/global business tables exist outside this tenant tree for
  MVP — `stores` itself is the only cross-tenant-visible table, and it
  carries no customer or order data.

No changes recommended here — this part was already minimal.

---

## 5. Storage Strategy

- Two buckets: `reference-images`, `ai-previews` (a third,
  `store-branding`, is Phase 2 — nothing in MVP uploads a logo).
- Path convention: `{store_id}/{order_id}/{file}` — unchanged, still the
  right call (see [`02_DB_Schema.md` §6](./02_DB_Schema.md#6-storage-buckets-supabase-storage)).
- **Correction confirmed in this pass:** neither bucket needs a
  `cdn_url` column anywhere in the database (§1 above) — both are
  private buckets read via server-generated signed URLs at request
  time, per the implementation plan. This removes two columns that
  would otherwise sit unused.
- No Cloudflare proxy layer for MVP (already decided in
  [`04_MVP_Reduction.md`](./04_MVP_Reduction.md)) — Supabase Storage's
  own delivery is sufficient at pilot-shop volume.

---

## 6. RLS Strategy

Simplified relative to the original architecture doc now that
`store_role` doesn't exist for MVP — every staff-side policy collapses
to one shape:

```sql
store_id in (select store_id from store_members where user_id = auth.uid())
```

applied identically to `orders`, `reference_images` (via `store_id`
directly, no join needed — see §4), and read access to `customers` for
the store's own orders. There is no owner-vs-staff branching to encode
yet.

Customer-side policies collapse to:

```sql
customer_id in (select id from customers where auth_user_id = auth.uid())
```

for `orders` (and the equivalent direct check for `customers` itself),
covering **guests and full accounts identically** since both hold a
real Supabase session (Anonymous Auth for guests, per
[`03_Architecture.md` §3.1](./03_Architecture.md#31-identity-provider)).

`reference_images` needs one additional customer-side policy beyond
staff read access: **insert-only**, scoped to rows whose `order_id`
belongs to an order the inserting customer owns — this is what lets the
browser upload reference photos directly to Storage/the table without
any server-side signing code, while still being unable to attach images
to someone else's order.

RLS policies themselves are **not** included in `07_schema.sql` (kept as
a separate migration, per the sequencing already set in
[`05_MVP_Implementation_Plan.md` §5](./05_MVP_Implementation_Plan.md#5-supabase-setup-plan) —
schema first, policies second, tested independently before either meets
application code). `07_schema.sql` does enable RLS on every tenant table
with no policies yet attached, which in Postgres/Supabase means **all
access is denied by default** until policies are added — the safe
default, never an accidentally-open table.

---

## 7. Summary: What Changed From the Previously Approved Schema

**Removed (unnecessary tables):** none beyond what was already removed
in [`04_MVP_Reduction.md`](./04_MVP_Reduction.md) — no new table-level
cuts this pass. The table list (`stores`, `store_members`, `customers`,
`orders`, `reference_images`) was already minimal.

**Removed (unnecessary columns), newly cut in this pass:**
- `stores`: `supported_locales`, `country_code`, `status` (→ `is_active`)
- `store_members`: `invited_by`
- `customers`: `preferred_locale`
- `orders`: `pickup_time_end` (merged into single `pickup_time`),
  `customer_note` (merged into `description`), `price_cents`,
  `currency`, `payment_status`
- `reference_images`: `cdn_url`

**Tightened (new constraint, not a removal):**
- `orders.ai_preview_storage_path` / `ai_preview_prompt` are now
  `NOT NULL` — the schema now enforces that an order cannot exist
  without a selected AI preview, matching the mandatory step in the
  customer workflow.

**Over-engineered patterns avoided (confirmed, not new):** no
`ai_previews` child table for unselected candidates, no "selected
reference image" relationship, no capacity/slot engine columns, no
role/permission columns without a feature that reads them.

**Future migration risk:** low. Every deferred feature is additive
(§3); the one thing to be disciplined about going forward is treating
`order_status` enum values as append-only, never renamed or removed.

Proceeding to [`07_schema.sql`](./07_schema.sql) with this finalized
column set.
