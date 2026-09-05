# Business Workflow Roadmap

Companion to [`01_PRD.md`](./01_PRD.md) and
[`04_MVP_Reduction.md`](./04_MVP_Reduction.md). This is a review of the
current (deployed) workflow against a new target workflow requested for
the next phases, covering Kanban, pricing, payment confirmation, and
customer communication. **Analysis and recommendations only — nothing
in this document has been built.**

---

## 0. The New Target Workflow

```
Pricing Pending → Payment Pending → Paid → Making → Ready → Completed
                                                              → Cancelled (from any non-terminal state)
```

Compared to the currently deployed workflow (`new → in_progress → ready
→ completed`, `cancelled` from any non-terminal state), this is a
**superset that inserts a pricing/payment phase before production
begins**, and renames the production stage (`in_progress` → `making`).
This is not a small tweak — see §5 for why the schema/migration
implications matter before writing any code.

---

## 1. Kanban Workflow

**Current state:** a flat, sorted list (`orders/page.tsx`) — newest
first, one status badge, click through to a detail page with a
dropdown. No visual pipeline, no at-a-glance view of "how many orders
are stuck at each stage."

**Fit with the new target workflow:** very good. A 7-stage linear
pipeline (6 forward stages + 1 side-exit) is close to the canonical
Kanban shape — one column per status, cards move left to right, with
`Cancelled` reachable as a side exit rather than a column at the far
right (recommend NOT putting Cancelled as a 7th column in the visual
flow — it reads better as an action available on any card, with
cancelled orders filtered out of the default board view and reachable
via a separate "Cancelled" tab/filter, so the board itself stays a
clean 6-column forward pipeline).

**Recommendations:**
- **Evolve the existing order list page into the board**, rather than
  building a second, parallel view — maintaining both a list and a
  board at pilot scale is duplicated UI for no real benefit.
- **Skip true drag-and-drop for the first version.** Drag-and-drop
  (reordering, touch support on mobile, accessibility) is meaningfully
  more implementation effort than it looks, and the shop owner's
  actual need is "move this card forward one stage," not arbitrary
  reordering. A "→ Move to [next stage]" button (or the same
  status-select dropdown, just rendered on a card instead of a full
  page) gets 90% of the value for a fraction of the effort — matches
  the "no visual polish required" posture that's guided every prior
  admin-facing phase. Revisit real drag-and-drop only if a shop owner
  actually asks for it after using the button version.
