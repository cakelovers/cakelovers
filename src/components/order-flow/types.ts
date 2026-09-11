// Shared types for the customer order wizard shell.
// Mock/shell phase only — no Supabase or OpenAI types here yet.

export interface ReferenceImageSlot {
  file: File
  previewUrl: string
}

// Whether the store has at least one enabled option for each catalog
// kind — populated by CakeInformationStep once its fetch resolves, so
// wizard-steps.ts's canLeaveStep can stay a pure, synchronous function
// of WizardData alone (it has no other way to know what's required).
// null means "not yet known" (still loading, or the fetch failed);
// treated as "nothing required" by the gate so a slow/failed catalog
// fetch blocks nothing but the fields it actually governs.
export interface CakeOptionAvailability {
  flavor: boolean
  size: boolean
  shape: boolean
}

export type CakeMessageChoice = "none" | "custom"

export interface WizardData {
  description: string
  // The most recently generated/regenerated candidate — replaced on
  // every call, never itself persisted anywhere (see docs/11 §0.4).
  currentPreviewImage: string | null
  currentPreviewPrompt: string | null
  // The customer's chosen candidate — this is what eventually gets
  // written to `orders.ai_preview_storage_path` / `ai_preview_prompt`
  // at submit time, in a later phase.
  selectedPreviewImage: string | null
  selectedPreviewPrompt: string | null
  referenceImages: (ReferenceImageSlot | null)[]
  // Sprint 3 — Cake Information step. Occasion is optional and global
  // (see src/lib/copy/occasion.ts); flavor/size/shape are per-store
  // catalog selections, required only when the store has enabled
  // options for that kind (see CakeOptionAvailability above).
  occasion: string
  cakeOptionAvailability: CakeOptionAvailability | null
  flavorOptionId: string | null
  sizeOptionId: string | null
  shapeOptionId: string | null
  // Display-only convenience for the review step — never trusted by the
  // server, which re-resolves the authoritative label from
  // store_cake_options by id at submission time (see orders/route.ts).
  flavorLabel: string | null
  sizeLabel: string | null
  shapeLabel: string | null
  // null until the customer picks one of the two radios — neither is a
  // valid default (see the Sprint 3 specification's risk register).
  cakeMessageChoice: CakeMessageChoice | null
  cakeMessage: string
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
}

export const WIZARD_STEPS = [
  { id: "description", label: "설명" },
  { id: "generate", label: "AI 미리보기" },
  { id: "regenerate", label: "다시 생성" },
  { id: "select", label: "디자인 선택" },
  { id: "references", label: "참고 사진" },
  { id: "cakeInfo", label: "케이크 정보" },
  { id: "pickup", label: "픽업" },
  { id: "review", label: "검토 및 제출" },
] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]["id"]
