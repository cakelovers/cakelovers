"use client"

import { useState, useTransition, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

type ActionResult = { error?: string; success?: true } | void

interface ConfirmActionProps {
  label: string
  confirmPrompt: string
  confirmLabel?: string
  onConfirm: () => Promise<ActionResult>
  variant?: "default" | "outline" | "destructive" | "ghost"
  size?: "xs" | "sm" | "default"
  children?: ReactNode
}

// A button that reveals an inline "are you sure?" step before running a
// server action. Avoids window.confirm() and keeps the whole flow inside
// the component. `children` renders above the confirm row (used by the
// cancel form for its reason input).
export function ConfirmAction({
  label,
  confirmPrompt,
  confirmLabel = "예",
  onConfirm,
  variant = "outline",
  size = "sm",
  children,
}: ConfirmActionProps) {
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function run() {
    setError(null)
    startTransition(async () => {
      const result = await onConfirm()
      if (result && "error" in result && result.error) {
        setError(result.error)
        setArmed(false)
      } else {
        setArmed(false)
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {armed && children}
      {armed ? (
        <div className="flex items-center gap-2">
          <span className="text-sm">{confirmPrompt}</span>
          <Button
            type="button"
            size={size}
            variant={variant}
            onClick={run}
            disabled={isPending}
          >
            {isPending ? "처리 중…" : confirmLabel}
          </Button>
          <Button
            type="button"
            size={size}
            variant="ghost"
            onClick={() => setArmed(false)}
            disabled={isPending}
          >
            아니오
          </Button>
        </div>
      ) : (
        <Button type="button" size={size} variant={variant} onClick={() => setArmed(true)}>
          {label}
        </Button>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
