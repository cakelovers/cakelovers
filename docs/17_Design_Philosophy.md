# Design Philosophy — Cake Lovers

**Scope:** this governs every customer-facing surface — the store landing
page, the ordering flow (`/s/[storeSlug]/order`), and the tracking page
(`/orders/[orderId]`). It does **not** govern `/admin`. The admin
dashboard is a production tool for shop staff under time pressure; it
should stay dense, fast, and utilitarian. Applying an editorial
philosophy to a queue-management screen would be a constraint mismatch,
not luxury — so this document draws that line deliberately rather than
by omission.

---

## 1. Brand personality (persona-architecture)

**Core identity:** *Cake Lovers is the person who takes your half-formed
idea for a cake and shows you, before you've committed to anything, what
it could become.* The brand's entire value is in that moment of
translation — text becomes image, vague becomes specific — so the
personality has to behave like a **confident creative collaborator**,
not a **storefront** and not a **tool**.

Persona dimensions:

| Dimension | Cake Lovers is | Cake Lovers is not |
|---|---|---|
| Voice | Editorial, declarative, economical with words | Cheerful, exclamation-heavy, emoji-laced |
| Posture toward the customer | A collaborator showing you options | A vendor upselling add-ons |
| Relationship to the AI preview | Treated as a considered proof, shown with care | Treated as a "feature" to be explained or badged |
| Relationship to imagery | The image *is* the content | The image *illustrates* surrounding copy |
| Cultural register (ko/ja/en) | Restrained, translatable without losing tone | Idiomatic, pun-based, hard to localize |
| Relationship to sugar/dessert clichés | Absent — no pastel gradients, no cursive script, no confetti | Bakery-shop-window: piping icons, cursive logotype, warm yellow |
| Relationship to "software" | Invisible — the product experience feels like a lookbook, not a dashboard | Visible — no chrome, no cards, no dashboard language ("Step 2 of 5", progress badges) |

**Anti-persona (what would break this):** a friendly neighborhood
bakery mascot, a discount-marketplace hustle, or a generic B2B SaaS
onboarding wizard. All three are natural attractors for this product —
it *is* technically a multi-tenant SaaS ordering wizard — which is
exactly why they have to be named and excluded explicitly rather than
assumed away.

---

## 2. Design principles (tone-calibration)

Each principle exists to resolve a specific tension between what the
product technically is and what it needs to feel like.

1. **The preview is the product, not a feature of the product.**
   Every other cake-ordering tool treats "AI generates an image" as a
   capability to advertise (icon + headline + subhead, in a feature
   grid). Here, the generated image *is* what the customer is looking
   at 90% of the time. Design the generation and comparison moment as
   the main editorial content of the page — full-bleed, unhurried,
   captioned like a plate in a lookbook — not as a card in a "how it
   works" section.

2. **Restraint reads as confidence; decoration reads as insecurity.**
   A cake business is tempted to prove warmth through decoration
   (pastel palettes, script fonts, sprinkles-as-motif). Cake Lovers
   proves warmth through the quality of the photography and the
   precision of the copy, and gets confidence for free from empty
   space. This is the direct resolution of "luxury editorial."

3. **White is the material, not the background.** White space is
   sized and paced deliberately — it sets rhythm between sections the
   way a magazine's gutters do — rather than being "whatever's left
   after the components are laid out." If a screen needs a rule, a
   hairline divider, or a card outline to organize it, the layout is
   under-resolved, not the affordance missing.

4. **One idea per screen.** Editorial pacing means the ordering flow
   reads like sequential spreads, not a form with steps. Each screen
   commits to a single decision (describe the cake, compare previews,
   add reference photos, pick a time) and gets full visual weight; it
   does not compete for attention with a stepper, a sidebar, or a
   summary panel.

5. **Reference photos are appendix, not gallery.** The PRD is explicit
   that uploaded reference images are production aids, never a design
   choice, and must stay visually and narratively subordinate to the
   AI preview. The design has to encode that hierarchy structurally
   (smaller, later, captioned as "for your baker," never mixed into
   the same grid as the preview) so staff and customers can't confuse
   the two even at a glance.

