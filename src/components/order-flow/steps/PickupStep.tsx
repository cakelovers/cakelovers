"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { WEEKDAY_LABELS_KO } from "@/lib/copy/weekday"

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

function formatDayLabel(dateStr: string, weekday: number): string {
  const [, month, day] = dateStr.split("-")
  return `${Number(month)}/${Number(day)} (${WEEKDAY_LABELS_KO[weekday]})`
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
          setError(body?.error?.message ?? "픽업 가능 시간을 불러오지 못했습니다.")
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
          setError("서버에 연결할 수 없습니다. 연결 상태를 확인하고 다시 시도해 주세요.")
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
        <h2 className="text-lg font-semibold">픽업 날짜 및 시간</h2>
        <p className="text-sm text-muted-foreground">
          매장에서 실제로 준비 가능한 시간만 표시됩니다.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!days && !error && (
        <p className="text-sm text-muted-foreground">픽업 가능 시간을 불러오는 중…</p>
      )}

      {days && days.every((d) => !d.isOpen) && (
        <p className="text-sm text-destructive">
          현재 픽업 가능한 날짜가 없습니다. 매장에 문의해 주세요.
        </p>
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
                  이 날짜에는 예약 가능한 시간이 없습니다.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
