"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  addCakeOption,
  updateCakeOption,
  setCakeOptionEnabled,
  moveCakeOption,
} from "@/app/admin/[storeSlug]/settings/actions"
import type { CakeOption, CakeOptionKind } from "@/lib/admin/get-cake-options"
import { CAKE_OPTION_KIND_LABELS_KO, MAX_CAKE_OPTION_LABEL_LENGTH } from "@/lib/copy/cake-options"

interface CakeOptionsFormProps {
  storeSlug: string
  initial: CakeOption[]
}

export function CakeOptionsForm({ storeSlug, initial }: CakeOptionsFormProps) {
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {(["specification", "flavor_package"] as const).map((kind) => (
        <CakeOptionKindList
          key={kind}
          storeSlug={storeSlug}
          kind={kind}
          initial={initial.filter((option) => option.kind === kind)}
        />
      ))}
    </div>
  )
}

function priceLabel(krw: number | null): string {
  if (krw === null) return ""
  const sign = krw > 0 ? "+" : ""
  return `${sign}${krw.toLocaleString("ko-KR")}원`
}

function CakeOptionKindList({
  storeSlug,
  kind,
  initial,
}: {
  storeSlug: string
  kind: CakeOptionKind
  initial: CakeOption[]
}) {
  const [options, setOptions] = useState(initial)
  const [newLabel, setNewLabel] = useState("")
  const [newPrice, setNewPrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    setError(null)
    const label = newLabel
    const price = newPrice
    startTransition(async () => {
      const result = await addCakeOption(storeSlug, kind, label, price || null)
      if (result?.error || !result?.id) {
        // No usable id means later edits on this row (label/price blur,
        // enable toggle, reorder) would target an id that doesn't exist
        // in the database and silently no-op — never optimistically add
        // a row without the real, server-generated id.
        setError(result?.error ?? "옵션을 추가하지 못했습니다. 다시 시도해 주세요.")
        return
      }
      setOptions((prev) => [
        ...prev,
        {
          id: result.id!,
          kind,
          label: label.trim(),
          isEnabled: true,
          sortOrder: prev.length,
          priceAdjustmentKrw: price ? Number.parseInt(price, 10) : null,
        },
      ])
      setNewLabel("")
      setNewPrice("")
    })
  }

  function handleFieldChange(optionId: string, field: "label" | "priceInput", value: string) {
    setOptions((prev) =>
      prev.map((o) => {
        if (o.id !== optionId) return o
        if (field === "label") return { ...o, label: value }
        return { ...o, priceAdjustmentKrw: value === "" ? null : Number.parseInt(value, 10) || 0 }
      })
    )
  }

  function handleFieldBlur(optionId: string, label: string, priceAdjustmentKrw: number | null) {
    setError(null)
    startTransition(async () => {
      const result = await updateCakeOption(storeSlug, optionId, label, priceAdjustmentKrw)
      if (result?.error) setError(result.error)
    })
  }

  function handleToggle(optionId: string, isEnabled: boolean) {
    setError(null)
    setOptions((prev) => prev.map((o) => (o.id === optionId ? { ...o, isEnabled } : o)))
    startTransition(async () => {
      const result = await setCakeOptionEnabled(storeSlug, optionId, isEnabled)
      if (result?.error) setError(result.error)
    })
  }

  function handleMove(optionId: string, direction: "up" | "down") {
    setError(null)
    setOptions((prev) => {
      const index = prev.findIndex((o) => o.id === optionId)
      const swapIndex = direction === "up" ? index - 1 : index + 1
      if (index === -1 || swapIndex < 0 || swapIndex >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
      return next
    })
    startTransition(async () => {
      const result = await moveCakeOption(storeSlug, kind, optionId, direction)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{CAKE_OPTION_KIND_LABELS_KO[kind]}</h3>

      {options.length === 0 && (
        <p className="text-sm text-muted-foreground">
          등록된 {CAKE_OPTION_KIND_LABELS_KO[kind]} 옵션이 없습니다. 옵션을 추가하기 전까지 고객
          주문 화면에는 이 항목이 표시되지 않습니다.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {options.map((option, index) => (
          <div key={option.id} className="flex items-center gap-2 rounded-md border p-2">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="위로 이동"
                disabled={index === 0}
                onClick={() => handleMove(option.id, "up")}
                className="text-xs text-muted-foreground disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label="아래로 이동"
                disabled={index === options.length - 1}
                onClick={() => handleMove(option.id, "down")}
                className="text-xs text-muted-foreground disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <Input
              value={option.label}
              maxLength={MAX_CAKE_OPTION_LABEL_LENGTH}
              onChange={(e) => handleFieldChange(option.id, "label", e.target.value)}
              onBlur={(e) => handleFieldBlur(option.id, e.target.value, option.priceAdjustmentKrw)}
              className="h-8 flex-1"
              placeholder="예: 1호 하트"
            />
            <Input
              type="number"
              value={option.priceAdjustmentKrw ?? ""}
              onChange={(e) => handleFieldChange(option.id, "priceInput", e.target.value)}
              onBlur={(e) =>
                handleFieldBlur(
                  option.id,
                  option.label,
                  e.target.value === "" ? null : Number.parseInt(e.target.value, 10)
                )
              }
              className="h-8 w-28"
              placeholder="가격 조정"
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={option.isEnabled}
                onChange={(e) => handleToggle(option.id, e.target.checked)}
              />
              사용
            </label>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder={`${CAKE_OPTION_KIND_LABELS_KO[kind]} 이름 (예: 1호 하트)`}
          value={newLabel}
          maxLength={MAX_CAKE_OPTION_LABEL_LENGTH}
          onChange={(e) => setNewLabel(e.target.value)}
          className="h-8 flex-1"
        />
        <Input
          type="number"
          placeholder="가격 조정 (선택)"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          className="h-8 w-32"
        />
        <Button type="button" size="sm" onClick={handleAdd} disabled={isPending || !newLabel.trim()}>
          추가
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        가격 조정은 고객에게 참고용으로만 표시됩니다 (예: {priceLabel(5000) || "+5,000원"}). 실제
        견적은 주문 확인 후 사장님이 직접 입력합니다.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
