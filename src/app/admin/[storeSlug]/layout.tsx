import Link from "next/link"
import { redirect } from "next/navigation"
import { getStoreMembership } from "@/lib/admin/get-store-membership"
import { SignOutButton } from "@/components/admin/SignOutButton"

// The one auth guard for the entire /admin/[storeSlug] tree. Not logged
// in, or logged in but not a member of this store — both cases route to
// /login, kept deliberately simple for MVP (see docs/03_Architecture.md
// §3.4). This is a Server Component using cookies(), so it (and every
// page under it) is dynamically rendered per-request — never cached.
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ storeSlug: string }>
}) {
  const { storeSlug } = await params
  const membership = await getStoreMembership(storeSlug)

  if (!membership) {
    redirect("/login")
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">{membership.storeName}</span>
        <div className="flex items-center gap-3">
          <Link href={`/admin/${storeSlug}/settings`} className="text-sm underline">
            Settings
          </Link>
          <SignOutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  )
}
