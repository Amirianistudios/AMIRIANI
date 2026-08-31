import Link from 'next/link'
import { redirect } from 'next/navigation'

import { isAdmin, getUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const NAV = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/collections', label: 'Collections' },
  { href: '/admin/customers', label: 'Customers' },
  { href: '/admin/discounts', label: 'Discounts' },
  { href: '/admin/content', label: 'Content' },
]

/**
 * Admin shell.
 *
 * Authorisation is enforced here, server-side, on every request: an
 * unauthenticated visitor is sent to the login page and a signed-in
 * non-admin is refused. `isAdmin()` reads the private `admin_users` table
 * rather than any client-supplied claim.
 *
 * This is defence in depth, not the only control — every admin query also
 * passes through RLS policies gated on `is_admin()`.
 */
export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getUser()
  if (!user) redirect('/admin/login')
  if (!(await isAdmin())) redirect('/admin/login?denied=1')

  return (
    <div className="tw:flex tw:min-h-screen">
        <aside className="tw:w-56 tw:shrink-0 tw:border-r tw:border-zinc-200 tw:bg-white tw:p-4">
          <Link href="/admin" className="tw:mb-6 tw:block tw:text-sm tw:font-semibold tw:tracking-widest">
            AMIRIANI
          </Link>
          <nav className="tw:flex tw:flex-col tw:gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="tw:rounded tw:px-3 tw:py-2 tw:text-sm tw:text-zinc-700 tw:hover:bg-zinc-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="tw:mt-8 tw:border-t tw:border-zinc-200 tw:pt-4 tw:text-xs tw:text-zinc-500">
            <p className="tw:mb-2 tw:break-all">{user.email}</p>
            <Link href="/" className="tw:underline">
              View store
            </Link>
          </div>
        </aside>

      <main className="tw:flex-1 tw:p-8">{children}</main>
    </div>
  )
}
