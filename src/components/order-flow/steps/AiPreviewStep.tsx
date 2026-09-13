"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { AiPreviewGuidance } from "@/components/AiPreviewGuidance"

interface AiPreviewStepProps {
  storeSlug: string
  description: string
  previewImage: string | null
  previewPrompt: string | null
  onGenerated: (result: { image: string; prompt: string }) => void
  onSelect: (result: { image: string; prompt: string }) => void
}

// Single consolidated screen replacing the prior Generate/Regenerate/
// Select steps. Auto-generates the first candidate on arrival; "다시
// 생성" replaces the current candidate without persisting the
// discarded one anywhere; "이 디자인으로 진행" commits the current
// candidate as selected and advances.
export function AiPreviewStep({
  storeSlug,
  description,
  previewImage,
  previewPrompt,
  onGenerated,
  onSelect,
}: AiPreviewStepProps) {
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
        setError(body?.error?.message ?? "미리보기를 생성하지 못했습니다. 다시 시도해 주세요.")
        return
      }
      onGenerated({ image: body.image, prompt: body.prompt })
    } catch {
      setError("미리보기 서비스에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.")
    } finally {
      setIsGenerating(false)
    }
  }

  useEffect(() => {
    // Auto-generate the first candidate the moment this step is
    // reached. Returning to this step later, with a candidate already
    // in hand, never re-triggers this.
    if (!previewImage) {
      handleGenerate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">AI 시안</h2>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          &ldquo;{description || "—"}&rdquo;
        </p>
      </div>

      <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-dashed bg-muted/40">
        {isGenerating ? (
          <p className="text-sm text-muted-foreground">미리보기 생성 중…</p>
        ) : previewImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- base64 data URL, not a static asset next/image can optimize
          <img
            src={previewImage}
            alt="AI가 생성한 케이크 미리보기"
            className="h-full w-full rounded-xl object-cover"
          />
        ) : (
          <p className="px-6 text-center text-sm text-muted-foreground">
            미리보기를 생성하지 못했어요 — 아래 버튼으로 다시 시도해 주세요
          </p>
        )}
      </div>

      <AiPreviewGuidance />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={handleGenerate} disabled={isGenerating}>
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
