"use client"

import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

interface PickupStepProps {
  pickupDate: string
  pickupTime: string
  onChange: (patch: { pickupDate?: string; pickupTime?: string }) => void
}

export function PickupStep({ pickupDate, pickupTime, onChange }: PickupStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Pickup date &amp; time</h2>
        <p className="text-sm text-muted-foreground">
          Orders need at least 24 hours&apos; notice.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pickup-date">Pickup date</Label>
        <Input
          id="pickup-date"
          type="date"
          value={pickupDate}
          onChange={(e) => onChange({ pickupDate: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pickup-time">Pickup time</Label>
        <Input
          id="pickup-time"
          type="time"
          value={pickupTime}
          onChange={(e) => onChange({ pickupTime: e.target.value })}
        />
      </div>
    </div>
  )
}
