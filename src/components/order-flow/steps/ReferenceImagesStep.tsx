"use client"

import { useRef, useState } from "react"
import { compressReferenceImage } from "@/lib/images/compress-reference-image"
import type { ReferenceImageSlot } from "../types"

interface ReferenceImagesStepProps {
  images: (ReferenceImageSlot | null)[]
  onChange: (images: (ReferenceImageSlot | null)[]) => void
}

const SLOT_INDEXES = [0, 1, 2] as const

// Formats the upload pipeline can turn into a stored JPEG: the browser
// re-encodes these itself, or — for HEIC/HEIF that a non-Safari browser
// can't decode — the server does (see
// src/app/api/stores/[storeSlug]/reference-images/save/route.ts). An
// empty type is let through for the server to sniff (common for HEIC
// picked from a file provider). Anything else (SVG, PDFs or videos
// picked by mistake) is rejected here so the customer finds out
// immediately, on this step, instead of at submit time.
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "",
])

// After client-side compression a real photo is well under 1MB. Anything
// still above this is almost certainly a format the browser couldn't
// re-encode (so compressReferenceImage returned the original) — reject
// it here with a clear message instead of letting the upload fail with a
// 400 (app check) or 413 (Vercel body limit). Kept in sync with
// MAX_REFERENCE_IMAGE_BYTES in src/lib/storage/reference-image.ts.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

function replaceAt<T>(list: T[], index: number, value: T): T[] {
  const next = [...list]
  next[index] = value
  return next
}

export function ReferenceImagesStep({ images, onChange }: ReferenceImagesStepProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [processing, setProcessing] = useState<boolean[]>([false, false, false])
  const [errors, setErrors] = useState<(string | null)[]>([null, null, null])

  function clearSlot(index: number) {
    const next = [...images]
    const existing = next[index]
    if (existing) URL.revokeObjectURL(existing.previewUrl)
    next[index] = null
    onChange(next)
    setErrors((prev) => replaceAt(prev, index, null))
  }

  async function handleFileSelect(index: number, file: File | null) {
    if (!file) {
      clearSlot(index)
      return
    }

    setErrors((prev) => replaceAt(prev, index, null))
    setProcessing((prev) => replaceAt(prev, index, true))

    try {
      // Downscale + re-encode in the browser so the photo lands under
      // both the app's 4MiB check and Vercel's 4.5MB serverless body
      // limit. Best-effort: on failure this returns the original file,
      // which the server then normalizes.
      const prepared = await compressReferenceImage(file)

      if (!ACCEPTED_TYPES.has(prepared.type.toLowerCase())) {
        setErrors((prev) =>
          replaceAt(
            prev,
            index,
            "지원하지 않는 사진 형식입니다. JPEG 또는 PNG 파일을 선택해 주세요."
          )
        )
        return
      }

      if (prepared.size > MAX_UPLOAD_BYTES) {
        setErrors((prev) =>
          replaceAt(
            prev,
            index,
            "사진 용량이 너무 큽니다. 다른 사진을 선택해 주세요."
          )
        )
        return
      }

      const next = [...images]
      const existing = next[index]
      if (existing) URL.revokeObjectURL(existing.previewUrl)
      next[index] = { file: prepared, previewUrl: URL.createObjectURL(prepared) }
      onChange(next)
    } catch {
      setErrors((prev) =>
        replaceAt(
          prev,
          index,
          "사진을 처리하지 못했습니다. 다른 사진을 선택해 주세요."
        )
      )
    } finally {
      setProcessing((prev) => replaceAt(prev, index, false))
      // Let the user re-pick the same file after an error.
      const input = inputRefs.current[index]
      if (input) input.value = ""
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">참고사진 (선택)</h2>
        <p className="text-sm text-muted-foreground">
          방금 선택한 AI 시안은 분위기 참고용입니다. 캐릭터 그림체, 레터링
          스타일, 세부 디자인을 정확히 반영하려면 참고 사진을 함께 등록해
          주세요. (최대 3장)
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {SLOT_INDEXES.map((index) => {
          const slot = images[index]
          const isProcessing = processing[index]
          const error = errors[index]
          return (
            <div key={index} className="flex flex-col gap-1">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => inputRefs.current[index]?.click()}
                className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40 text-2xl text-muted-foreground disabled:opacity-60"
              >
                {isProcessing ? (
                  <span
                    aria-label="사진 처리 중"
                    className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                  />
                ) : slot ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image can't optimize object URLs
                  <img
                    src={slot.previewUrl}
                    alt={`참고 사진 ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  "+"
                )}
              </button>
              <input
                ref={(el) => {
                  inputRefs.current[index] = el
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileSelect(index, e.target.files?.[0] ?? null)}
              />
              {error && (
                <p className="text-center text-xs text-destructive">{error}</p>
              )}
              {slot && !isProcessing && (
                <button
                  type="button"
                  onClick={() => handleFileSelect(index, null)}
                  className="text-center text-xs text-muted-foreground underline"
                >
                  삭제
                </button>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        선택 사항 — 건너뛰어도 됩니다
      </p>
    </div>
  )
}
