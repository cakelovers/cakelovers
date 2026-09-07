"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  savePickupSettings,
  type PickupSettingsInput,
  type PickupDayInput,
} from "@/app/admin/[storeSlug]/settings/actions"
import type { PickupSettings } from "@/lib/admin/get-pickup-settings"
import { WEEKDAY_LABELS_KO } from "@/lib/copy/weekday"

interface PickupSettingsFormProps {
  storeSlug: string
  initial: PickupSettings
}

export function PickupSettingsForm({ storeSlug, initial }: PickupSettingsFormProps) {
  const [intervalMinutes, setIntervalMinutes] = useState(String(initial.intervalMinutes))
  const [days, setDays] = useState<PickupDayInput[]>(
    initial.days.map((d) => ({
      isEnabled: d.isEnabled,
      openingTime: d.openingTime ?? "11:00",
      closingTime: d.closingTime ?? "18:00",
      minLeadHours: d.minLeadHours ?? 12,
    }))
  )
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()

  function setDay<K extends keyof PickupDayInput>(weekday: number, key: K, value: PickupDayInput[K]) {
    setDays((prev) => prev.map((d, i) => (i === weekday ? { ...d, [key]: value } : d)))
    setSaved(false)
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    const values: PickupSettingsInput = { intervalMinutes, days }
    startTransition(async () => {
      const result = await savePickupSettings(storeSlug, values)
      if (result?.error) {
        setError(result.error)
      } else {
        setSaved(true)
      }
    })
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        {WEEKDAY_LABELS_KO.map((label, weekday) => {
          const day = days[weekday]
          return (
            <div
              key={weekday}
              className="flex flex-wrap items-center gap-3 rounded-md border p-3"
            >
              <label className="flex w-16 shrink-0 items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={day.isEnabled}
                  onChange={(e) => setDay(weekday, "isEnabled", e.target.checked)}
                />
                {label}요일
              </label>

              {day.isEnabled ? (
                <>
                  <input
                    type="time"
                    aria-label={`${label}요일 오픈 시간`}
                    value={day.openingTime}
                    onChange={(e) => setDay(weekday, "openingTime", e.target.value)}
                    className="rounded-md border px-2 py-1 text-sm"
                  />
                  <span className="text-sm text-muted-foreground">~</span>
                  <input
                    type="time"
                    aria-label={`${label}요일 마감 시간`}
                    value={day.closingTime}
                    onChange={(e) => setDay(weekday, "closingTime", e.target.value)}
                    className="rounded-md border px-2 py-1 text-sm"
                  />
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={336}
                      aria-label={`${label}요일 최소 준비 시간`}
                      value={String(day.minLeadHours)}
                      onChange={(e) => setDay(weekday, "minLeadHours", e.target.value)}
                      className="w-16 rounded-md border px-2 py-1 text-sm"
                    />
                    <span className="text-sm text-muted-foreground">시간 전 마감</span>
                  </div>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">휴무</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pickup-interval">픽업 간격</Label>
        <Select
          value={intervalMinutes}
          onValueChange={(value) => {
            setIntervalMinutes(value)
            setSaved(false)
          }}
        >
          <SelectTrigger id="pickup-interval" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15분</SelectItem>
            <SelectItem value="30">30분</SelectItem>
            <SelectItem value="60">60분</SelectItem>
          </SelectContent>
        </Select>
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
