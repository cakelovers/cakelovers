"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AiPreviewDisclaimer } from "@/components/AiPreviewDisclaimer"

interface GeneratePreviewStepProps {
  storeSlug: string
  description: string
  previewImage: string | null
  onGenerated: (result: { image: string; prompt: string }) => void
}

export function GeneratePreviewStep({
  storeSlug,
  description,
  previewImage,
  onGenerated,
}: GeneratePreviewStepProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate() {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/stores/${storeSlug}/ai-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error?.message ?? "Could not generate a preview. Please try again.")
        return
      }
      onGenerated({ image: body.image, prompt: body.prompt })
    } catch {
      setError("Could not reach the preview service. Check your connection and try again.")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Generate your preview</h2>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          &ldquo;{description || "—"}&rdquo;
        </p>
      </div>

      <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed bg-muted/40">
        {isGenerating ? (
          <p className="text-sm text-muted-foreground">Generating preview…</p>
        ) : previewImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not a static asset next/image can optimize
          <img
            src={previewImage}
            alt="AI-generated cake preview"
            className="h-full w-full rounded-xl object-cover"
          />
        ) : (
          <p className="px-6 text-center text-sm text-muted-foreground">
            No preview yet — tap Generate below
          </p>
        )}
      </div>

      <AiPreviewDisclaimer />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        onClick={handleGenerate}
        disabled={isGenerating || description.trim().length < 10}
      >
        Generate Preview
      </Button>
    </div>
  )
}
