import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { LoginForm } from '@/components/store/AuthForms'
import { getUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Login',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  if (await getUser()) redirect('/account')

  return (
    <div className="shopify-section section">
      <div className="page-width page-width--narrow section-padding-default">
        <h1 className="title title--primary">Login</h1>
        <LoginForm />
        <p>
          <Link href="/account/register" className="underlined-link">Create account</Link>
          {' · '}
          <Link href="/account/reset" className="underlined-link">Forgot your password?</Link>
        </p>
      </div>
    </div>
  )
}
