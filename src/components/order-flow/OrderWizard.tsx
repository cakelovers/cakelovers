"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ensureAnonymousSession } from "@/lib/supabase/ensure-session"
import { canLeaveStep, stepBlockedReason } from "@/lib/validation/wizard-steps"
import { loadDraft, saveDraft } from "@/lib/wizard-persistence"
import { WizardProgress } from "./WizardProgress"
import { OrderCanvas, OrderCanvasText } from "./OrderCanvas"
import { useCanvasFlip } from "./useCanvasFlip"
import { useKeyboardInset } from "./useKeyboardInset"
import { WIZARD_STEPS, type WizardData } from "./types"
import { CakeConfigurationStep } from "./steps/CakeConfigurationStep"
import { AiPreviewStep } from "./steps/AiPreviewStep"
import { ReferenceImagesStep } from "./steps/ReferenceImagesStep"
import { PickupStep } from "./steps/PickupStep"
import { ReviewStep } from "./steps/ReviewStep"

const INITIAL_DATA: WizardData = {
  cakeOptionAvailability: null,
  specificationOptionId: null,
  flavorPackageOptionId: null,
  specificationLabel: null,
  flavorPackageLabel: null,
  cakeMessageChoice: null,
  cakeMessage: "",
  description: "",
  currentPreviewImage: null,
  currentPreviewPrompt: null,
  selectedPreviewImage: null,
  selectedPreviewPrompt: null,
  referenceImages: [null, null, null],
  pickupDate: "",
  pickupTime: "",
  name: "",
  phone: "",
  customerNote: "",
  privacyConsentAccepted: false,
}

interface OrderWizardProps {
  storeSlug: string
}

// Generation can legitimately take a while, but must not hang
// indefinitely — past this, the request is aborted and treated as a
// failure so the canvas surfaces a retryable error instead of spinning
// forever with no way out.
const GENERATION_TIMEOUT_MS = 25000

