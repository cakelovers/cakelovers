"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"
import { OCCASION_OPTIONS_KO, suggestOccasion } from "@/lib/copy/occasion"
import { CAKE_OPTION_KIND_LABELS_KO } from "@/lib/copy/cake-options"
import { MAX_CAKE_MESSAGE_LENGTH } from "@/lib/validation/description"
import type { CakeOptionKind } from "@/lib/admin/get-cake-options"
import type { CakeMessageChoice, WizardData } from "../types"

interface CakeOptionsResponse {
  flavor: { id: string; label: string }[]
  size: { id: string; label: string }[]
  shape: { id: string; label: string }[]
}

interface CakeInformationStepProps {
  storeSlug: string
  description: string
  data: Pick<
    WizardData,
    | "occasion"
    | "cakeOptionAvailability"
    | "flavorOptionId"
    | "sizeOptionId"
    | "shapeOptionId"
    | "flavorLabel"
    | "sizeLabel"
    | "shapeLabel"
    | "cakeMessageChoice"
    | "cakeMessage"
  >
  onChange: (patch: Partial<WizardData>) => void
}

function optionIdFor(data: CakeInformationStepProps["data"], kind: CakeOptionKind): string | null {
  switch (kind) {
    case "flavor":
      return data.flavorOptionId
    case "size":
      return data.sizeOptionId
    case "shape":
      return data.shapeOptionId
  }
}

// The store's own catalog is this step's entire data source for
// flavor/size/shape (GET .../cake-options) — a kind with zero enabled
// options is hidden entirely rather than shown as an empty required
// picker (the "empty catalog dead end" risk from the Sprint 3
// specification). Occasion is global, not per-store, so it's rendered
// straight from the fixed OCCASION_OPTIONS_KO list with no fetch at all.
export function CakeInformationStep({
  storeSlug,
  description,
  data,
  onChange,
}: CakeInformationStepProps) {
  const [catalog, setCatalog] = useState<CakeOptionsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const suggestedOccasion = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`/api/stores/${storeSlug}/cake-options`)
        const body = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setError(body?.error?.message ?? "케이크 옵션을 불러오지 못했습니다.")
          // Fail open: an unreachable catalog must never permanently
          // block the step — treat it as "nothing configured" rather
          // than leaving cakeOptionAvailability stuck at null forever.
          onChange({ cakeOptionAvailability: { flavor: false, size: false, shape: false } })
          return
        }

        setCatalog(body)
        onChange({
          cakeOptionAvailability: {
            flavor: body.flavor.length > 0,
            size: body.size.length > 0,
            shape: body.shape.length > 0,
          },
        })
      } catch {
        if (!cancelled) {
          setError("서버에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.")
          onChange({ cakeOptionAvailability: { flavor: false, size: false, shape: false } })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // Intentionally runs once per mount — the store's catalog doesn't
    // change mid-session, and this step unmounts/remounts on step
    // navigation like every other step in this wizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSlug])

  useEffect(() => {
    // Auto-suggest exactly once per mount, and only into an empty
    // field — never overwrites a value the customer already has,
    // whether that came from a manual pick or an earlier suggestion.
    if (suggestedOccasion.current) return
    if (data.occasion) {
      suggestedOccasion.current = true
      return
    }
    const suggestion = suggestOccasion(description)
    if (suggestion) {
      onChange({ occasion: suggestion })
    }
    suggestedOccasion.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selectOption(kind: CakeOptionKind, optionId: string, label: string) {
    const current = optionIdFor(data, kind)
    const deselecting = current === optionId
    switch (kind) {
      case "flavor":
        onChange({ flavorOptionId: deselecting ? null : optionId, flavorLabel: deselecting ? null : label })
        return
      case "size":
        onChange({ sizeOptionId: deselecting ? null : optionId, sizeLabel: deselecting ? null : label })
        return
      case "shape":
        onChange({ shapeOptionId: deselecting ? null : optionId, shapeLabel: deselecting ? null : label })
    }
  }

  function selectMessageChoice(choice: CakeMessageChoice) {
    onChange({
      cakeMessageChoice: choice,
      // Stray text must not survive a switch to "no message" — cleared
      // here too, not just enforced server-side, so the textarea can't
      // silently reappear with old content if the customer switches back.
      cakeMessage: choice === "none" ? "" : data.cakeMessage,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">케이크 정보</h2>
        <p className="text-sm text-muted-foreground">
          주문하실 케이크에 대해 몇 가지 더 알려주세요.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">용도 (선택)</h3>
        <div className="flex flex-wrap gap-2">
          {OCCASION_OPTIONS_KO.map((occasion) => (
            <button
              key={occasion}
              type="button"
              onClick={() => onChange({ occasion: data.occasion === occasion ? "" : occasion })}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm",
                data.occasion === occasion
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-muted/40"
              )}
            >
              {occasion}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!catalog && !error && (
        <p className="text-sm text-muted-foreground">케이크 옵션을 불러오는 중…</p>
      )}

      {catalog &&
        (["flavor", "size", "shape"] as const).map((kind) => {
          const options = catalog[kind]
          if (options.length === 0) return null
          const selectedId = optionIdFor(data, kind)
          return (
            <div key={kind} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{CAKE_OPTION_KIND_LABELS_KO[kind]}</h3>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => selectOption(kind, option.id, option.label)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      selectedId === option.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-muted/40"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">케이크 메시지</h3>
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="cake-message-choice"
              checked={data.cakeMessageChoice === "none"}
              onChange={() => selectMessageChoice("none")}
            />
            메시지 없음
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              name="cake-message-choice"
              checked={data.cakeMessageChoice === "custom"}
              onChange={() => selectMessageChoice("custom")}
            />
            메시지 추가
          </label>
        </div>

        {data.cakeMessageChoice === "custom" && (
          <div className="flex flex-col gap-1">
            <Textarea
              placeholder="예: 생일축하해 서진"
              value={data.cakeMessage}
              onChange={(e) => onChange({ cakeMessage: e.target.value })}
              maxLength={MAX_CAKE_MESSAGE_LENGTH}
              rows={2}
            />
            <p className="text-right text-xs text-muted-foreground">
              {data.cakeMessage.length} / {MAX_CAKE_MESSAGE_LENGTH}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
