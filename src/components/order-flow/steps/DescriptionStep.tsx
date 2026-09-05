"use client"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface DescriptionStepProps {
  value: string
  onChange: (value: string) => void
}

export function DescriptionStep({ value, onChange }: DescriptionStepProps) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">Describe your cake</h2>
        <p className="text-sm text-muted-foreground">
          Tell us what you have in mind — flavor, colors, theme, anything that helps.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="description">Design description</Label>
        <Textarea
          id="description"
          placeholder="A two-tier vanilla cake with pink buttercream flowers and 'Happy Birthday Mina' on top"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={500}
          rows={6}
        />
        <p className="text-right text-xs text-muted-foreground">{value.length} / 500</p>
      </div>
    </div>
  )
}
