/**
 * Admin root layout.
 *
 * Deliberately contains no authorisation: the login page lives under /admin and
 * would otherwise be caught by its own guard, redirecting to itself forever.
 * The guard is in (dashboard)/layout.tsx, which wraps every screen except login.
 */
export const metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="tw:min-h-screen tw:bg-zinc-50 tw:text-zinc-900">{children}</div>
}
