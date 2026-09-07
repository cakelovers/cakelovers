"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { AiPreviewDisclaimer } from "@/components/AiPreviewDisclaimer"

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
        setError(body?.error?.message ?? "다시 생성하지 못했습니다. 다시 시도해 주세요.")
        return
      }
      // Whatever was shown before this call is discarded here and was
      // never written anywhere — unselected candidates are never persisted.
      onGenerated({ image: body.image, prompt: body.prompt })
    } catch {
      setError("미리보기 서비스에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.")
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">마음에 들지 않으시나요?</h2>
        <p className="text-sm text-muted-foreground">
          다시 생성해서 다른 느낌으로 만들어 보세요.
        </p>
      </div>

      <div className="flex aspect-square w-full items-center justify-center rounded-xl border bg-muted/40">
        {isRegenerating ? (
          <p className="text-sm text-muted-foreground">다시 생성 중…</p>
        ) : previewImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- base64 data URL
          <img
            src={previewImage}
            alt="AI가 생성한 케이크 미리보기"
            className="h-full w-full rounded-xl object-cover"
          />
        ) : (
          <p className="px-6 text-center text-sm text-muted-foreground">
            이전 단계로 돌아가서 먼저 미리보기를 생성해 주세요
          </p>
        )}
      </div>

      <AiPreviewDisclaimer />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        variant="outline"
        onClick={handleRegenerate}
        disabled={isRegenerating || !previewImage}
      >
        다시 생성
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        선택하지 않은 미리보기는 저장되지 않아요
      </p>
    </div>
  )
}
