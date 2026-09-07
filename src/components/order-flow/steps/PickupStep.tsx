"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface DaySlots {
  date: string
  weekday: number
  isOpen: boolean
  openingTime: string | null
  closingTime: string | null
  slots: string[]
}

interface PickupStepProps {
  storeSlug: string
  pickupDate: string
  pickupTime: string
  onChange: (patch: { pickupDate?: string; pickupTime?: string }) => void
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"]

function formatDayLabel(dateStr: string, weekday: number): string {
  const [, month, day] = dateStr.split("-")
  return `${Number(month)}/${Number(day)} (${WEEKDAY_LABELS[weekday]})`
}

// Both stages of this picker only ever render what the server already
// computed (GET .../pickup-slots) — there is no client-side
// reimplementation of "what counts as a valid pickup time" here, so a
// selection made through this component is always something the order
// API's own validation will also accept.
export function PickupStep({ storeSlug, pickupDate, pickupTime, onChange }: PickupStepProps) {
  const [days, setDays] = useState<DaySlots[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(pickupDate || null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`/api/stores/${storeSlug}/pickup-slots`)
        const body = await res.json()
        if (cancelled) return

        if (!res.ok) {
          setError(body?.error?.message ?? "Could not load pickup times.")
          return
        }

        const loadedDays: DaySlots[] = body.days
        setDays(loadedDays)
        setSelectedDate((prev) => {
          const stillOpen = prev && loadedDays.some((d) => d.date === prev && d.isOpen)
          if (stillOpen) return prev
          return loadedDays.find((d) => d.isOpen)?.date ?? null
        })
      } catch {
        if (!cancelled) {
          setError("Could not reach the server. Check your connection and try again.")
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [storeSlug])

  const selectedDay = days?.find((d) => d.date === selectedDate) ?? null

  function selectDate(date: string) {
    setSelectedDate(date)
    // Changing day invalidates any previously chosen time — the old
    // time may not even exist in the new day's own slot list.
    onChange({ pickupDate: date, pickupTime: "" })
  }

  function selectTime(time: string) {
    if (!selectedDate) return
    onChange({ pickupDate: selectedDate, pickupTime: time })
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">Pickup date &amp; time</h2>
        <p className="text-sm text-muted-foreground">
          Only times the shop can actually prepare your order for are shown.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!days && !error && (
        <p className="text-sm text-muted-foreground">Loading available times…</p>
      )}

      {days && (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((day) => (
              <button
                key={day.date}
                type="button"
                disabled={!day.isOpen}
                onClick={() => selectDate(day.date)}
                className={cn(
                  "flex min-w-16 shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-center",
                  day.date === selectedDate
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-muted/40",
                  !day.isOpen && "opacity-40"
                )}
              >
                <span className="text-xs font-medium">{formatDayLabel(day.date, day.weekday)}</span>
                <span className="text-[10px] opacity-80">
                  {day.isOpen ? `${day.openingTime}–${day.closingTime}` : "휴무"}
                </span>
              </button>
            ))}
          </div>

          {selectedDay && (
            <div className="grid grid-cols-4 gap-2">
              {selectedDay.slots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => selectTime(slot)}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-sm",
                    selectedDate === pickupDate && slot === pickupTime
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-muted/40"
                  )}
                >
                  {slot}
                </button>
              ))}
              {selectedDay.slots.length === 0 && (
                <p className="col-span-4 text-sm text-muted-foreground">
                  No times available this day.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
