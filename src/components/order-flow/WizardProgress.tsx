"use client"

import { cn } from "@/lib/utils"
import type { WizardStepId } from "./types"

interface WizardProgressProps {
  steps: readonly { id: WizardStepId; label: string }[]
  currentIndex: number
  onStepClick?: (index: number) => void
}

export function WizardProgress({ steps, currentIndex, onStepClick }: WizardProgressProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium">{steps[currentIndex].label}</span>
        <span className="text-xs text-muted-foreground">
          Step {currentIndex + 1} of {steps.length}
        </span>
      </div>
      <div className="flex gap-1">
        {steps.map((step, index) => {
          const isActiveOrComplete = index <= currentIndex
          return (
            <button
              key={step.id}
              type="button"
              aria-label={step.label}
              aria-current={index === currentIndex ? "step" : undefined}
              onClick={() => onStepClick?.(index)}
              disabled={!onStepClick}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                isActiveOrComplete ? "bg-primary" : "bg-muted"
              )}
            />
          )
        })}
      </div>
    </div>
  )
}
