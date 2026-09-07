// Shared formatting helpers for the payment workflow. Kept pure so they
// can run identically in server components, server actions, and the
// payment-message builder.

// Whole-KRW amount with the ₩ prefix used in the admin UI, e.g. ₩68,000.
export function formatKrw(amount: number): string {
  return `₩${new Intl.NumberFormat("ko-KR").format(amount)}`
}

// A date rendered in a specific IANA time zone as `M월 D일 HH:mm`
// (24-hour). Used for both the payment-request message deadline and the
// admin "paid at" / "requested at" timestamps. `en-US` is used only as a
// stable numeric-parts locale — the Korean characters are added here so
// the output never picks up a locale's 오전/오후 day period.
export function formatInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ""

  const hour = get("hour").padStart(2, "0")
  const minute = get("minute").padStart(2, "0")
  return `${get("month")}월 ${get("day")}일 ${hour}:${minute}`
}
