import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { CheckoutForm } from '@/components/store/CheckoutForm'
import { getCart } from '@/lib/cart/server'
import { FREE_SHIPPING_THRESHOLD_CENTS, SHIPPING_FLAT_RATE_CENTS } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function CheckoutPage() {
  const cart = await getCart()
  if (cart.lines.length === 0) redirect('/cart')

  // Shown for information only. The server recomputes both at order time, so a
  // stale page cannot influence what is charged.
  const shippingCents =
    cart.subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS() ? 0 : SHIPPING_FLAT_RATE_CENTS()

  return (
    <div className="shopify-section section">
      <div className="page-width page-width--narrow section-padding-default">
        <CheckoutForm cart={cart} shippingCents={shippingCents} />
      </div>
    </div>
  )
}
