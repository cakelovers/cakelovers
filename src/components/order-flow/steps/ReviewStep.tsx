"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
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
        setSubmitError(previewBody?.error?.message ?? "Could not save your selected preview. Please try again.")
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
        const one = failedReferencePositions.length === 1
        setSubmitError(
          `Reference ${one ? "photo" : "photos"} ${list} couldn't be uploaded. ` +
            `Go back to the Reference Photos step and remove ${one ? "it" : "them"} ` +
            `or choose a different image, then submit again.`
        )
        return
      }

      const formData = new FormData()
      formData.set("orderId", orderId)
      formData.set("description", data.description)
      formData.set("previewStoragePath", previewBody.storagePath)
      formData.set("previewPrompt", data.selectedPreviewPrompt ?? "")
      formData.set("pickupDate", data.pickupDate)
      formData.set("pickupTime", data.pickupTime)
      formData.set("name", data.name)
      formData.set("phone", data.phone)
      formData.set("email", data.email)
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
        setSubmitError(body?.error?.message ?? "Could not submit your order. Please try again.")
        return
      }

      clearDraft(storeSlug)
      setSubmittedOrderId(body.orderId)
    } catch (error) {
      // Logged so a client-side init failure (e.g. missing Supabase env
      // vars in this build) is distinguishable from a real network error
      // instead of silently collapsing into the same generic message.
      console.error("Order submission failed before reaching the server", error)
      setSubmitError("Could not reach the server. Check your connection and try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (submittedOrderId) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <h2 className="text-lg font-semibold">Order submitted!</h2>
        <p className="text-sm text-muted-foreground">
          Your order has been received. Order reference:
        </p>
        <p className="font-mono text-xs text-muted-foreground">{submittedOrderId}</p>
        <Link href={`/orders/${submittedOrderId}`} className="text-sm underline">
          View your order status
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Review &amp; submit</h2>
        <p className="text-sm text-muted-foreground">
          Check everything looks right before submitting.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div>
            <span className="font-medium">Description: </span>
            {data.description || "—"}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Selected design: </span>
            {data.selectedPreviewImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- base64 data URL
              <img
                src={data.selectedPreviewImage}
                alt="Selected cake preview"
                className="h-10 w-10 rounded-md object-cover"
              />
            ) : (
              "Not selected"
            )}
          </div>
          <div>
            <span className="font-medium">Reference photos: </span>
            {referenceCount} / 3
          </div>
          <div>
            <span className="font-medium">Pickup: </span>
            {data.pickupDate || "—"} {data.pickupTime}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={data.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            value={data.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={data.email}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-note">Additional notes (optional)</Label>
          <Textarea
            id="customer-note"
            rows={3}
            placeholder={
              'e.g. "No candles needed" or "Please contact me before pickup"'
            }
            value={data.customerNote}
            onChange={(e) => onChange({ customerNote: e.target.value })}
            maxLength={500}
          />
        </div>
      </div>

      {!data.selectedPreviewImage && (
        <p className="text-sm text-destructive">
          Go back and select a design before submitting.
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

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button
        onClick={handleSubmit}
        disabled={
          isSubmitting ||
          !data.selectedPreviewImage ||
          !data.name ||
          (!data.phone && !data.email) ||
          !data.privacyConsentAccepted
        }
      >
        {isSubmitting ? "Submitting…" : "Submit Order"}
      </Button>
    </div>
  )
}
