"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { PriceAdjustmentDisclaimer } from "@/components/PriceAdjustmentDisclaimer"
import { ensureAnonymousSession } from "@/lib/supabase/ensure-session"
import { clearDraft } from "@/lib/wizard-persistence"
import type { WizardData } from "../types"

interface ReviewStepProps {
  storeSlug: string
  orderId: string
  data: WizardData
  onChange: (patch: Partial<WizardData>) => void
}

export function ReviewStep({ storeSlug, orderId, data, onChange }: ReviewStepProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submittedOrderId, setSubmittedOrderId] = useState<string | null>(null)

  const referenceCount = data.referenceImages.filter(Boolean).length

  async function handleSubmit() {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Defensive re-check — the mount-time attempt in OrderWizard has
      // usually already resolved by now, but submission must not
      // proceed without a real session, since every write below is
      // authorized against it.
      await ensureAnonymousSession()

      // Upload the selected preview separately, first. Sending its
      // ~1.5-2.5MB base64 payload in the same request as the final
      // order (plus any reference photos) risks exceeding Vercel's
      // 4.5MB serverless function body limit
      // (FUNCTION_PAYLOAD_TOO_LARGE) — splitting it out keeps every
      // request comfortably small regardless of how many reference
      // photos are attached.
      const previewRes = await fetch(`/api/stores/${storeSlug}/ai-preview/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, previewImage: data.selectedPreviewImage }),
      })
      const previewBody = await previewRes.json()

      if (!previewRes.ok) {
        setSubmitError(previewBody?.error?.message ?? "선택한 디자인을 저장하지 못했습니다. 다시 시도해 주세요.")
        return
      }

      // Upload each attached reference photo separately too, same reason
      // as the preview image above — with up to 3 real photos, bundling
      // them as binary multipart parts into the final /orders request
      // reliably exceeded Vercel's 4.5MB limit even after the preview
      // fix alone.
      const referenceStoragePaths: { position: number; storagePath: string }[] = []
      const failedReferencePositions: number[] = []
      for (let index = 0; index < data.referenceImages.length; index++) {
        const slot = data.referenceImages[index]
        if (!slot) continue

        const position = index + 1
        const refFormData = new FormData()
        refFormData.set("orderId", orderId)
        refFormData.set("position", String(position))
        refFormData.set("file", slot.file)

        try {
          const refRes = await fetch(`/api/stores/${storeSlug}/reference-images/save`, {
            method: "POST",
            body: refFormData,
          })
          if (refRes.ok) {
            const refBody = await refRes.json()
            referenceStoragePaths.push({ position, storagePath: refBody.storagePath })
          } else {
            failedReferencePositions.push(position)
          }
        } catch {
          failedReferencePositions.push(position)
        }
      }

      // A reference photo that failed to upload is not skipped silently:
      // stop here so the customer can remove or replace it rather than
      // submit an order that's missing a photo they attached.
      if (failedReferencePositions.length > 0) {
        const list = failedReferencePositions.join(", ")
        setSubmitError(
          `참고 사진 (${list}번)을 업로드하지 못했습니다. ` +
            `참고 사진 단계로 돌아가서 삭제하거나 다른 사진으로 바꾼 뒤 다시 제출해 주세요.`
        )
        return
      }

      const formData = new FormData()
      formData.set("orderId", orderId)
      formData.set("description", data.description)
      formData.set("previewStoragePath", previewBody.storagePath)
      formData.set("previewPrompt", data.selectedPreviewPrompt ?? "")
      if (data.specificationOptionId) formData.set("specificationOptionId", data.specificationOptionId)
      if (data.flavorPackageOptionId) formData.set("flavorPackageOptionId", data.flavorPackageOptionId)
      formData.set("cakeMessageChoice", data.cakeMessageChoice ?? "")
      formData.set("cakeMessage", data.cakeMessage)
      formData.set("pickupDate", data.pickupDate)
      formData.set("pickupTime", data.pickupTime)
      formData.set("name", data.name)
      formData.set("phone", data.phone)
      formData.set("customerNote", data.customerNote)
      formData.set("privacyConsentAccepted", String(data.privacyConsentAccepted))

      referenceStoragePaths.forEach(({ position, storagePath }) => {
        formData.set(`reference_${position}_path`, storagePath)
      })

      const res = await fetch(`/api/stores/${storeSlug}/orders`, {
        method: "POST",
        body: formData,
      })
      const body = await res.json()

      if (!res.ok) {
        setSubmitError(body?.error?.message ?? "주문을 제출하지 못했습니다. 다시 시도해 주세요.")
        return
      }

      clearDraft(storeSlug)
      setSubmittedOrderId(body.orderId)
    } catch (error) {
      // Logged so a client-side init failure (e.g. missing Supabase env
      // vars in this build) is distinguishable from a real network error
      // instead of silently collapsing into the same generic message.
      console.error("Order submission failed before reaching the server", error)
      setSubmitError("서버에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submittedOrderId) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <h2 className="text-lg font-semibold">주문이 완료되었습니다!</h2>
        <p className="text-sm text-muted-foreground">
          주문이 접수되었습니다. 주문 번호:
        </p>
        <p className="font-mono text-xs text-muted-foreground">{submittedOrderId}</p>
        <Link href={`/orders/${submittedOrderId}`} className="text-sm underline">
          주문 상태 확인하기
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">검토 및 제출</h2>
        <p className="text-sm text-muted-foreground">
          제출하기 전에 내용이 맞는지 확인해 주세요.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <span className="font-medium">설명: </span>
            {data.description || "—"}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">선택한 디자인: </span>
            {data.selectedPreviewImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- base64 data URL
              <img
                src={data.selectedPreviewImage}
                alt="선택한 케이크 미리보기"
                className="h-10 w-10 rounded-md object-cover"
              />
            ) : (
              "선택하지 않음"
            )}
          </div>
          <div>
            <span className="font-medium">참고 사진: </span>
            {referenceCount} / 3
          </div>
          {(data.specificationLabel || data.flavorPackageLabel) && (
            <div>
              <span className="font-medium">케이크 구성: </span>
              {[data.specificationLabel, data.flavorPackageLabel].filter(Boolean).join(" · ")}
            </div>
          )}
          <div>
            <span className="font-medium">케이크 메시지: </span>
            {data.cakeMessageChoice === "custom" ? data.cakeMessage : "없음"}
          </div>
          <div>
            <span className="font-medium">픽업: </span>
            {data.pickupDate || "—"} {data.pickupTime}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">이름</Label>
          <Input
            id="name"
            placeholder="홍길동"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">전화번호</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="01012345678"
            value={data.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-note">추가 메모 (선택)</Label>
          <Textarea
            id="customer-note"
            rows={3}
            placeholder={
              '예: "촛불은 필요 없어요" 또는 "픽업 전에 연락 주세요"'
            }
            value={data.customerNote}
            onChange={(e) => onChange({ customerNote: e.target.value })}
            maxLength={500}
          />
        </div>
      </div>

      {!data.selectedPreviewImage && (
        <p className="text-sm text-destructive">
          이전 단계로 돌아가서 디자인을 선택한 후 제출해 주세요.
        </p>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={data.privacyConsentAccepted}
          onChange={(e) => onChange({ privacyConsentAccepted: e.target.checked })}
        />
        <span>
          <Link href="/privacy" target="_blank" className="underline">
            개인정보처리방침
          </Link>
          에 동의합니다.
        </span>
      </label>

      <PriceAdjustmentDisclaimer />

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button
        onClick={handleSubmit}
        disabled={
          isSubmitting ||
          !data.selectedPreviewImage ||
          !data.name ||
          !data.phone ||
          !data.privacyConsentAccepted
        }
      >
        {isSubmitting ? "제출 중…" : "주문 제출"}
      </Button>
    </div>
  )
}
