import { formatInTimeZone } from "./format"

// Builds the Korean payment-request message the owner copies to the
// clipboard and pastes into KakaoTalk / Instagram DM / SMS. Pure and
// self-contained — every value is passed in — so it is trivially
// testable and has no I/O. See docs/15_V1_Payment_Workflow_Spec.md §5.

export interface PaymentMessageInput {
  storeName: string
  customerName: string
  description: string
  pickupDate: string // "YYYY-MM-DD"
  pickupTime: string // "HH:MM" or "HH:MM:SS"
  amountKrw: number
  paymentReference: string
  bankName: string
  bankAccountNumber: string
  bankAccountHolder: string
  paymentInstructions: string | null
  deadlineHours: number
  deadlineAt: Date
  storeTimezone: string
  orderUrl: string
}

const DESCRIPTION_MAX_LENGTH = 40

function shortenDescription(raw: string): string {
  const collapsed = raw.replace(/\s+/g, " ").trim()
  return collapsed.length > DESCRIPTION_MAX_LENGTH
    ? `${collapsed.slice(0, DESCRIPTION_MAX_LENGTH)}…`
    : collapsed
}

function formatPickupDate(iso: string): string {
  const [year, month, day] = iso.split("-").map((part) => Number.parseInt(part, 10))
  if (!year || !month || !day) return iso
  return `${year}. ${month}. ${day}.`
}

function formatPickupTime(raw: string): string {
  return raw.slice(0, 5)
}

export function buildPaymentMessage(input: PaymentMessageInput): string {
  const amount = new Intl.NumberFormat("ko-KR").format(input.amountKrw)
  const deadlineDatetime = formatInTimeZone(input.deadlineAt, input.storeTimezone)

  const instructions = input.paymentInstructions?.trim()
  const instructionsBlock = instructions ? `\n${instructions}\n` : ""

  return `[${input.storeName}] 주문 결제 안내

안녕하세요, ${input.customerName}님!
주문하신 케이크의 견적이 확정되었습니다.

• 주문 내용: ${shortenDescription(input.description)}
• 픽업: ${formatPickupDate(input.pickupDate)} ${formatPickupTime(input.pickupTime)}
• 결제 금액: ${amount}원

■ 입금 계좌
${input.bankName} ${input.bankAccountNumber}
예금주: ${input.bankAccountHolder}

■ 입금자명 (아래 이름으로 입금해 주세요)
${input.paymentReference}
${instructionsBlock}■ 입금 기한
${input.deadlineHours}시간 이내 (${deadlineDatetime}까지)

입금이 확인되면 제작이 시작됩니다.
주문 상태는 아래 링크에서 확인하실 수 있어요.
${input.orderUrl}`
}
