"use client"

import { useRef } from "react"
import type { ReferenceImageSlot } from "../types"

interface ReferenceImagesStepProps {
  images: (ReferenceImageSlot | null)[]
  onChange: (images: (ReferenceImageSlot | null)[]) => void
}

const SLOT_INDEXES = [0, 1, 2] as const

export function ReferenceImagesStep({ images, onChange }: ReferenceImagesStepProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  function handleFileSelect(index: number, file: File | null) {
    const next = [...images]
    next[index] = file ? { file, previewUrl: URL.createObjectURL(file) } : null
    onChange(next)
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
          return (
            <div key={index} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => inputRefs.current[index]?.click()}
                className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed bg-muted/40 text-2xl text-muted-foreground"
              >
                {slot ? (
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
              {slot && (
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
