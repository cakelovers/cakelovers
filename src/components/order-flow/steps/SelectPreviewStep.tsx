"use client"

import { Button } from "@/components/ui/button"
import { AiPreviewDisclaimer } from "@/components/AiPreviewDisclaimer"
import { cn } from "@/lib/utils"

interface SelectPreviewStepProps {
  previewImage: string | null
  previewPrompt: string | null
  selectedPreviewImage: string | null
  onSelect: (result: { image: string; prompt: string }) => void
}

export function SelectPreviewStep({
  previewImage,
  previewPrompt,
  selectedPreviewImage,
  onSelect,
}: SelectPreviewStepProps) {
  const isSelected = Boolean(previewImage) && selectedPreviewImage === previewImage

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">디자인 선택하기</h2>
        <p className="text-sm text-muted-foreground">
          주문할 디자인을 선택하는 단계입니다.
        </p>
      </div>

      <div
        className={cn(
          "relative flex aspect-square w-full items-center justify-center rounded-xl border-2 bg-muted/40",
          isSelected ? "border-primary" : "border-dashed"
        )}
      >
        {previewImage ? (
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
        {isSelected && (
          <span className="absolute top-2 right-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            선택됨
          </span>
        )}
      </div>

      <AiPreviewDisclaimer />

      <Button
        onClick={() =>
          previewImage && previewPrompt && onSelect({ image: previewImage, prompt: previewPrompt })
        }
        disabled={!previewImage || !previewPrompt}
      >
        이 디자인 선택하기
      </Button>
    </div>
  )
}
