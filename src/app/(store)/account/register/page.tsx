import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { RegisterForm } from '@/components/store/AuthForms'
import { getUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Create account',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function RegisterPage() {
  if (await getUser()) redirect('/account')

  return (
    <div className="shopify-section section">
      <div className="page-width page-width--narrow section-padding-default">
        <h1 className="title title--primary">Create account</h1>
        <RegisterForm />
        <p>
          <Link href="/account/login" className="underlined-link">Already have an account?</Link>
        </p>
      </div>
    </div>
  )
}