// Five-step flow: 케이크 구성 -> AI 시안 -> 참고사진 -> 픽업정보 -> 검토 및 제출.
// See src/app/api/stores/[storeSlug]/ai-preview/route.ts,
// .../cake-options/route.ts, and .../orders/route.ts for the
// corresponding server-side pieces.
export function OrderWizard({ storeSlug }: OrderWizardProps) {
  const [stepIndex, setStepIndex] = useState(0)
  // The furthest step reached so far — lets the progress bar allow
  // jumping back to any visited step while still blocking a jump ahead
  // of a step whose requirement (e.g. a selected design) isn't met yet.
  const [furthestIndex, setFurthestIndex] = useState(0)
  // A refresh, a killed background tab, or a dropped connection would
  // otherwise erase an in-progress order with zero warning — restore
  // the small, plain-text fields (never the AI image, reference
  // photos, catalog availability, or consent; see wizard-persistence.ts)
  // if a draft exists.
  const [data, setData] = useState<WizardData>(() => {
    const draft = loadDraft(storeSlug)
    return draft ? { ...INITIAL_DATA, ...draft } : INITIAL_DATA
  })
  const [showRestoredNotice, setShowRestoredNotice] = useState(
    () => loadDraft(storeSlug) !== null
  )
  // Generated once per wizard session and carried through unchanged —
  // this becomes the literal `orders.id` at submit time and the storage
  // path prefix for both buckets.
  const [orderId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    // Establish the guest's anonymous session as early as possible so
    // it's already in place by the time submission needs it. Submission
    // also calls this defensively before posting, so a failure here
    // isn't fatal to the rest of the wizard.
    ensureAnonymousSession().catch((error) => {
      console.error("Failed to establish anonymous session", error)
    })
  }, [])

  useEffect(() => {
    setFurthestIndex((f) => Math.max(f, stepIndex))
  }, [stepIndex])

  useEffect(() => {
    saveDraft(storeSlug, {
      specificationOptionId: data.specificationOptionId,
      specificationLabel: data.specificationLabel,
      flavorPackageOptionId: data.flavorPackageOptionId,
      flavorPackageLabel: data.flavorPackageLabel,
      cakeMessageChoice: data.cakeMessageChoice,
      cakeMessage: data.cakeMessage,
      description: data.description,
      pickupDate: data.pickupDate,
      pickupTime: data.pickupTime,
      name: data.name,
      phone: data.phone,
      customerNote: data.customerNote,
    })
  }, [
    storeSlug,
    data.specificationOptionId,
    data.specificationLabel,
    data.flavorPackageOptionId,
    data.flavorPackageLabel,
    data.cakeMessageChoice,
    data.cakeMessage,
    data.description,
    data.pickupDate,
    data.pickupTime,
    data.name,
    data.phone,
    data.customerNote,
  ])

  const currentStep = WIZARD_STEPS[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1
  const canAdvance = canLeaveStep(currentStep.id, data)
  const blockedReason = canAdvance ? null : stepBlockedReason(currentStep.id, data)

  function updateData(patch: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...patch }))
  }

  // AI preview generation state lives here, not inside AiPreviewStep,
  // because both the persistent canvas (image/shimmer/error display)
  // and the step's rail (regenerate/proceed buttons, error text) need
  // it, and the canvas is a sibling of the step content now rather
  // than something the step renders itself.
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationError, setGenerationError] = useState<string | null>(null)

  // Tracks a src that failed to decode (corrupted/truncated payload) so
  // the canvas falls back to text instead of a broken-image icon —
  // keyed by the src itself, so a *new* image (regenerated or newly
  // selected) automatically gets a fresh attempt without extra effects.
  const [brokenPreviewSrc, setBrokenPreviewSrc] = useState<string | null>(null)
  const [brokenSelectedSrc, setBrokenSelectedSrc] = useState<string | null>(null)

  // Shared-element transition for the canvas's full <-> compact resize
  // (see useCanvasFlip.ts) — the same DOM node animates via transform
  // only, rather than the browser laying out a width/height change.
  const canvasRef = useRef<HTMLDivElement>(null)
  useCanvasFlip(canvasRef)

  // Keeps the fixed action bar pinned to the actually-visible bottom
  // edge instead of sitting under the on-screen keyboard (see
  // useKeyboardInset.ts) — a transform, not a `bottom` change, so it
  // stays compositor-only.
  const keyboardInset = useKeyboardInset()

  async function handleGenerate() {
    setIsGenerating(true)
    setGenerationError(null)
    const timeoutController = new AbortController()
    const timeoutId = setTimeout(() => timeoutController.abort(), GENERATION_TIMEOUT_MS)
    try {
      const res = await fetch(`/api/stores/${storeSlug}/ai-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: data.description }),
        signal: timeoutController.signal,
      })
      const body = await res.json()
      if (!res.ok) {
        setGenerationError(body?.error?.message ?? "미리보기를 생성하지 못했습니다. 다시 시도해 주세요.")
        return
      }
      updateData({ currentPreviewImage: body.image, currentPreviewPrompt: body.prompt })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setGenerationError("응답이 지연되고 있어요. 다시 시도해 주세요.")
      } else {
        setGenerationError("미리보기 서비스에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.")
      }
    } finally {
      clearTimeout(timeoutId)
      setIsGenerating(false)
    }
  }

  useEffect(() => {
    // Auto-generate the first candidate the moment the customer arrives
    // at this step — mirrors the previous per-mount effect, but keyed on
    // the step transition instead of a component mount, since the
    // canvas no longer unmounts AiPreviewStep between visits.
    if (currentStep.id === "aiPreview" && !data.currentPreviewImage) {
      handleGenerate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep.id])

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, WIZARD_STEPS.length - 1))
  }

  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0))
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background">
      <header className="sticky top-0 z-10 border-b bg-background px-4 pt-4 pb-3">
        <p className="mb-2 text-xs text-muted-foreground">{storeSlug}</p>
        {showRestoredNotice && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
            <span>이전에 작성하신 내용을 불러왔어요.</span>
            <button
              type="button"
              onClick={() => setShowRestoredNotice(false)}
              className="shrink-0 font-medium underline"
            >
              닫기
            </button>
          </div>
        )}
        <WizardProgress
          steps={WIZARD_STEPS}
          currentIndex={stepIndex}
          maxReachableIndex={furthestIndex}
          onStepClick={setStepIndex}
        />
      </header>

      <main className="flex-1 overflow-y-auto scroll-pb-28 px-4 py-6 pb-28">
        {/* Persistent canvas — a stable sibling across every step, never
            unmounted by the step switch below. Content and size vary by
            step; presence doesn't. scroll-mt so a focused-input auto-
            scroll (or a native "scroll into view") doesn't tuck it under
            the sticky header above. */}
        <div className="mb-6 flex scroll-mt-24 justify-center">
          <OrderCanvas ref={canvasRef} compact={currentStep.id === "pickup"}>
            {currentStep.id === "cakeConfig" && (
              <OrderCanvasText>
                {data.description ? (
                  <p className="text-lg leading-relaxed text-foreground sm:text-xl">
                    &ldquo;{data.description}&rdquo;
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    당신의 케이크가 여기에 나타납니다.
                  </p>
                )}
              </OrderCanvasText>
            )}

            {currentStep.id === "aiPreview" &&
              (isGenerating ? (
                <OrderCanvasText>
                  <p className="text-sm text-muted-foreground">미리보기 생성 중…</p>
                </OrderCanvasText>
              ) : data.currentPreviewImage && data.currentPreviewImage !== brokenPreviewSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- base64 data URL
                <img
                  src={data.currentPreviewImage}
                  alt="AI가 생성한 케이크 미리보기"
                  className="h-full w-full object-cover"
                  onError={() => setBrokenPreviewSrc(data.currentPreviewImage)}
                />
              ) : (
                <OrderCanvasText>
                  <p className="text-sm text-muted-foreground">
                    {brokenPreviewSrc !== null && data.currentPreviewImage === brokenPreviewSrc
                      ? "미리보기를 표시하지 못했어요 — 아래 버튼으로 다시 시도해 주세요"
                      : (generationError ?? "미리보기를 생성하지 못했어요 — 아래 버튼으로 다시 시도해 주세요")}
                  </p>
                </OrderCanvasText>
              ))}

            {(currentStep.id === "references" ||
              currentStep.id === "pickup" ||
              currentStep.id === "review") &&
              (data.selectedPreviewImage && data.selectedPreviewImage !== brokenSelectedSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not a static asset next/image can optimize
                <img
                  src={data.selectedPreviewImage}
                  alt="선택한 케이크 디자인"
                  className="h-full w-full object-cover"
                  onError={() => setBrokenSelectedSrc(data.selectedPreviewImage)}
                />
              ) : (
                <OrderCanvasText>
                  <p className="text-sm text-muted-foreground italic">
                    {brokenSelectedSrc !== null && data.selectedPreviewImage === brokenSelectedSrc
                      ? "디자인을 표시하지 못했어요."
                      : "선택한 디자인이 없습니다."}
                  </p>
                </OrderCanvasText>
              ))}
          </OrderCanvas>
        </div>

        {currentStep.id === "cakeConfig" && (
          <CakeConfigurationStep storeSlug={storeSlug} data={data} onChange={updateData} />
        )}

        {currentStep.id === "aiPreview" && (
          <AiPreviewStep
            description={data.description}
            previewImage={data.currentPreviewImage}
            previewPrompt={data.currentPreviewPrompt}
            isGenerating={isGenerating}
            error={generationError}
            onGenerate={handleGenerate}
            onSelect={({ image, prompt }) => {
              updateData({ selectedPreviewImage: image, selectedPreviewPrompt: prompt })
              goNext()
            }}
          />
        )}

        {currentStep.id === "references" && (
          <ReferenceImagesStep
            images={data.referenceImages}
            onChange={(referenceImages) => updateData({ referenceImages })}
          />
        )}

        {currentStep.id === "pickup" && (
          <PickupStep
            storeSlug={storeSlug}
            pickupDate={data.pickupDate}
            pickupTime={data.pickupTime}
            onChange={updateData}
          />
        )}

        {currentStep.id === "review" && (
          <ReviewStep storeSlug={storeSlug} orderId={orderId} data={data} onChange={updateData} />
        )}
      </main>

      <footer
        className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md border-t bg-background px-4 pt-3"
        style={{
          paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
          // Pinned to the visible bottom edge, not the layout viewport's —
          // see useKeyboardInset.ts. transform, not `bottom`, so this
          // stays compositor-only and never fights layout.
          transform: keyboardInset > 0 ? `translateY(-${keyboardInset}px)` : undefined,
        }}
      >
        {!isLastStep && blockedReason && (
          <p className="mb-2 text-center text-xs text-muted-foreground">{blockedReason}</p>
        )}
        <div className="flex gap-2">
          {!isFirstStep && (
            <Button variant="outline" className="flex-1" onClick={goBack}>
              이전
            </Button>
          )}
          {!isLastStep && (
            <Button className="flex-1" onClick={goNext} disabled={!canAdvance}>
              다음
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
