import type { Metadata } from 'next'
import Link from 'next/link'

import { ResetForm } from '@/components/store/AuthForms'

export const metadata: Metadata = {
  title: 'Reset password',
  robots: { index: false, follow: false },
}

export default function ResetPage() {
  return (
    <div className="shopify-section section">
      <div className="page-width page-width--narrow section-padding-default">
        <h1 className="title title--primary">Reset your password</h1>
        <p>We will email you a link to choose a new password.</p>
        <ResetForm />
        <p>
          <Link href="/account/login" className="underlined-link">Back to login</Link>
        </p>
      </div>
    </div>
  )
}
