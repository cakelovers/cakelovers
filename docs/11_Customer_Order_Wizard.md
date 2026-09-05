# Customer Order Wizard — Implementation Plan

Companion to [`05_MVP_Implementation_Plan.md` §8](./05_MVP_Implementation_Plan.md#8-customer-ordering-flow-implementation-plan)
(build order), [`07_schema.sql`](./07_schema.sql) /
[`09_Supabase_Execution_Checklist.md`](./09_Supabase_Execution_Checklist.md)
(deployed schema + RLS, both live), and
[`10_NextJS_Project_Setup.md`](./10_NextJS_Project_Setup.md) (the
scaffold this builds on top of). **Design only — no code in this
document.**

This is the detailed, step-by-step design for `/s/[storeSlug]/order`:
one client-side wizard component holding all state locally, submitting
everything in a single request at the end. Seven steps, per the
approved workflow.

---

## 0. Cross-Cutting Decisions (Apply to Every Step Below)

A few decisions that don't belong to any single step but shape all of
them — stated once here so each step's section can just reference them.

### 0.1 The wizard is one screen with a progress indicator, not seven pages
No `/order/step-2` URLs. `OrderWizard` holds a `currentStep` value in
local state and renders the active step's content, per
[`05_MVP_Implementation_Plan.md` §8](./05_MVP_Implementation_Plan.md#8-customer-ordering-flow-implementation-plan).
This matters for mobile especially: no full page reload between steps,
state is never lost to a navigation, and back/forward is instant.

### 0.2 Anonymous session is established before Step 1 is interactive
The moment the order page mounts (before rendering Step 1's input as
enabled), the app checks for an existing Supabase session and calls
`signInAnonymously()` if none exists (per
[`03_Architecture.md` §3.1](./03_Architecture.md#31-identity-provider)).
This is invisible to the customer — no spinner, no visible step — but
it means a real `auth.uid()` exists by the time Step 2 needs one for
rate-limiting, and by the time anything is ever written to the
database.

### 0.3 A client-generated `orderId` is the backbone of the whole flow
The wizard generates one UUID (`orderId = crypto.randomUUID()`) the
moment it mounts and carries it through every step untouched. This id
becomes:
- The literal primary key of the eventual `orders` row (Postgres allows
  an explicit `id` on insert — it doesn't have to come from the
  column's default).
- The `{orderId}` path segment for both Storage buckets:
  `ai-previews/{store_id}/{orderId}/preview.<ext>` and
  `reference-images/{store_id}/{orderId}/{position}.<ext>`.

This is what lets Steps 2–6 reference "this order's" future storage
paths without an `orders` row existing yet, and it's what makes the
final submit idempotent on retry (§7's error handling).

### 0.4 Nothing is written to Supabase until Step 7 — with Storage uploads happening there too
This is a deliberate refinement over earlier sketches: **both** the
selected AI preview **and** the reference images are uploaded to
Storage at submit time, not earlier, and no database row exists before
submit either. Two reasons this is the right call for MVP, not just a
simplification for its own sake:
1. **One rule, not two.** "Nothing persists until submit" is easy to
   reason about and easy to keep secure. A version where reference
   images upload early (during Step 5) would need a Storage write
   policy that authorizes writing into `reference-images/{store_id}/{orderId}/...`
   *before* any `orders` or `customers` row exists to prove ownership
   against — which either weakens that policy (checking only "does
   `store_id` belong to an active store," with no real ownership check
   yet) or adds meaningful complexity for a benefit (marginally earlier
   upload progress) that doesn't matter at pilot scale.
2. **No orphaned storage.** Uploading early means an abandoned wizard
   session (closed tab before submitting) leaves real files sitting in
   Storage forever, unattached to anything — a cleanup job nobody asked
   for. Deferring to submit means Storage only ever holds files for
   orders that actually exist.

The cost: Step 7's request does more work (uploads + inserts together)
and takes a few seconds longer than an instant click. §7 designs the UI
around that honestly (a real progress state, not a fake instant
success).

### 0.5 i18n
Every step's copy (labels, buttons, placeholders, error messages) is
pulled from the `en`/`ko`/`ja` dictionaries per
[`10_NextJS_Project_Setup.md`](./10_NextJS_Project_Setup.md) — not
hardcoded English with translation as an afterthought. Not called out
per-step below to avoid repeating it seven times, but it applies to
every UI requirement listed.

### 0.6 Mobile shell (applies to all seven steps)
- A thin progress indicator at the top ("Step 3 of 7" or a dot/segment
  bar) — always visible, never scrolls away.
- A **sticky bottom action bar** holding the primary "Next"/"Back"
  buttons, so the main CTA is always thumb-reachable regardless of how
  much content is above it — critical once the on-screen keyboard is
  open (Step 1) or a long review list is showing (Step 7).
- One column, no side-by-side layouts anywhere in the wizard.
- Every tap target ≥44px, per standard mobile touch-target guidance.

---

## Step 1 — Cake Design Description

**UI requirements**
- One large, auto-growing `<textarea>`, placeholder text showing an
  example description (e.g. "A two-tier vanilla cake with pink
  buttercream flowers and 'Happy Birthday Mina' on top").
- A live character counter (e.g. `142 / 500`).
- Optional: a row of 3–4 tappable example/inspiration chips ("Birthday
  🎂", "Wedding 💍", "Kids' theme 🎉") that pre-fill or append starter
  text — a small but real help for customers unsure how to describe a
  cake in words, and for non-native speakers typing in a second
  language.
- "Next" button in the sticky action bar, disabled until validation
  passes.

**Validation rules**
- Required, non-empty after trimming whitespace.
- Minimum length (e.g. 10 characters) — rejects accidental
  single-character submissions.
- Maximum length (e.g. 500 characters) — bounds the eventual OpenAI
  prompt size/cost; enforced both by the `maxLength` attribute and a
  re-check before calling the preview endpoint.

**Supabase interactions**
- The anonymous session check/creation from §0.2 happens here, at
  wizard mount — not gated behind any button press, so it's already
  done by the time the customer finishes typing.
- No table reads or writes.

**Storage interactions**
- None.

**Error handling**
- If anonymous sign-in fails (network issue, Supabase outage): don't
  block typing — the textarea works regardless. Retry sign-in silently
  in the background; only block the "Next" button with a small "Having
  trouble connecting — retrying…" message if no session exists by the
  time they try to advance to Step 2 (which needs one).

**Mobile UX considerations**
- Auto-growing textarea (no fixed small box with internal scrolling).
- The sticky action bar must sit *above* the virtual keyboard, not be
  covered by it — verify this specifically on iOS Safari and Android
  Chrome, the two real-world targets.
- `autocomplete="off"`, appropriate `inputmode`, no autocapitalize
  surprises for non-English input.

---

## Step 2 — Generate AI Preview

**UI requirements**
- A primary "Generate Preview" button, shown once Step 1's validation
  passes (this may render as part of the same visual screen as Step 1 —
  description at top, generate button below — rather than a hard page
  break, since the two are so tightly coupled).
- Loading state: a full-width image-shaped placeholder with a subtle
  animated shimmer/progress treatment (not a bare spinner) and rotating
  friendly copy ("Mixing the batter…", "Adding the frosting…") to make
  a few seconds feel shorter.
- On success: the generated image renders full-width, reserved into a
  fixed aspect-ratio box (prevents layout jump when it loads).

**Validation rules**
- None beyond Step 1's already-passed description validation. The
  request re-sends that same validated text — no new user input at
  this step.

**Supabase interactions**
- The Route Handler behind "Generate Preview" reads `auth.uid()` from
  the request's session (for the rate-limit check designed in
  [`05_MVP_Implementation_Plan.md` §9](./05_MVP_Implementation_Plan.md#9-ai-generation-implementation-plan))
  but performs **no reads or writes against any of the 5 business
  tables**. This is intentionally the smallest, most stateless piece of
  server logic in the whole system.

**Storage interactions**
- **None.** The generated image is returned directly in the API
  response (a URL or base64 payload — exact format decided when this
  route is actually built) and held only in the browser's memory. It
  is never written to Supabase Storage at this point — only the
  eventually-*selected* preview ever reaches Storage, and only at
  submit (§0.4, Step 7).

**Error handling**
- OpenAI failure/timeout: inline error state in place of the image
  ("Couldn't generate a preview — try again"), with a retry button that
  re-fires the same request. Description text is preserved regardless
  of failure.
- Rate limit already hit on the very first attempt (unlikely, but
  possible if a session is reused): same inline error, different
  copy ("You've reached the preview limit for now — please try again
  later").

**Mobile UX considerations**
- Reserve the image's aspect-ratio box *before* the request completes,
  so the page doesn't jump when the image loads.
- Keep the description text visible above the loading/result area
  (don't hide what they wrote while waiting) — reduces the feeling of
  "did it lose what I typed?" on a slow connection.

---

## Step 3 — Regenerate Preview

**UI requirements**
- A secondary "Regenerate" button/icon alongside the displayed image
  (visually secondary to the eventual "Use this design" primary
  button from Step 4 — regenerating is the exploration action, not the
  forward action).
- An "Edit description" link that scrolls/reveals Step 1's textarea
  inline for a quick tweak, rather than forcing a full back-navigation.
- Optional, nice-to-have: a small "N tries left" indicator if the API
  response includes a remaining-count, giving the customer a sense of
  the limit without a jarring hard stop.

**Validation rules**
- If the description was edited via "Edit description," the same Step
  1 rules apply again before regenerating.

**Supabase interactions**
- Identical to Step 2 — same stateless route, same rate-limit check
  against the same session, incremented again per call.

**Storage interactions**
- **None** — this is the step that most directly embodies the
  "unselected previews are never persisted" requirement: every
  discarded regeneration simply stops existing the moment the next one
  (or nothing) replaces it in browser memory. Nothing to clean up,
  because nothing was ever written anywhere.

**Error handling**
- Same as Step 2, plus: **regeneration limit reached** is its own
  distinct state — disable the "Regenerate" button, show a clear,
  non-technical explanation, and make sure the customer can still
  proceed to Step 4 with whatever candidate is currently on screen
  (a hit rate limit must never trap someone who already has a preview
  they're happy with).

**Mobile UX considerations**
- Keep the *previous* image visible with a subtle dimmed/loading
  overlay while the next one generates, instead of blanking the screen
  to a bare spinner — avoids a jarring empty state during the few
  seconds of generation, and reduces perceived wait.

---

## Step 4 — Select Preferred Preview

**UI requirements**
- A single, full-width, thumb-reachable primary button below the
  currently shown image: **"Use this design"**.
- **MVP recommendation: one candidate on screen at a time**, not a
  multi-image comparison grid. Regenerate (Step 3) replaces the single
  displayed image rather than accumulating a gallery to compare. This
  is the simpler, faster-to-build, and faster-to-use-on-mobile choice;
  a side-by-side comparison grid is a reasonable Phase 2 enhancement,
  not an MVP requirement.
- On tap, the wizard visibly transitions to "design selected" (e.g. a
  checkmark badge on the image, the Regenerate button disappearing) and
  auto-advances to Step 5.

**Validation rules**
- **Hard gate: the wizard cannot proceed past this step without a
  selected preview.** This directly mirrors the schema constraint that
  `orders.ai_preview_storage_path` and `orders.ai_preview_prompt` are
  `NOT NULL` (per [`07_schema.sql`](./07_schema.sql)) — the UI enforces
  the same rule the database enforces, so a violation is never
  possible to reach at submit time in the first place.

**Supabase interactions**
- None. Selecting is a pure client-side state update: the wizard stores
  the winning image's data (URL/base64) **and** the exact prompt text
  that produced it (needed later, since `ai_preview_prompt` is also
  required at submit).

**Storage interactions**
- None yet — still deferred to Step 7 (§0.4).

**Error handling**
- None specific to this step beyond the hard gate above. (What happens
  if the held image data has gone stale by the time of actual submit —
  e.g., an OpenAI temporary URL expiring during a long Step 5/6 detour —
  is handled in Step 7, since that's where it would actually surface.)

**Mobile UX considerations**
- "Use this design" is the single most important tap in the entire
  flow — make it the visually dominant element on screen: full-width,
  high-contrast, pinned in the sticky action bar so it never requires
  scrolling to reach.

---

## Step 5 — Upload Up to 3 Reference Images

**UI requirements**
- Clear framing copy distinguishing this from Step 4, matching the
  corrected workflow requirement exactly: *"Optional — add photos to
  help the shop match colors, textures, or style. This won't change
  the design you picked above."*
- Three upload slots (not one input area for "up to 3" ambiguity) —
  each slot is either an empty "add photo" tile or a filled thumbnail
  with a small remove (✕) button.
- Tapping an empty slot opens the device's native file/camera picker
  (`<input type="file" accept="image/*" capture>` — the `capture` hint
  lets mobile browsers offer "take a photo" directly, not just "choose
  from gallery").
- A visible "Skip" / "Continue without photos" affordance alongside
  "Next," since 0 images is a fully valid choice.

**Validation rules**
- Maximum 3 files — the 4th empty slot simply doesn't exist once 3 are
  filled.
- Per-file size limit matching the Storage bucket's configured limit
  (5 MB, per
  [`09_Supabase_Execution_Checklist.md` §4](./09_Supabase_Execution_Checklist.md#4-creating-storage-buckets)) —
  checked client-side immediately on selection, before anything is held
  for upload.
- Allowed types matching the bucket's MIME allowlist
  (`image/jpeg`, `image/png`, `image/webp`, `image/heic`) — a
  non-image or disallowed file is rejected immediately with an inline
  message on that slot, no server round-trip needed to discover this.

**Supabase interactions**
- None.

**Storage interactions**
- **None yet, by design (§0.4).** Selected files are held as in-memory
  `File` objects and previewed locally via `URL.createObjectURL()` —
  no network request happens at this step at all. The actual upload to
  the `reference-images` bucket happens at submit (Step 7), using this
  step's held files and the `orderId` from §0.3 to build each path:
  `reference-images/{store_id}/{orderId}/{position}.<ext>`.

**Error handling**
- Oversized or wrong-type file: rejected instantly, inline, per-slot —
  no loading state needed since nothing was sent anywhere.
- No error handling for "upload failed" exists at this step, since no
  upload happens here — that failure mode is Step 7's to handle.

**Mobile UX considerations**
- This is the step where camera access matters most in the whole
  wizard — a customer matching a wedding dress's exact shade of blue,
  say, may want to photograph a physical swatch on the spot rather than
  dig through their camera roll. Supporting direct camera capture (not
  just gallery picking) is a meaningfully better experience here, not
  a nice-to-have.
- Show local thumbnails immediately (from `URL.createObjectURL()`, not
  a network round-trip) so the screen always feels instant, even though
  the real upload is deferred.
- Keep this screen visually lightweight — no upload spinners, no
  progress bars — since the actual heavy lifting (and its own honest
  progress UI) happens in Step 7.

---

## Step 6 — Select Pickup Date and Time

**UI requirements**
- A native `<input type="date">` for the pickup date.
- A native `<input type="time">` **or** a small set of tappable
  time-of-day chips (e.g. Morning / Afternoon / Evening, mapping to
  fixed anchor times like 10:00/14:00/18:00) feeding the single
  `pickup_time` column — either is acceptable for MVP; native time
  input is less code, chips are friendlier for customers who don't
  care about the exact minute. Recommend starting with the native time
  input for MVP simplicity, revisiting chips only if real customer
  feedback asks for it.
- Show the store's minimum lead time as plain copy near the date field
  (e.g. "Orders need at least 24 hours' notice") rather than silently
  disabling dates with no explanation.

**Validation rules**
- Date + time required.
- Must satisfy the store's minimum lead time, computed **in the
  store's own timezone** (`stores.timezone`), not the customer's
  browser timezone — restating the correctness point from
  [`03_Architecture.md` §10](./03_Architecture.md#10-scaling-risks--mitigations):
  a naive browser-local comparison can be wrong right at a day
  boundary for a customer in a different timezone than the shop.
- Client-side validation is a UX convenience only — **always
  re-validated server-side at submit**, since a tab left open across a
  lead-time boundary can make a previously-valid selection stale.

**Supabase interactions**
- The store's `timezone` (and `locale`/`name`, for display) was already
  fetched once when the storefront page (`/s/[storeSlug]`) first
  loaded, via the public "active stores" `select` policy on `stores`
  (per [`09_Supabase_Execution_Checklist.md` §7](./09_Supabase_Execution_Checklist.md#7-implementing-rls-policies)).
  **This step makes no new Supabase call** — it reuses that already-
  fetched store record.

**Storage interactions**
- None.

**Error handling**
- Client rejects an invalid date/time selection immediately, inline,
  before it's even possible to press "Next."
- If server-side re-validation at submit (Step 7) rejects a
  previously-valid selection (the stale-tab case above), the customer
  is routed back to *this exact step*, with the picker focused and a
  specific message ("That pickup time is no longer available — please
  choose another"), not a generic submit failure.

**Mobile UX considerations**
- Native date/time inputs render as the OS's own picker UI on mobile —
  deliberately preferred over a custom-built calendar/time-grid
  component here, since it's both less code to build and maintain and
  a better-understood interaction for the customer than a bespoke
  widget.

---

## Step 7 — Submit Order

**UI requirements**
- A review screen summarizing everything collected so far: the
  description, the selected AI preview (thumbnail), any reference photo
  thumbnails, and the chosen pickup date/time.
- Contact fields collected on this same screen (the approved 7-step
  flow has no separate "contact info" step, so it belongs here, as part
  of "submit"): name, phone, email.
- A single, full-width primary **"Submit Order"** button.
- On tap: the button immediately shows a disabled/loading state with
  real progress copy that changes as the request actually progresses
  (e.g. "Uploading your photos…" → "Creating your order…" → "Done!") —
  not a single indefinite spinner, since this request genuinely takes a
  few seconds (§0.4).
- On success: immediate redirect to
  `/s/[storeSlug]/orders/[orderId]/track`.

**Validation rules**
- `name`: required.
- At least one of `phone` or `email` required; whichever is provided is
  format-checked (basic pattern validation) both client- and
  server-side.
- Everything validated in Steps 1–6 is **re-validated server-side**
  here as well — this route is the only place a real database write
  happens, so it is the last line of defense regardless of what the
  client already checked.

**Supabase interactions** (all in one Route Handler, using the
customer's own session — not the service-role client):
1. Ensure a `customers` row exists for this session: insert one with
   `auth_user_id = auth.uid()`, `store_id`, and the name/phone/email
   just collected (per the `customers` insert policy, which already
   requires `auth_user_id = auth.uid()` — see
   [`09_Supabase_Execution_Checklist.md` §7](./09_Supabase_Execution_Checklist.md#7-implementing-rls-policies)).
2. Insert the `orders` row with the **pre-generated `id` from §0.3**,
   `customer_id` from step 1, `description`, `pickup_date`,
   `pickup_time`, `status = 'new'`, and the just-uploaded
   `ai_preview_storage_path` / `ai_preview_prompt` (uploaded in the
   Storage step immediately below, before this insert, since the
   column is `NOT NULL`).
3. Insert 0–3 `reference_images` rows, `order_id` = the same pre-
   generated id, `storage_path` pointing at each file uploaded in the
   Storage step, `position` 1–3.
4. Send the confirmation email directly and synchronously (no outbox —
   per [`03_Architecture.md` §8](./03_Architecture.md#8-notification-abstraction-future-line--kakaotalk--whatsapp)).

**Storage interactions**
- Upload the selected AI preview to
  `ai-previews/{store_id}/{orderId}/preview.<ext>` — this must succeed
  *before* the `orders` insert above, since that column is `NOT NULL`.
- Upload each held reference-image file (0–3) to
  `reference-images/{store_id}/{orderId}/{position}.<ext>`.
- These are the **only** Storage writes anywhere in the entire customer
  flow (§0.4) — everything else in Steps 1–6 was held in memory.

**Error handling** — the highest-surface-area step in the wizard,
handled explicitly rather than with one generic catch-all:
- **Preview data stale/expired** (e.g. an OpenAI temporary URL expired
  during a long detour through Steps 5–6): block submit, show "Your
  preview has expired — let's regenerate it," and return to Step 2 with
  the original description pre-filled — the customer doesn't retype
  anything, they just wait a few seconds again.
- **A reference image upload fails**: retry that single file a couple
  of times; if it still fails, don't block the whole order over an
  optional field — proceed without it and note in the confirmation UI
  that one photo didn't make it through ("2 of 3 photos uploaded — you
  can email the shop the third if it matters").
- **Pickup date/time fails server-side re-validation**: return to Step
  6 specifically, with a precise message (§ Step 6 error handling), not
  a generic failure.
- **The `orders` insert itself fails** (RLS rejection, constraint
  violation, transient DB error): show a plain "Couldn't submit —
  please try again" and leave all entered data intact so nothing is
  retyped.
- **Retry safety**: because the client already generated and holds
  `orderId` (§0.3), a retried submit reuses the *same* id rather than
  minting a new one — so a retry after a partial failure either
  completes the original attempt cleanly or safely detects "this order
  id already exists" rather than ever creating a duplicate order under
  a different id. (The exact conflict-handling mechanism — e.g. an
  upsert vs. a pre-check — is an implementation detail for when this
  route is actually built, not a design decision needed now.)
- The submit button is disabled the instant it's tapped, specifically
  to prevent an accidental double-submit from a double-tap on a
  touchscreen — independent of any server-side retry safety above.

**Mobile UX considerations**
- The multi-stage progress copy (Storage interactions above) matters
  most here specifically because mobile networks are slower and less
  reliable than the desktop connections this might otherwise be tested
  on — a customer on 4G uploading 3 photos deserves to see *something*
  happening, not a frozen button.
- On success, transition straight into the tracking page rather than
  showing a separate "success!" interstitial the customer has to tap
  through — one less step between "I did it" and "here's my order."

---

## Wizard State Shape (Conceptual — Not Code)

What the wizard holds in memory across all seven steps, to make the
data flow above concrete without writing any actual code yet:

| Field | Set in | Used in |
|---|---|---|
| `orderId` (client-generated UUID) | Mount (§0.3) | Steps 2–7 (storage paths, final insert) |
| `description` | Step 1 | Steps 2, 3, 7 |
| `selectedPreview` (image data/URL + exact prompt text) | Step 4 | Step 7 |
| `referenceFiles` (0–3 `File` objects) | Step 5 | Step 7 |
| `pickupDate`, `pickupTime` | Step 6 | Step 7 |
| `name`, `phone`, `email` | Step 7 | Step 7 |
| `store` (id, slug, timezone, locale — read once) | Page load, before Step 1 | Steps 1, 2, 6, 7 |

Nothing in this table is written to Supabase until the single Step 7
submit — the entire wizard, front to back, is a local form until that
last tap.

---

**This is a design document only.** No components, routes, or
Supabase-interacting code have been written. Implementation begins in
the next phase, in the build order already set in
[`05_MVP_Implementation_Plan.md` §8](./05_MVP_Implementation_Plan.md#8-customer-ordering-flow-implementation-plan):
wizard shell → description → preview generation/selection → reference
upload → pickup → submit + tracking page.
