"use client"

import { useRef, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  addCatalogDesign,
  updateCatalogDesign,
  setCatalogDesignEnabled,
  moveCatalogDesign,
} from "@/app/admin/[storeSlug]/settings/actions"
import { compressReferenceImage } from "@/lib/images/compress-reference-image"
import type { CatalogDesign } from "@/lib/admin/get-catalog-designs"

interface CatalogDesignsFormProps {
  storeSlug: string
  initial: CatalogDesign[]
}

function priceLabel(krw: number | null): string {
  if (krw === null) return ""
  const sign = krw > 0 ? "+" : ""
  return `${sign}${krw.toLocaleString("ko-KR")}원`
}

export function CatalogDesignsForm({ storeSlug, initial }: CatalogDesignsFormProps) {
  const [designs, setDesigns] = useState(initial)
  const [newLabel, setNewLabel] = useState("")
  const [newPrice, setNewPrice] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleAdd() {
    setError(null)
    const label = newLabel
    const price = newPrice
    const file = fileInputRef.current?.files?.[0]

    if (!file) {
      setError("사진을 선택해 주세요.")
      return
    }

    setIsUploading(true)
    try {
      const prepared = await compressReferenceImage(file)
      const uploadForm = new FormData()
      uploadForm.set("file", prepared)

      const uploadRes = await fetch(`/api/stores/${storeSlug}/catalog-designs/upload`, {
        method: "POST",
        body: uploadForm,
      })
      const uploadBody = await uploadRes.json()

      if (!uploadRes.ok) {
        setError(uploadBody?.error?.message ?? "사진을 업로드하지 못했습니다. 다시 시도해 주세요.")
        return
      }

      const result = await addCatalogDesign(storeSlug, label, price || null, uploadBody.storagePath)
      if (result?.error || !result?.id) {
        // No usable id means later edits on this row (label/price blur,
        // enable toggle, reorder) would target an id that doesn't exist
        // in the database and silently no-op — never optimistically add
        // a row without the real, server-generated id.
        setError(result?.error ?? "디자인을 추가하지 못했습니다. 다시 시도해 주세요.")
        return
      }

      setDesigns((prev) => [
        ...prev,
        {
          id: result.id!,
          label: label.trim(),
          imageStoragePath: uploadBody.storagePath,
          isEnabled: true,
          sortOrder: prev.length,
          priceAdjustmentKrw: price ? Number.parseInt(price, 10) : null,
        },
      ])
      setNewLabel("")
      setNewPrice("")
      if (fileInputRef.current) fileInputRef.current.value = ""
    } catch {
      setError("사진을 처리하지 못했습니다. 다시 시도해 주세요.")
    } finally {
      setIsUploading(false)
    }
  }

  function handleFieldChange(designId: string, field: "label" | "priceInput", value: string) {
    setDesigns((prev) =>
      prev.map((d) => {
        if (d.id !== designId) return d
        if (field === "label") return { ...d, label: value }
        return { ...d, priceAdjustmentKrw: value === "" ? null : Number.parseInt(value, 10) || 0 }
      })
    )
  }

  function handleFieldBlur(designId: string, label: string, priceAdjustmentKrw: number | null) {
    setError(null)
    startTransition(async () => {
      const result = await updateCatalogDesign(storeSlug, designId, label, priceAdjustmentKrw)
      if (result?.error) setError(result.error)
    })
  }

  function handleToggle(designId: string, isEnabled: boolean) {
    setError(null)
    setDesigns((prev) => prev.map((d) => (d.id === designId ? { ...d, isEnabled } : d)))
    startTransition(async () => {
      const result = await setCatalogDesignEnabled(storeSlug, designId, isEnabled)
      if (result?.error) setError(result.error)
    })
  }

  function handleMove(designId: string, direction: "up" | "down") {
    setError(null)
    setDesigns((prev) => {
      const index = prev.findIndex((d) => d.id === designId)
      const swapIndex = direction === "up" ? index - 1 : index + 1
      if (index === -1 || swapIndex < 0 || swapIndex >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
      return next
    })
    startTransition(async () => {
      const result = await moveCatalogDesign(storeSlug, designId, direction)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="flex max-w-2xl flex-col gap-2">
      {designs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          등록된 인기 디자인이 없습니다. 디자인을 추가하기 전까지 고객 주문 화면의
          &ldquo;인기 디자인 주문하기&rdquo;에는 아무것도 표시되지 않습니다.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {designs.map((design, index) => (
          <div key={design.id} className="flex items-center gap-2 rounded-md border p-2">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label="위로 이동"
                disabled={index === 0}
                onClick={() => handleMove(design.id, "up")}
                className="text-xs text-muted-foreground disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label="아래로 이동"
                disabled={index === designs.length - 1}
                onClick={() => handleMove(design.id, "down")}
                className="text-xs text-muted-foreground disabled:opacity-30"
              >
                ▼
              </button>
            </div>
            <Input
              value={design.label}
              onChange={(e) => handleFieldChange(design.id, "label", e.target.value)}
              onBlur={(e) => handleFieldBlur(design.id, e.target.value, design.priceAdjustmentKrw)}
              className="h-8 flex-1"
              placeholder="예: 하트 케이크"
            />
            <Input
              type="number"
              value={design.priceAdjustmentKrw ?? ""}
              onChange={(e) => handleFieldChange(design.id, "priceInput", e.target.value)}
              onBlur={(e) =>
                handleFieldBlur(
                  design.id,
                  design.label,
                  e.target.value === "" ? null : Number.parseInt(e.target.value, 10)
                )
              }
              className="h-8 w-28"
              placeholder="참고 가격"
            />
            <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={design.isEnabled}
                onChange={(e) => handleToggle(design.id, e.target.checked)}
              />
              사용
            </label>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInputRef} type="file" accept="image/*" className="h-8 flex-1 text-sm" />
        <Input
          placeholder="디자인 이름 (예: 하트 케이크)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="h-8 flex-1"
        />
        <Input
          type="number"
          placeholder="참고 가격 (선택)"
          value={newPrice}
          onChange={(e) => setNewPrice(e.target.value)}
          className="h-8 w-32"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleAdd}
          disabled={isUploading || isPending || !newLabel.trim()}
        >
          {isUploading ? "업로드 중…" : "추가"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        참고 가격은 사장님이 직접 참고하기 위한 메모용입니다 (예: {priceLabel(38000) || "+38,000원"}).
        고객이 실제로 결제할 금액은 주문 확인 후 사장님이 직접 견적을 입력합니다 — 다른 주문과
        동일한 절차입니다.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
