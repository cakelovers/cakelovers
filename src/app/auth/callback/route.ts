import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

const TAG = "[auth/callback]"

// Exchanges the magic-link's PKCE code for a real session, then routes
// the now-signed-in staff member straight to their store's order queue
// rather than making them navigate there manually.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const supabase = await createClient()

  console.info(TAG, "request", {
    origin: url.origin,
    hasCode: Boolean(code),
    // magic-link errors arrive as query params, not a code
    error: url.searchParams.get("error"),
    errorCode: url.searchParams.get("error_code"),
    errorDescription: url.searchParams.get("error_description"),
  })

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error(TAG, "exchangeCodeForSession failed", {
        name: error.name,
        message: error.message,
        status: error.status,
        code: error.code,
      })
    } else {
      console.info(TAG, "exchangeCodeForSession ok", {
        userId: data.user?.id ?? null,
        hasSession: Boolean(data.session),
        expiresAt: data.session?.expires_at ?? null,
      })
    }
  } else {
    console.warn(TAG, "no code param — nothing to exchange")
  }

  const { data: userData, error: userError } = await supabase.auth.getUser()
  const user = userData.user
  if (userError) {
    console.error(TAG, "getUser failed", {
      name: userError.name,
      message: userError.message,
      status: userError.status,
      code: userError.code,
    })
  } else {
    console.info(TAG, "getUser ok", { userId: user?.id ?? null })
  }

  if (user) {
    const {
      data: membership,
      error: membershipError,
      status: membershipStatus,
    } = await supabase
      .from("store_members")
      .select("stores(slug)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (membershipError) {
      console.error(TAG, "membership query failed", {
        status: membershipStatus,
        message: membershipError.message,
        code: membershipError.code,
        details: membershipError.details,
        hint: membershipError.hint,
      })
    } else {
      console.info(TAG, "membership query ok", {
        status: membershipStatus,
        rowFound: membership !== null,
        // stores comes back null when store_members is readable but the
        // embedded stores row is filtered out by RLS
        storesEmbed: membership?.stores ?? null,
      })
    }

    const store = firstOrSelf(membership?.stores as { slug: string } | { slug: string }[] | undefined)
    if (store?.slug) {
      console.info(TAG, "redirecting to admin", { slug: store.slug })
      return NextResponse.redirect(new URL(`/admin/${store.slug}/orders`, url.origin))
    }

    console.warn(TAG, "authenticated but no usable store slug — redirecting to /login", {
      userId: user.id,
      hadMembershipRow: membership !== null,
    })
  }

  console.warn(TAG, "redirecting to /login", { reason: user ? "no-store" : "no-user" })
  return NextResponse.redirect(new URL("/login", url.origin))
}
