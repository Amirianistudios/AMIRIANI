import { AdminLoginForm } from '@/components/admin/AdminLoginForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Admin login',
  robots: { index: false, follow: false },
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>
}) {
  const { denied } = await searchParams

  return (
    <div className="tw:flex tw:min-h-screen tw:items-center tw:justify-center tw:bg-zinc-50 tw:p-6">
      <div className="tw:w-full tw:max-w-sm tw:rounded-lg tw:border tw:border-zinc-200 tw:bg-white tw:p-6">
        <h1 className="tw:mb-1 tw:text-lg tw:font-semibold">AMIRIANI admin</h1>
        <p className="tw:mb-5 tw:text-sm tw:text-zinc-600">Sign in to manage the store.</p>
        {denied && (
          <p className="tw:mb-4 tw:rounded tw:bg-red-50 tw:px-3 tw:py-2 tw:text-sm tw:text-red-800">
            That account does not have admin access.
          </p>
        )}
        <AdminLoginForm />
      </div>
    </div>
  )
}
