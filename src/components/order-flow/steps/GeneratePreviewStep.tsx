"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AiPreviewDisclaimer } from "@/components/AiPreviewDisclaimer"
import { PreviewReassuranceNote } from "@/components/PreviewReassuranceNote"

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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">미리보기 생성하기</h2>
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
            아직 미리보기가 없어요 — 아래 버튼을 눌러 생성해 주세요
          </p>
        )}
      </div>

      <AiPreviewDisclaimer />
      <PreviewReassuranceNote />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        onClick={handleGenerate}
        disabled={isGenerating || description.trim().length < 10}
      >
        미리보기 생성
      </Button>
    </div>
  )
}