- **Allow one step backward, not just forward.** The existing
  `VALID_STATUS_TRANSITIONS` guard was deliberately strict-forward-only
  (`docs/03_Architecture.md §5`: "no arbitrary jumps like completed →
  new"). That was fine when the only correction ever needed was
  cancellation. With a real payment step now in the pipeline, a
  legitimate correction case exists that strict-forward-only doesn't
  handle: a payment marked `Paid` that turns out to have bounced or
  been reversed needs to go back to `Payment Pending`. Recommend the
  Phase 7 transition map allow exactly one step backward from `Paid` →
  `Payment Pending` (and arguably `Making` → `Paid` for the symmetric
  case), while keeping everything else strict-forward — not a fully
  open graph.
- Each card should show enough to triage without opening the detail
  page: customer name, cake thumbnail (the AI preview, already have
  signed-URL infrastructure for this from the list page), pickup date,
  and price once quoted (blank/"—" pre-pricing).

## 2. Pricing Workflow

**Current state:** no pricing mechanism exists at all. This was a
deliberate MVP cut —
[`04_MVP_Reduction.md`](./04_MVP_Reduction.md) explicitly removed
`price_cents`/`currency`/`payment_status` from `orders`, reasoning that
"adding a nullable column later is a trivial, non-breaking migration."
That reasoning holds up: re-adding pricing now is genuinely additive,
not a rework.

**Design questions worth deciding explicitly before building:**
- **Currency:** the payment message template is Korean and denominated
  in 원 (KRW). Recommend the pricing workflow assume **KRW-only** for
  now rather than building general multi-currency support — this
  matches the actual pilot market and avoids solving a problem (foreign
  exchange, currency selection UI) nobody has yet. A single
  `price_krw integer` (won has no subunit, so no cents-style scaling
  needed) is simpler than reviving the original `price_cents` +
  `currency` pair.
- **What triggers the status change:** recommend that **entering a
  price is what moves an order from `Pricing Pending` to `Payment
  Pending`** — not a separate manual status change plus a separate
  price entry as two disconnected actions. One action, one clear
  outcome, matching the "server enforces the real state, UI reflects
  it" pattern used throughout the admin dashboard.
- **Is the price editable after the fact?** Recommend yes — a shop
  owner should be able to correct a quote before the customer pays
  (e.g., they misjudged the size), without that alone moving the order
  backward in the pipeline.

## 3. Payment Confirmation Workflow

**Current state:** no payment integration of any kind — real gateway
integration (Stripe/Toss) has been marked "Phase 2, not MVP" since the
original [`01_PRD.md`](./01_PRD.md).

**Important framing:** the requested workflow is explicitly a **manual
confirmation** pattern, not a payment gateway integration. There is no
webhook, no automatic "payment succeeded" event — the shop owner sends
a payment message (bank transfer details or a payment link they
already have), the customer pays out-of-band, and **the shop owner
manually marks the order `Paid`** once they see the money arrive. This
is a deliberate, sensible scope choice for this phase: it delivers the
actual business need (get paid before making the cake) without taking
on payment gateway integration, PCI-adjacent concerns, or per-transaction
fees — consistent with the "smallest possible" philosophy that's shaped
every phase of this build so far.

**Open design question that needs an answer before building:** what is
`[PAYMENT_LINK]` in the message template? Two real options:
1. **A static, store-level payment link/bank info**, configured once by
   the shop owner (e.g., in a new `stores.payment_info` field) and
   reused for every order. Simple, no per-order state, no new
   infrastructure.
2. **A dynamically generated per-order payment link** — implies either
   a real payment gateway (out of scope) or a bespoke "payment
   details page" per order (meaningfully more work for a manual-confirm
   flow that doesn't gain much from it).

**Recommendation: option 1.** A single `payment_info` string per store
(a bank account line, a KakaoPay static link, whatever the shop
already uses), substituted into the template as-is. This keeps the
whole feature to "one new nullable column + one templating function +
one clipboard-copy button" — no new payment infrastructure at all.

**Risk to flag, not fix:** manual payment confirmation is only as
reliable as the shop owner's own diligence — a missed check-the-bank
moment means an order sits in `Payment Pending` after the customer has
actually paid. Acceptable at pilot volume (a handful of orders a day);
this is exactly the threshold where real Stripe/Toss integration
becomes worth its cost, which is why the original architecture always
scoped that as a distinct, later phase rather than pulling it in now.

## 4. Customer Communication Workflow

**Current state:** no outbound communication exists at all — the
[`03_Architecture.md` §8](./03_Architecture.md#8-notification-abstraction-future-line--kakaotalk--whatsapp)
notification-outbox design was always deferred, and the only
customer-facing signal today is the passive tracking page, which the
customer has to think to revisit.

**Important framing, same as §3:** the requested "Copy payment message"
button is **not** an automated send — it's a clipboard-copy helper the
shop owner pastes into whatever channel they already use with that
customer (KakaoTalk, SMS, etc.). This sidesteps a genuinely large
amount of complexity that the original architecture assumed would
eventually be necessary: no KakaoTalk Business API account, no business
verification process, no per-message cost, no webhook infrastructure.
It trades automation for near-zero implementation cost — a good trade
at pilot scale, and worth calling out explicitly as a smart scope
choice, not a lesser version of "real" notifications.

**Recommendations:**
- **Generalize the pattern slightly, not the scope.** Once a
  copy-to-clipboard message-template mechanism exists for the payment
  step, extending it to one or two more moments (e.g., "your cake is
  ready for pickup") is a small marginal addition — the same button
  component, a different template string, triggered at a different
  status transition. Worth deciding *whether* to include this in the
  same phase (cheap) rather than treating it as a separate phase later,
  but not required — flagging as a low-cost option, not a requirement.
- **One hardcoded template is enough for now.** The message is
  Korean-only, matching the actual pilot market; store-level template
  customization (and eventually the still-unfulfilled ko/ja/en
  localization from the original PRD) is real future work, not
  something to half-build now.
- **Technical note, not a blocker:** `navigator.clipboard.writeText`
  requires a secure context (HTTPS) — irrelevant on the deployed Vercel
  URL, worth knowing if testing locally over plain `http://localhost`
  produces different clipboard permission behavior than production.

## 5. Schema & Migration Considerations (Read Before Building Either Phase)

This is the single most important thing to get right early, because
the cost of getting it wrong grows with every real order placed after
deployment:

- The current `order_status` Postgres enum is `('new', 'in_progress',
  'ready', 'completed', 'cancelled')`. The new workflow's stages don't
  map one-to-one — there's no more generic `new` (replaced by
  `pricing_pending`), and `in_progress` becomes `making`. Postgres
  enums support **adding** values cheaply
  (`alter type order_status add value '...'`) but do not support
  renaming or removing a value already in use without a more involved
  migration (create a new type, cast the column, drop the old type).
- **Now is the cheapest this migration will ever be** — every order in
  the database today is synthetic test data created and deleted during
  this project's own verification passes (see Phases 3–6). There are
  no real customer orders yet to migrate or reconcile. Recommend doing
  the enum replacement (not just additive appends) as the first step of
  Phase 7, specifically because this window won't stay open once a
  real pilot shop has real orders sitting in `new`/`in_progress`.
- `stores.payment_info` (§3) and `orders.price_krw` (§2) are both
  simple additive nullable columns — no migration risk either way,
  additive-column concerns don't apply to them.

---

## 6. Priorities

1. **Deploy the current MVP first** (this session's Phase 6/7 work) —
   the workflow upgrades below are deliberately not part of this
   deploy. Shipping the already-verified, already-tested current
   feature set first means the very first real pilot usage validates
   the *existing* wizard/admin flow before any new complexity is
   layered on top of it.
2. **Then** build the workflow upgrades — split into two phases below,
   specifically because Kanban+pricing and payment+communication are
   different enough in kind (one is "restructure how orders are
   tracked," the other is "add a manual money/messaging step") that
   bundling them into one phase would make either one harder to verify
   in isolation.

## 7. Recommended Phase 7: Kanban + Pricing Core

- Replace the `order_status` enum values (§5) — do this first, before
  any UI work, since every other change in this phase depends on the
  new status set existing.
- Add `orders.price_krw` (nullable integer).
- Evolve the admin order list page into a Kanban board (6 forward
  columns, `Cancelled` as a filtered-out side state) with simple
  move-forward/move-backward action buttons per card, not drag-and-drop.
- Add the price-quote input (on the card or detail view) that
  transitions `Pricing Pending → Payment Pending` on submit.
- Update the status-transition guard to match the new linear map,
  including the one-step-backward allowance from `Paid` and `Making`
  described in §1.

## 8. Recommended Phase 8: Payment Confirmation + Customer Communication

- Add `stores.payment_info` (nullable text) and a minimal settings
  affordance for a shop owner to set it (even a single unstyled form
  field is enough for MVP).
- Build the "Copy payment message" button: renders the fixed Korean
  template with `[PRICE]` and `[PAYMENT_LINK]` substituted, copies to
  clipboard, shown once an order has a price and is in `Payment
  Pending`.
- Build the manual "Mark as Paid" action (`Payment Pending → Paid`).
- Decide (don't just default into) whether to extend the copy-message
  pattern to the "ready for pickup" moment in this same phase, per the
  optional recommendation in §4.

**Explicitly still out of scope after both phases:** real payment
gateway integration (Stripe/Toss), automated message sending via any
provider's API, and UI localization (ko/ja/en) — all three remain
correctly deferred, consistent with every architecture document in this
series.
