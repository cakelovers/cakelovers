"use client"

import { useEffect, useState } from "react"

interface CatalogDesign {
  id: string
  label: string
  imageUrl: string
  priceAdjustmentKrw: number | null
}

interface BrowseStepProps {
  storeSlug: string
  onSelect: (design: { id: string; label: string; imageUrl: string }) => void
}

// Matches the fetch itself, independent of AbortController's own
// timeout — a stalled connection (no response at all, not even a slow
// one) still needs to surface as a retryable error rather than leaving
// the customer on "불러오는 중…" forever.
const FETCH_TIMEOUT_MS = 10000

// Direct Mode's design-selection surface — the counterpart to
// Describe/Generate in Custom Mode. Selecting a design (onSelect)
// populates the exact same WizardData fields a Custom Mode generation
// does (see OrderWizard.tsx), so everything downstream — Pickup,
// Review, order submission — needs no awareness of which path produced
// the selection.
export function BrowseStep({ storeSlug, onSelect }: BrowseStepProps) {
  const [designs, setDesigns] = useState<CatalogDesign[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    async function load() {
      try {
        const res = await fetch(`/api/stores/${storeSlug}/catalog-designs`, {
          signal: controller.signal,
        })
        const body = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setError(body?.error?.message ?? "인기 디자인을 불러오지 못했습니다.")
          return
        }
        setDesigns(body.designs)
      } catch (err) {
        if (cancelled) return
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("응답이 지연되고 있어요. 다시 시도해 주세요.")
        } else {
          setError("서버에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.")
        }
      }
    }

    load()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [storeSlug])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">인기 디자인</h2>
        <p className="text-sm text-muted-foreground">
          마음에 드는 디자인을 선택하면 바로 다음 단계로 진행돼요.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!designs && !error && (
        <p className="text-sm text-muted-foreground">인기 디자인을 불러오는 중…</p>
      )}

      {designs && designs.length === 0 && (
        <p className="text-sm text-muted-foreground">아직 등록된 인기 디자인이 없습니다.</p>
      )}

      {designs && designs.length > 0 && (
        // Same 2-col (mobile) / 3-col (sm:) tile grid as
        // ReferenceImagesStep's photo slots — reused layout convention
        // rather than a new grid system for a different selection task.
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {designs.map((design) => (
            <button
              key={design.id}
              type="button"
              onClick={() =>
                onSelect({ id: design.id, label: design.label, imageUrl: design.imageUrl })
              }
              className="flex flex-col overflow-hidden rounded-lg border bg-card text-left active:scale-[0.98] active:border-primary"
            >
              <div className="aspect-square w-full overflow-hidden bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not a static asset next/image can optimize */}
                <img
                  src={design.imageUrl}
                  alt={design.label}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="px-3 pt-2 pb-2.5">
                <p className="truncate text-sm font-medium">{design.label}</p>
                {design.priceAdjustmentKrw != null && (
                  <p className="text-sm font-semibold text-primary">
                    {new Intl.NumberFormat("ko-KR").format(design.priceAdjustmentKrw)}원
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