6. **The system is quiet everywhere the platform shows through.**
   Multi-tenancy, i18n switching, session/step state, rate limits on
   regeneration — all real constraints — must never surface as
   dashboard furniture (badges, progress bars, "Store powered by Cake
   Lovers" chrome). State changes through pacing and typography, not
   through UI components borrowed from admin tooling.

---

## 3. Visual rules (constraint-specification)

**Color**
- Base canvas is white (`oklch(1 0 0)` / `#fff`) at all times on
  customer-facing surfaces — not off-white, not a light gray "surface"
  token borrowed from the current shadcn defaults. White is the largest
  single color on every screen, always.
- One near-black ink for all text and line work (the existing
  `--foreground: oklch(0.145 0 0)` is right — keep it, don't soften it
  toward gray).
- Exactly one accent color per tenant (store), used only for the single
  primary action and for the AI-preview selection state — nowhere else.
  This is the only per-store brand customization point; it is a color
  value, never a second typeface, icon set, or layout variant.
- No gradients, no pastel tints, no "soft" backgrounds behind sections.
  Color-as-decoration is exactly what a bakery-brochure aesthetic uses
  to signal warmth; here warmth comes from photography and copy.

**Typography**
- One serif for editorial moments (page titles, the caption under a
  selected preview) and one grotesk/sans for interface text (labels,
  buttons, form fields, timestamps). Two families total, no exceptions
  per tenant.
- Set body copy larger and looser than typical form UI — this is a
  reading experience, not a data-entry experience. No text smaller than
  is comfortable at arm's length on a 360–430px viewport (NFR-3 still
  applies: editorial pacing cannot cost mobile usability).
- Headline type is set in sentence case, left-aligned, never centered
  and never all-caps — centering and all-caps are the two fastest ways
  a layout starts reading like a poster ad instead of a page.

**Spacing & layout**
- Layouts are single-column on mobile and constrained (not full-width)
  on desktop — an editorial page has a measure, a SaaS dashboard has a
  viewport-filling grid. Cake Lovers is always the former.
- Vertical rhythm is generous and consistent: the gap between "sections"
  should read as deliberate as the gap between magazine spreads, not as
  whatever margin a component library ships with by default.
- No shadows, no card borders, no rounded "panel" containers to group
  content. Grouping is done with whitespace and type hierarchy alone.

**Imagery**
- The AI-generated preview is always shown large — never thumbnailed
  next to competing UI. When comparing regenerations, lay them out as a
  simple sequence (like contact sheets), not as a grid of equal-weight
  cards with buttons on each.
- No stock photography of bakeries, ovens, or smiling staff. Every
  image on the page is either the AI preview itself or an actual
  reference photo the customer uploaded — nothing generic filling
  space.
- No decorative icons (whisks, cupcakes, party hats). If a concept needs
  an icon to be understood, rewrite the copy instead.

**Motion**
- Transitions are cuts and simple fades between "spreads," matching
  editorial page-turns — not slide-ins, bounces, or skeleton loaders
  styled like a SaaS product tour.

**Componentry (the direct rule against "SaaS cards")**
- No bordered/shadowed card is used to contain content on customer
  surfaces. Where the codebase's shared `components/ui` (shadcn) card
  primitive would normally be reached for, use typographic sections
  instead. Buttons, inputs, and the pickup-slot picker keep their
  shadcn functional behavior but are restyled to be nearly invisible
  until interacted with — thin underlines and text-weight, not filled
  pill buttons with drop shadows.
- No progress stepper UI ("Step 2 of 5," numbered circles). Progression
  through the order flow is communicated by the content itself — a new
  full-screen spread — not by dashboard chrome layered on top of it.

---

## 4. Content hierarchy

Ordered by visual and narrative weight, on every customer-facing page:

