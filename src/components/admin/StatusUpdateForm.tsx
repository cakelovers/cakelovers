"use client"

import { useState, useTransition } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { ORDER_STATUSES, formatStatusLabel, type OrderStatus } from "@/lib/admin/order-status"
import { updateOrderStatus } from "@/app/admin/[storeSlug]/orders/[orderId]/actions"

interface StatusUpdateFormProps {
  storeSlug: string
  orderId: string
  currentStatus: OrderStatus
}

export function StatusUpdateForm({ storeSlug, orderId, currentStatus }: StatusUpdateFormProps) {
  const [status, setStatus] = useState<OrderStatus>(currentStatus)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(newStatus: OrderStatus) {
    setError(null)
    const previous = status
    setStatus(newStatus)

    startTransition(async () => {
      const result = await updateOrderStatus(storeSlug, orderId, newStatus)
      if (result?.error) {
        setStatus(previous)
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="order-status">Status</Label>
      <Select value={status} onValueChange={(value) => handleChange(value as OrderStatus)} disabled={isPending}>
        <SelectTrigger id="order-status" className="w-full max-w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORDER_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {formatStatusLabel(value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
