import { forwardRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface OrderCanvasProps {
  compact?: boolean
  children: ReactNode
}

// The persistent canvas — rendered once by OrderWizard as a stable
// sibling outside the per-step switch, so it never unmounts as the
// customer moves between steps. Each step supplies different content
// (description text, generated preview, selected design) through
// `children`; `compact` is the reduced size used on the Pickup step,
// where the canvas recedes to a thumbnail but never disappears.
//
// Deliberately no padding or centering here: image content (Preview,
// Refine, Pickup, Confirm) needs to fill this box edge to edge, while
// text content (Describe's echoed description, Preview's loading/error
// copy) applies its own centered padding via OrderCanvasText below —
// baking padding into the shell would inset every image too.
//
// No width/height transition on this element on purpose — the size
// change between full and compact is animated by OrderWizard's FLIP
// effect via `transform` only (see useCanvasFlip in OrderWizard.tsx).
// A CSS transition on width/height here would fight that, and would
// force layout recalculation on every frame instead of compositing.
export const OrderCanvas = forwardRef<HTMLDivElement, OrderCanvasProps>(function OrderCanvas(
  { compact = false, children },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative overflow-hidden rounded-[10px] bg-white shadow-[0_2px_4px_rgba(71,19,28,.06),0_20px_44px_rgba(71,19,28,.10)]",
        compact
          ? "h-[140px] w-[190px] shrink-0 sm:h-[170px] sm:w-[240px]"
          : "min-h-[300px] w-full sm:min-h-[380px]"
      )}
    >
      {children}
    </div>
  )
})

// Centered, padded text treatment for non-image canvas content — used
// for Describe's placeholder/echoed description and Preview's
// loading/error copy.
export function OrderCanvasText({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-[300px] w-full flex-col items-center justify-center px-8 py-12 text-center sm:min-h-[380px]">
      {children}
    </div>
  )
}
