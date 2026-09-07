"use client"

import { useState, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { setQuote, updateQuote } from "@/app/admin/[storeSlug]/orders/[orderId]/actions"
import { formatKrw } from "@/lib/payments/format"

interface EnterQuoteFormProps {
  storeSlug: string
  orderId: string
  mode: "create" | "edit"
  initialAmount?: number | null
}

function digitsOnly(raw: string): string {
  return raw.replace(/[^\d]/g, "")
}

export function EnterQuoteForm({
  storeSlug,
  orderId,
  mode,
  initialAmount,
}: EnterQuoteFormProps) {
  const [editing, setEditing] = useState(mode === "create")
  const [amount, setAmount] = useState(
    initialAmount != null ? String(initialAmount) : ""
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    const value = Number.parseInt(digitsOnly(amount), 10)
    if (!Number.isInteger(value) || value <= 0) {
      setError("견적 금액을 0보다 큰 숫자로 입력하세요.")
      return
    }
    startTransition(async () => {
      const result =
        mode === "create"
          ? await setQuote(storeSlug, orderId, value)
          : await updateQuote(storeSlug, orderId, value)
      if (result?.error) {
        setError(result.error)
      } else if (mode === "edit") {
        setEditing(false)
      }
    })
  }

  if (mode === "edit" && !editing) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">
          견적 금액: {initialAmount != null ? formatKrw(initialAmount) : "—"}
        </span>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => setEditing(true)}
        >
          수정
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="quote-amount">견적 금액 (₩)</Label>
      <div className="flex items-center gap-2">
        <Input
          id="quote-amount"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(digitsOnly(e.target.value))}
          placeholder="예: 68000"
          className="w-40"
        />
        <Button type="button" size="sm" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "저장 중…" : mode === "create" ? "견적 저장" : "저장"}
        </Button>
        {mode === "edit" && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false)
              setAmount(initialAmount != null ? String(initialAmount) : "")
              setError(null)
            }}
            disabled={isPending}
          >
            취소
          </Button>
        )}
      </div>
      {mode === "create" && (
        <p className="text-xs text-muted-foreground">
          견적을 저장하면 주문이 &lsquo;입금 대기&rsquo; 상태로 넘어갑니다.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
