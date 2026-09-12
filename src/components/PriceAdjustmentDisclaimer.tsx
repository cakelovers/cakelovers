import {
  PRICE_ADJUSTMENT_DISCLAIMER_LINE1_KO,
  PRICE_ADJUSTMENT_DISCLAIMER_LINE2_KO,
} from "@/lib/copy/cake-options"

// Shown under both option pickers and again on the review page so the
// per-option "+5,000원" hints are never mistaken for a running total —
// there is no pricing engine; the store always quotes the final amount
// manually after reviewing the order.
export function PriceAdjustmentDisclaimer() {
  return (
    <p className="text-xs text-muted-foreground">
      {PRICE_ADJUSTMENT_DISCLAIMER_LINE1_KO}
      <br />
      {PRICE_ADJUSTMENT_DISCLAIMER_LINE2_KO}
    </p>
  )
}
