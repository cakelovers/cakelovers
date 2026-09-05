import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Server-only. Bypasses Row Level Security entirely — use only in
// explicitly-reviewed code paths (see docs/03_Architecture.md §2,
// Layer 3). Never import this file into client-facing code.
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
