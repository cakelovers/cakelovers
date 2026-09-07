// Pure pickup-slot computation, shared by the pickup-slots route (the
// customer picker's data source) and the order API's final
// validation — one algorithm, not two independently maintained copies
// of "what counts as a valid pickup time."
import type { PickupSettings } from "@/lib/admin/get-pickup-settings"

export interface DaySlots {
  date: string // YYYY-MM-DD, in the store's own calendar
  weekday: number
  isOpen: boolean
  openingTime: string | null
  closingTime: string | null
  slots: string[] // "HH:MM"; empty when isOpen is false
}

// The store's own local "now" — always derived from stores.timezone
// via nowInTimeZone() below, never server or browser local time.
export interface StoreNow {
  dateStr: string // YYYY-MM-DD
  minutes: number // minutes since that date's local midnight
}

const MINUTES_PER_DAY = 24 * 60
const MS_PER_DAY = MINUTES_PER_DAY * 60 * 1000

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export function weekdayOfDateString(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function dayIndexBetween(fromDateStr: string, toDateStr: string): number {
  const [y1, m1, d1] = fromDateStr.split("-").map(Number)
  const [y2, m2, d2] = toDateStr.split("-").map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS_PER_DAY)
}

// The store's local date and time-of-day right now, per its own
// timezone (stores.timezone) — the anchor every other calculation in
// this module is relative to.
export function nowInTimeZone(timeZone: string, at: Date = new Date()): StoreNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00"
  return {
    dateStr: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  }
}

// Generates the picker's day-by-day slot list, starting today.
// `daysAhead` bounds how far into the future days are considered.
export function computeEligibleDays(
  settings: PickupSettings,
  now: StoreNow,
  daysAhead = 14
): DaySlots[] {
  const results: DaySlots[] = []

  for (let i = 0; i < daysAhead; i++) {
    const date = addDaysToDateString(now.dateStr, i)
    const weekday = weekdayOfDateString(date)
    const day = settings.days[weekday]

    if (!day.isEnabled || !day.openingTime || !day.closingTime || day.minLeadHours == null) {
      results.push({ date, weekday, isOpen: false, openingTime: null, closingTime: null, slots: [] })
      continue
    }

    const openMin = parseTime(day.openingTime)
    const closeMin = parseTime(day.closingTime)
    const leadMin = day.minLeadHours * 60
    const dayOpenAbs = i * MINUTES_PER_DAY + openMin
    const dayCloseAbs = i * MINUTES_PER_DAY + closeMin
    const earliestAbs = Math.max(dayOpenAbs, now.minutes + leadMin)

    const slots: string[] = []
    if (earliestAbs <= dayCloseAbs) {
      for (let slotMin = openMin; slotMin <= closeMin; slotMin += settings.intervalMinutes) {
        const slotAbs = i * MINUTES_PER_DAY + slotMin
        if (slotAbs >= earliestAbs) slots.push(formatMinutes(slotMin))
      }
    }

    results.push({
      date,
      weekday,
      isOpen: slots.length > 0,
      openingTime: day.openingTime,
      closingTime: day.closingTime,
      slots,
    })
  }

  return results
}

// Wraps computeEligibleDays with an adaptive search window. A fixed
// 14-day lookahead works for near-default settings but produces a
// silent dead end for a store with a long lead time relative to that
// window (e.g. a shop needing a week+ notice for custom cakes) —
// every visible day comes back closed with no indication why. This
// keeps extending the window, in 14-day increments, until it finds a
// reasonable number of open days or hits the cap.
export function findEligibleDays(
  settings: PickupSettings,
  now: StoreNow,
  options: { minOpenDays?: number; maxDaysAhead?: number } = {}
): DaySlots[] {
  const minOpenDays = options.minOpenDays ?? 5
  const maxDaysAhead = options.maxDaysAhead ?? 60

  let daysAhead = Math.min(14, maxDaysAhead)
  let result = computeEligibleDays(settings, now, daysAhead)

  while (
    result.filter((d) => d.isOpen).length < minOpenDays &&
    daysAhead < maxDaysAhead
  ) {
    daysAhead = Math.min(daysAhead + 14, maxDaysAhead)
    result = computeEligibleDays(settings, now, daysAhead)
  }

  return result
}

// Final server-side check for one specific customer-submitted
// date+time — same rule as computeEligibleDays, evaluated for a
// single candidate. This is the actual enforcement; the picker only
// ever offers what this function would also accept.
export function isPickupSlotValid(
  settings: PickupSettings,
  now: StoreNow,
  candidateDate: string,
  candidateTime: string
): boolean {
  const i = dayIndexBetween(now.dateStr, candidateDate)
  if (i < 0) return false

  const weekday = weekdayOfDateString(candidateDate)
  const day = settings.days[weekday]
  if (!day.isEnabled || !day.openingTime || !day.closingTime || day.minLeadHours == null) {
    return false
  }

  const openMin = parseTime(day.openingTime)
  const closeMin = parseTime(day.closingTime)
  const leadMin = day.minLeadHours * 60
  const candidateMin = parseTime(candidateTime)

  if ((candidateMin - openMin) % settings.intervalMinutes !== 0) return false

  const dayOpenAbs = i * MINUTES_PER_DAY + openMin
  const dayCloseAbs = i * MINUTES_PER_DAY + closeMin
  const candidateAbs = i * MINUTES_PER_DAY + candidateMin
  const earliestAbs = Math.max(dayOpenAbs, now.minutes + leadMin)

  return candidateAbs >= earliestAbs && candidateAbs <= dayCloseAbs
}
