"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MAX_CAKE_MESSAGE_LENGTH, MAX_DESCRIPTION_LENGTH } from "@/lib/validation/description"
import type { CakeMessageChoice, WizardData } from "../types"

interface CakeOption {
  id: string
  label: string
  priceAdjustmentKrw: number | null
}

interface CakeOptionsResponse {
  specification: CakeOption[]
  flavorPackage: CakeOption[]
}

type CakeConfigData = Pick<
  WizardData,
  | "cakeOptionAvailability"
  | "specificationOptionId"
  | "specificationLabel"
  | "flavorPackageOptionId"
  | "flavorPackageLabel"
  | "cakeMessageChoice"
  | "cakeMessage"
  | "description"
>

interface CakeConfigurationStepProps {
  storeSlug: string
  data: CakeConfigData
  onChange: (patch: Partial<WizardData>) => void
}

function priceSuffix(krw: number | null): string {
  if (krw === null) return ""
  const sign = krw > 0 ? "+" : ""
  return ` (${sign}${krw.toLocaleString("ko-KR")}원)`
}

// The store's own preset catalog is this step's entire data source for
// Specification and Flavor Package (GET .../cake-options) — a kind
// with zero enabled presets is hidden entirely rather than shown as an
// empty required picker. No Shape, Theme, or Cream field: shape lives
// in Specification presets ("1호 하트") or the free-text description;
// flavor and cream are combined into a single Flavor Package preset
// ("바닐라 시트 + 순우유 크림"), matching how bakeries actually sell
// fixed combinations rather than an independently composable matrix.
export function CakeConfigurationStep({ storeSlug, data, onChange }: CakeConfigurationStepProps) {
  const [catalog, setCatalog] = useState<CakeOptionsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          onChange({ cakeOptionAvailability: { specification: false, flavorPackage: false } })
          return
        }

        setCatalog(body)
        onChange({
          cakeOptionAvailability: {
            specification: body.specification.length > 0,
            flavorPackage: body.flavorPackage.length > 0,
          },
        })
      } catch {
        if (!cancelled) {
          setError("서버에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.")
          onChange({ cakeOptionAvailability: { specification: false, flavorPackage: false } })
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // Intentionally runs once per mount — the store's catalog doesn't
    // change mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSlug])

  function selectSpecification(option: CakeOption) {
    const deselecting = data.specificationOptionId === option.id
    onChange({
      specificationOptionId: deselecting ? null : option.id,
      specificationLabel: deselecting ? null : option.label,
    })
  }

  function selectFlavorPackage(option: CakeOption) {
    const deselecting = data.flavorPackageOptionId === option.id
    onChange({
      flavorPackageOptionId: deselecting ? null : option.id,
      flavorPackageLabel: deselecting ? null : option.label,
    })
  }

  function selectMessageChoice(choice: CakeMessageChoice) {
    onChange({
      cakeMessageChoice: choice,
      // Stray text must not survive a switch to "no message" — cleared
      // here too, not just enforced server-side.
      cakeMessage: choice === "none" ? "" : data.cakeMessage,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">케이크 구성</h2>
        <p className="text-sm text-muted-foreground">
          주문하실 케이크에 대해 알려주세요.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!catalog && !error && (
        <p className="text-sm text-muted-foreground">케이크 옵션을 불러오는 중…</p>
      )}

      {catalog && catalog.specification.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">규격</h3>
          <div className="flex flex-wrap gap-2">
            {catalog.specification.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => selectSpecification(option)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  data.specificationOptionId === option.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-muted/40"
                )}
              >
                {option.label}
                {priceSuffix(option.priceAdjustmentKrw)}
              </button>
            ))}
          </div>
        </div>
      )}

      {catalog && catalog.flavorPackage.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">맛 패키지</h3>
          <div className="flex flex-wrap gap-2">
            {catalog.flavorPackage.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => selectFlavorPackage(option)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  data.flavorPackageOptionId === option.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-muted/40"
                )}
              >
                {option.label}
                {priceSuffix(option.priceAdjustmentKrw)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">레터링</h3>
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">디자인 설명</Label>
        <p className="text-sm text-muted-foreground">
          배경 색상, 테마, 모양 등 원하시는 내용을 자유롭게 적어주세요.
        </p>
        <Textarea
          id="description"
          placeholder="예: 핑크색 버터크림 꽃 장식, 하트 모양 토퍼"
          value={data.description}
          onChange={(e) => onChange({ description: e.target.value })}
          maxLength={MAX_DESCRIPTION_LENGTH}
          rows={6}
        />
        <p className="text-right text-xs text-muted-foreground">
          {data.description.length} / {MAX_DESCRIPTION_LENGTH}
        </p>
      </div>
    </div>
  )
}
