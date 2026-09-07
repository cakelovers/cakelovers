import { headers } from "next/headers"

// The public origin of the deployment, used to build customer-facing
// links inside server-generated content (e.g. the payment-request
// message's order-tracking URL).
//
// Prefers the explicit `NEXT_PUBLIC_SITE_URL` env var
// (docs/15_V1_Payment_Workflow_Spec.md §5.2); when it is not set, falls
// back to the forwarded host headers Vercel provides, so the link is
// still correct in every deployed environment without hardcoding a
// domain. Local dev without the header resolves to localhost.
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "")
  if (configured) return configured

  const headerList = await headers()
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host")
  const proto = headerList.get("x-forwarded-proto") ?? "https"
  return host ? `${proto}://${host}` : "http://localhost:3000"
}
