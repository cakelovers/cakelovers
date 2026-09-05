"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { ensureAnonymousSession } from "@/lib/supabase/ensure-session"
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

      const formData = new FormData()
      formData.set("orderId", orderId)
      formData.set("description", data.description)
      formData.set("previewImage", data.selectedPreviewImage ?? "")
      formData.set("previewPrompt", data.selectedPreviewPrompt ?? "")
      formData.set("pickupDate", data.pickupDate)
      formData.set("pickupTime", data.pickupTime)
      formData.set("name", data.name)
      formData.set("phone", data.phone)
      formData.set("email", data.email)
      formData.set("customerNote", data.customerNote)

      data.referenceImages.forEach((slot, index) => {
        if (slot) {
          formData.set(`reference_${index + 1}`, slot.file)
        }
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

      setSubmittedOrderId(body.orderId)
    } catch {
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

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}

      <Button
        onClick={handleSubmit}
        disabled={isSubmitting || !data.selectedPreviewImage || !data.name || (!data.phone && !data.email)}
      >
        {isSubmitting ? "Submitting…" : "Submit Order"}
      </Button>
    </div>
  )
}
