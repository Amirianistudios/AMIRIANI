import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { SignOutButton } from '@/components/store/AuthForms'
import { getCurrentCustomer } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Account',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const customer = await getCurrentCustomer()
  if (!customer) redirect('/account/login')

  // Read through the request-scoped client so RLS enforces that these are the
  // signed-in customer's own orders.
  const supabase = await createSupabaseServerClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, order_number, created_at, total_cents, currency, payment_status, fulfilment_status')
    .order('created_at', { ascending: false })
    .limit(20)

  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ')

  return (
    <div className="shopify-section section">
      <div className="page-width section-padding-default">
        <div className="title-wrapper-with-link">
          <h1 className="title title--primary">Account</h1>
          <SignOutButton />
        </div>

        <p>{name ? `${name} — ${customer.email}` : customer.email}</p>

        <h2 className="h4">Order history</h2>
        {!orders || orders.length === 0 ? (
          <p>You have not placed any orders yet.</p>
        ) : (
          <table className="cart-items">
            <thead>
              <tr>
                <th scope="col" className="caption-with-letter-spacing">Order</th>
                <th scope="col" className="caption-with-letter-spacing">Date</th>
                <th scope="col" className="caption-with-letter-spacing">Payment</th>
                <th scope="col" className="caption-with-letter-spacing">Fulfilment</th>
                <th scope="col" className="caption-with-letter-spacing right">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>{order.order_number}</td>
                  <td>{new Date(order.created_at).toLocaleDateString('en-GB')}</td>
                  <td>{order.payment_status}</td>
                  <td>{order.fulfilment_status}</td>
                  <td className="right">{formatMoney(order.total_cents, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p>
          <Link href="/collections/all" className="underlined-link">
            Continue shopping
          </Link>
        </p>
      </div>
    </div>
  )
}
