import type { Metadata } from 'next'
import Link from 'next/link'

import { clearCartCookie } from '@/lib/cart/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Order confirmed',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

/**
 * Post-payment confirmation.
 *
 * This page only *reports* status — it never marks an order paid. That is the
 * Stripe webhook's job, because anyone can navigate here. If the webhook has
 * not landed yet the order still reads as pending, which is shown honestly
 * rather than claiming success.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>
}) {
  const { order: orderNumber } = await searchParams

  // The cart was closed by the checkout transaction; drop the cookie so the
  // header count resets.
  await clearCartCookie()

  if (!orderNumber) {
    return (
      <div className="shopify-section section">
        <div className="page-width page-width--narrow section-padding-default center">
          <h1 className="title title--primary">Thank you</h1>
          <p>Your order has been received.</p>
          <Link href="/collections/all" className="button">
            Continue shopping
          </Link>
        </div>
      </div>
    )
  }

  const supabase = createSupabaseAdminClient()
  const { data: order } = await supabase
    .from('orders')
    .select('order_number, email, total_cents, currency, payment_status')
    .eq('order_number', orderNumber)
    .maybeSingle()

  return (
    <div className="shopify-section section">
      <div className="page-width page-width--narrow section-padding-default center">
        <h1 className="title title--primary">Thank you</h1>

        {order ? (
          <>
            <p>
              Order <strong>{order.order_number}</strong> has been received. A
              confirmation is on its way to {order.email}.
            </p>
            <p className="h4">{formatMoney(order.total_cents, order.currency)}</p>
            {order.payment_status !== 'paid' && (
              <p className="caption">
                Payment is still being confirmed. This page will show as paid once
                your bank and Stripe have completed the transaction — no further
                action is needed.
              </p>
            )}
          </>
        ) : (
          <p>Your order has been received.</p>
        )}

        <Link href="/collections/all" className="button">
          Continue shopping
        </Link>
      </div>
    </div>
  )
}
