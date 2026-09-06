"use client"

import { useRef, useState } from "react"
import { compressReferenceImage } from "@/lib/images/compress-reference-image"
import type { ReferenceImageSlot } from "../types"

interface ReferenceImagesStepProps {
  images: (ReferenceImageSlot | null)[]
  onChange: (images: (ReferenceImageSlot | null)[]) => void
}

const SLOT_INDEXES = [0, 1, 2] as const

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
      // limit. Best-effort: on failure this returns the original file.
      const prepared = await compressReferenceImage(file)

      if (prepared.size > MAX_UPLOAD_BYTES) {
        setErrors((prev) =>
          replaceAt(
            prev,
            index,
            "This photo is too large to upload. Please try a different one."
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
          "Could not process this photo. Please try a different one."
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
        <h2 className="text-lg font-semibold">Reference photos (optional)</h2>
        <p className="text-sm text-muted-foreground">
          Add up to 3 photos to help the shop match colors or style. This
          won&apos;t change the design you already picked.
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
                    aria-label="Processing photo"
                    className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
                  />
                ) : slot ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, next/image can't optimize object URLs
                  <img
                    src={slot.previewUrl}
                    alt={`Reference ${index + 1}`}
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
                  Remove
                </button>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Optional — you can skip this step
      </p>
    </div>
  )
}
