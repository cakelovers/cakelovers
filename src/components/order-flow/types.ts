// Shared types for the customer order wizard shell.

export interface ReferenceImageSlot {
  file: File
  previewUrl: string
}

// Whether the store has at least one enabled preset for each kind —
// populated by CakeConfigurationStep once its fetch resolves, so
// wizard-steps.ts's canLeaveStep can stay a pure, synchronous function
// of WizardData alone (it has no other way to know what's required).
// null means "not yet known" (still loading, or the fetch failed);
// treated as "nothing required" by the gate so a slow/failed fetch
// blocks nothing but the fields it actually governs.
export interface CakeOptionAvailability {
  specification: boolean
  flavorPackage: boolean
}

export type CakeMessageChoice = "none" | "custom"

export interface WizardData {
  // Cake Configuration step — store-managed presets plus lettering and
  // free-text design description. Specification and Flavor Package are
  // required only when the store has enabled presets for that kind
  // (see CakeOptionAvailability above); a store with nothing configured
  // for a kind simply never shows that field.
  cakeOptionAvailability: CakeOptionAvailability | null
  specificationOptionId: string | null
  flavorPackageOptionId: string | null
  // Display-only convenience for the review step — never trusted by the
  // server, which re-resolves the authoritative label from
  // store_cake_options by id at submission time (see orders/route.ts).
  specificationLabel: string | null
  flavorPackageLabel: string | null
  // null until the customer picks one of the two radios — neither is a
  // valid default (a bare required text field would force filler text
  // on orders that genuinely carry no message).
  cakeMessageChoice: CakeMessageChoice | null
  cakeMessage: string
  description: string
  // The most recently generated/regenerated candidate — replaced on
  // every call, never itself persisted anywhere.
  currentPreviewImage: string | null
  currentPreviewPrompt: string | null
  // The customer's chosen candidate — this is what eventually gets
  // written to `orders.ai_preview_storage_path` / `ai_preview_prompt`
  // at submit time.
  selectedPreviewImage: string | null
  selectedPreviewPrompt: string | null
  referenceImages: (ReferenceImageSlot | null)[]
  pickupDate: string
  pickupTime: string
  name: string
  phone: string
  // Optional production instructions for the shop, distinct from the
  // design `description` — e.g. "no candles needed" or "reduce
  // sweetness if possible". Shown to both staff and the customer.
  customerNote: string
  // Required before submission — see /privacy. The server stamps its
  // own timestamp on `orders.privacy_consent_given_at`; this flag only
  // gates the client-side submit button.
  privacyConsentAccepted: boolean
  // Set only when the design came from Direct Mode's catalog rather
  // than AI generation — the server re-resolves the image/label from
  // this id itself (never trusts selectedPreviewImage/Prompt for a
  // catalog order); see .../orders/route.ts. Null for a Custom Mode
  // order.
  catalogDesignId: string | null
}

// Custom Mode: Describe -> Generate -> Select Design -> Pickup -> Review.
export const WIZARD_STEPS = [
  { id: "cakeConfig", label: "케이크 구성" },
  { id: "aiPreview", label: "AI 시안" },
  { id: "references", label: "참고사진" },
  { id: "pickup", label: "픽업정보" },
  { id: "review", label: "검토 및 제출" },
] as const

// Direct Mode: Browse -> Select Design -> Pickup -> Review. Same
// pickup/review steps as Custom Mode (identical components — see
// OrderWizard.tsx's step switch), just entered via a catalog selection
// instead of AI generation.
export const DIRECT_WIZARD_STEPS = [
  { id: "browse", label: "디자인 선택" },
  { id: "pickup", label: "픽업정보" },
  { id: "review", label: "검토 및 제출" },
] as const

export type WizardStepId =
  | (typeof WIZARD_STEPS)[number]["id"]
  | (typeof DIRECT_WIZARD_STEPS)[number]["id"]