1. **The image.** Either the AI-generated preview (once it exists) or,
   pre-generation, the empty canvas / prompt field treated as the
   page's hero. This always occupies the largest, first-seen space.
2. **The single sentence.** One short line of editorial copy that
   frames the current moment ("Describe the cake. We'll show you what
   it could look like." / "Choose the one that's closest."). Never a
   paragraph, never a bullet list, never a "how it works" explainer.
3. **The one decision available on this screen.** The text prompt, the
   preview selection, the reference upload, the pickup slot, the
   contact fields — exactly one category of input per spread, styled
   as understated form controls, not as a feature panel.
4. **The primary action.** A single text-weight link/button in the
   tenant's one accent color. There is never a secondary/tertiary
   button competing for attention on the same screen.
5. **Reference photos, when present.** Smaller, positioned after the
   preview, captioned as production context for the baker — visually
   subordinate by design, per Principle 5.
6. **System/meta information** (locale switch, pickup lead-time
   caveats, AI-preview disclaimer copy, order-tracking status). Always
   smallest, always last, set in the sans/grotesk face at reduced
   size — present because it's required (i18n, disclaimers, NFRs), but
   never competing with the editorial content above it.

The admin dashboard inverts this hierarchy on purpose: there, the queue
table and status controls *are* the primary content, and that's correct
for that surface — which is why §1's scope boundary matters as much as
any rule below it.

---

## 5. Forbidden patterns → what replaces them

| Forbidden | Why it's tempting here | What it's replaced with |
|---|---|---|
| **SaaS cards** | shadcn/ui ships cards by default; the order flow has discrete "steps" that map naturally onto card components | Full-bleed typographic sections separated by whitespace/rhythm, not borders |
| **Feature grids** | "AI preview," "reference photos," "pickup scheduling" look like three features begging for a 3-up icon grid on a landing page | No landing-page feature explainer at all — the first thing a visitor does is start describing a cake; the product explains itself by being used |
| **Bakery brochure aesthetics** | The product literally sells cakes; pastel/cursive/confetti is the entire existing visual language of the category | Editorial serif + grotesk pairing, black on white, photography-led — the same visual grammar as a fashion or design lookbook, applied to cake |

---

## 6. Which constraints drove which decisions

| Decision | Controlling constraint(s) |
|---|---|
| White canvas is mandatory, no off-white/gray surfaces | **white-first** (explicit requirement) |
| Serif + grotesk pairing, generous type scale, sentence case | **luxury editorial** — restraint and typographic confidence over decoration |
| AI preview shown full-bleed as the page's main content, not inside a card | **product experience as content** + forbids **SaaS cards** simultaneously — this single rule satisfies both |
| No landing-page "how it works" explainer section | forbids **feature grids** — the product must be experienced, not pitched |
| No pastel palette, script type, or dessert iconography | forbids **bakery brochure aesthetics**, reinforces **luxury editorial** |
| One accent color per tenant, applied only to CTA + preview-selection state | **white-first** (accent can't compete with white as dominant) balanced against real multi-tenant branding needs from the PRD |
| Reference photos visually subordinate to AI preview | Product requirement (PRD §4.1 step 6) elevated into a visual rule — content truth enforced through hierarchy, not a caption alone |
| No progress-stepper / dashboard chrome on customer surfaces | forbids **SaaS cards** in spirit (any componentized "app" furniture), protects **product experience as content** |
| Admin dashboard explicitly excluded from this philosophy | None of the four constraints apply to a staff production tool — applying them there would sacrifice the NFR-driven need for density and speed for no brand benefit |

The three requirements and three prohibitions aren't independent —
most rules above satisfy at least two at once. The most load-bearing
single decision in this document is treating **the AI-generated preview
itself as the page's primary content**: it is simultaneously the
clearest expression of "product experience as content," the strongest
lever against "SaaS cards" (nothing needs a card if the image is
already the largest thing on the screen), and the cleanest way to
earn "luxury editorial" tone without borrowing any decoration from the
bakery-brochure category.
