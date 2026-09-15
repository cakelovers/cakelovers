"use client"

import { Button } from "@/components/ui/button"
import { AiPreviewGuidance } from "@/components/AiPreviewGuidance"

interface AiPreviewStepProps {
  description: string
  previewImage: string | null
  previewPrompt: string | null
  isGenerating: boolean
  error: string | null
  onGenerate: () => void
  onSelect: (result: { image: string; prompt: string }) => void
}

// Rail-only — the image itself (loading, generated, or failed) renders
// in the persistent OrderCanvas above (see OrderWizard.tsx), which owns
// the generation state so it can be shared between the canvas display
// and these controls. This step supplies only the description recap,
// guidance copy, and the two actions.
export function AiPreviewStep({
  description,
  previewImage,
  previewPrompt,
  isGenerating,
  error,
  onGenerate,
  onSelect,
}: AiPreviewStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">AI 시안</h2>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          &ldquo;{description || "—"}&rdquo;
        </p>
      </div>

      <AiPreviewGuidance />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onGenerate} disabled={isGenerating}>
          다시 생성
        </Button>
        <Button
          className="flex-1"
          onClick={() =>
            previewImage && previewPrompt && onSelect({ image: previewImage, prompt: previewPrompt })
          }
          disabled={isGenerating || !previewImage || !previewPrompt}
        >
          이 디자인으로 진행
        </Button>
      </div>
    </div>
  )
}
