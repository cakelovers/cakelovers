import { createClient } from "@/lib/supabase/server"

export interface StoreMembership {
  storeId: string
  storeName: string
  storeSlug: string
}

function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

// The one real authorization check for every /admin/[storeSlug] route:
// is there a session, and does a store_members row exist linking that
// session's user to the store with this slug. Both the session check
// and the membership check ride on RLS (docs/09 §7) — this function is
// routing convenience, not the security boundary itself.
export async function getStoreMembership(storeSlug: string): Promise<StoreMembership | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from("store_members")
    .select("store_id, stores!inner(id, name, slug)")
    .eq("stores.slug", storeSlug)
    .eq("user_id", user.id)
    .maybeSingle()

  const store = firstOrSelf(data?.stores as { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | undefined)
  if (!store) return null

  return { storeId: store.id, storeName: store.name, storeSlug: store.slug }
}
