// The 입금자명 (depositor name) a customer must transfer under so the
// owner can match an incoming bank transfer to one order. Manual bank
// reconciliation does not work without this — see
// docs/15_V1_Payment_Workflow_Spec.md §5.3.
//
// Format: `{name}-{SHORT}` where
//   - {name}  is the customer's name with all whitespace removed, capped
//             at 10 characters (fits a Korean bank 입금자명 field), and
//   - {SHORT} is the last 4 hex characters of the order UUID, uppercased.
// Example: 홍길동-3F9A
//
// Computed exactly once, when the quote is entered, and stored on
// `orders.payment_reference` so it stays stable even if the customer row
// later changes.
const NAME_MAX_LENGTH = 10
const SHORT_LENGTH = 4

export function buildPaymentReference(customerName: string, orderId: string): string {
  const name = customerName.replace(/\s+/g, "").slice(0, NAME_MAX_LENGTH) || "고객"
  const short = orderId.replace(/-/g, "").slice(-SHORT_LENGTH).toUpperCase()
  return `${name}-${short}`
}
