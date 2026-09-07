"use client"

import { useState, useTransition } from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  savePaymentSettings,
  type PaymentSettingsInput,
} from "@/app/admin/[storeSlug]/settings/actions"
import type { StorePaymentSettings } from "@/lib/admin/get-payment-settings"

interface PaymentSettingsFormProps {
  storeSlug: string
  initial: StorePaymentSettings | null
}

export function PaymentSettingsForm({ storeSlug, initial }: PaymentSettingsFormProps) {
  const [values, setValues] = useState<PaymentSettingsInput>({
    bankName: initial?.bankName ?? "",
    bankAccountNumber: initial?.bankAccountNumber ?? "",
    bankAccountHolder: initial?.bankAccountHolder ?? "",
    paymentInstructions: initial?.paymentInstructions ?? "",
    paymentDeadlineHours: initial?.paymentDeadlineHours ?? 24,
  })
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function set<K extends keyof PaymentSettingsInput>(key: K, value: PaymentSettingsInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await savePaymentSettings(storeSlug, values)
      if (result?.error) {
        setError(result.error)
      } else {
        setSaved(true)
      }
    })
  }

  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bank-name">은행명</Label>
        <Input
          id="bank-name"
          value={values.bankName}
          onChange={(e) => set("bankName", e.target.value)}
          placeholder="예: 국민은행"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bank-account-number">계좌번호</Label>
        <Input
          id="bank-account-number"
          value={values.bankAccountNumber}
          onChange={(e) => set("bankAccountNumber", e.target.value)}
          placeholder="- 없이 입력"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bank-account-holder">예금주</Label>
        <Input
          id="bank-account-holder"
          value={values.bankAccountHolder}
          onChange={(e) => set("bankAccountHolder", e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-instructions">추가 안내 문구 (선택)</Label>
        <Textarea
          id="payment-instructions"
          rows={2}
          value={values.paymentInstructions}
          onChange={(e) => set("paymentInstructions", e.target.value)}
          placeholder="예: 입금자명을 꼭 확인해 주세요."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payment-deadline-hours">입금 기한 (시간)</Label>
        <Input
          id="payment-deadline-hours"
          type="number"
          min={1}
          max={168}
          value={String(values.paymentDeadlineHours)}
          onChange={(e) => set("paymentDeadlineHours", e.target.value)}
          className="w-32"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
          {isPending ? "저장 중…" : "저장"}
        </Button>
        {saved && !isPending && <span className="text-sm text-muted-foreground">저장되었습니다</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
