"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

interface RegeneratePreviewStepProps {
  storeSlug: string
  description: string
  previewImage: string | null
  onGenerated: (result: { image: string; prompt: string }) => void
}

export function RegeneratePreviewStep({
  storeSlug,
  description,
  previewImage,
  onGenerated,
}: RegeneratePreviewStepProps) {
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRegenerate() {
    setIsRegenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/stores/${storeSlug}/ai-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error?.message ?? "Could not regenerate. Please try again.")
        return
      }
      // Whatever was shown before this call is discarded here and was
      // never written anywhere — unselected candidates are never persisted.
      onGenerated({ image: body.image, prompt: body.prompt })
    } catch {
      setError("Could not reach the preview service. Check your connection and try again.")
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Not quite right?</h2>
        <p className="text-sm text-muted-foreground">
          Regenerate to try a different look.
        </p>
      </div>

      <div className="flex aspect-square w-full items-center justify-center rounded-xl border bg-muted/40">
        {isRegenerating ? (
          <p className="text-sm text-muted-foreground">Regenerating…</p>
        ) : previewImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- base64 data URL
          <img
            src={previewImage}
            alt="AI-generated cake preview"
            className="h-full w-full rounded-xl object-cover"
          />
        ) : (
          <p className="px-6 text-center text-sm text-muted-foreground">
            Go back and generate a preview first
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        variant="outline"
        onClick={handleRegenerate}
        disabled={isRegenerating || !previewImage}
      >
        Regenerate
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Unselected previews are never saved
      </p>
    </div>
  )
}
