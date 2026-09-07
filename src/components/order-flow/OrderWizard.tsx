"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ensureAnonymousSession } from "@/lib/supabase/ensure-session"
import { canLeaveStep, stepBlockedReason } from "@/lib/validation/wizard-steps"
import { WizardProgress } from "./WizardProgress"
import { WIZARD_STEPS, type WizardData } from "./types"
import { DescriptionStep } from "./steps/DescriptionStep"
import { GeneratePreviewStep } from "./steps/GeneratePreviewStep"
import { RegeneratePreviewStep } from "./steps/RegeneratePreviewStep"
import { SelectPreviewStep } from "./steps/SelectPreviewStep"
import { ReferenceImagesStep } from "./steps/ReferenceImagesStep"
import { PickupStep } from "./steps/PickupStep"
import { ReviewStep } from "./steps/ReviewStep"

const INITIAL_DATA: WizardData = {
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
  email: "",
  customerNote: "",
}

interface OrderWizardProps {
  storeSlug: string
}

// AI preview generation (Steps 2-4) and order submission (Step 7) are
// both real now — see src/app/api/stores/[storeSlug]/ai-preview/route.ts
// and src/app/api/stores/[storeSlug]/orders/route.ts. See
// docs/11_Customer_Order_Wizard.md for the full design.
export function OrderWizard({ storeSlug }: OrderWizardProps) {
  const [stepIndex, setStepIndex] = useState(0)
  // The furthest step reached so far — lets the progress bar allow
  // jumping back to any visited step while still blocking a jump ahead
  // of a step whose requirement (e.g. a selected design) isn't met yet.
  const [furthestIndex, setFurthestIndex] = useState(0)
  const [data, setData] = useState<WizardData>(INITIAL_DATA)
  // Generated once per wizard session and carried through unchanged —
  // this becomes the literal `orders.id` at submit time and the storage
  // path prefix for both buckets. See docs/11_Customer_Order_Wizard.md §0.3.
  const [orderId] = useState(() => crypto.randomUUID())

  useEffect(() => {
    // Establish the guest's anonymous session as early as possible so
    // it's already in place by the time Step 7 needs it. Submission
    // also calls this defensively before posting, so a failure here
    // isn't fatal to the rest of the wizard.
    ensureAnonymousSession().catch((error) => {
      console.error("Failed to establish anonymous session", error)
    })
  }, [])

  useEffect(() => {
    setFurthestIndex((f) => Math.max(f, stepIndex))
  }, [stepIndex])

  const currentStep = WIZARD_STEPS[stepIndex]
  const isFirstStep = stepIndex === 0
  const isLastStep = stepIndex === WIZARD_STEPS.length - 1
  const canAdvance = canLeaveStep(currentStep.id, data)
  const blockedReason = canAdvance ? null : stepBlockedReason(currentStep.id, data)

  function updateData(patch: Partial<WizardData>) {
    setData((prev) => ({ ...prev, ...patch }))
  }

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
        <WizardProgress
          steps={WIZARD_STEPS}
          currentIndex={stepIndex}
          maxReachableIndex={furthestIndex}
          onStepClick={setStepIndex}
        />
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
        {currentStep.id === "description" && (
          <DescriptionStep
            value={data.description}
            onChange={(description) => updateData({ description })}
          />
        )}

        {currentStep.id === "generate" && (
          <GeneratePreviewStep
            storeSlug={storeSlug}
            description={data.description}
            previewImage={data.currentPreviewImage}
            onGenerated={({ image, prompt }) =>
              updateData({ currentPreviewImage: image, currentPreviewPrompt: prompt })
            }
          />
        )}

        {currentStep.id === "regenerate" && (
          <RegeneratePreviewStep
            storeSlug={storeSlug}
            description={data.description}
            previewImage={data.currentPreviewImage}
            onGenerated={({ image, prompt }) =>
              updateData({ currentPreviewImage: image, currentPreviewPrompt: prompt })
            }
          />
        )}

        {currentStep.id === "select" && (
          <SelectPreviewStep
            previewImage={data.currentPreviewImage}
            previewPrompt={data.currentPreviewPrompt}
            selectedPreviewImage={data.selectedPreviewImage}
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
            pickupDate={data.pickupDate}
            pickupTime={data.pickupTime}
            onChange={updateData}
          />
        )}

        {currentStep.id === "review" && (
          <ReviewStep storeSlug={storeSlug} orderId={orderId} data={data} onChange={updateData} />
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md border-t bg-background px-4 py-3">
        {!isLastStep && blockedReason && (
          <p className="mb-2 text-center text-xs text-muted-foreground">{blockedReason}</p>
        )}
        <div className="flex gap-2">
          {!isFirstStep && (
            <Button variant="outline" className="flex-1" onClick={goBack}>
              Back
            </Button>
          )}
          {!isLastStep && (
            <Button className="flex-1" onClick={goNext} disabled={!canAdvance}>
              Next
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
