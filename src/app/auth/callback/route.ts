import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

// Exchanges the magic-link's PKCE code for a real session, then routes
// the now-signed-in staff member straight to their store's order queue
// rather than making them navigate there manually.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const supabase = await createClient()

  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    const { data: membership } = await supabase
      .from("store_members")
      .select("stores(slug)")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    const store = firstOrSelf(membership?.stores as { slug: string } | { slug: string }[] | undefined)
    if (store?.slug) {
      return NextResponse.redirect(new URL(`/admin/${store.slug}/orders`, url.origin))
    }
  }

  return NextResponse.redirect(new URL("/login", url.origin))
}
