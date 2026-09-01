import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { CheckoutForm } from '@/components/store/CheckoutForm'
import { getCart } from '@/lib/cart/server'
import { FREE_SHIPPING_THRESHOLD_CENTS } from '@/lib/env'
import { SUPPORTED_COUNTRIES, getShippingRates } from '@/lib/shipping'

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function CheckoutPage() {
  const cart = await getCart()
  if (cart.lines.length === 0) redirect('/cart')

  // Belgium is the store's home market, so its rates are what the page opens
  // with. Changing the country refetches from /api/shipping-rates, and the
  // checkout route re-derives the price again from the chosen rate code.
  const initialRates = getShippingRates(
    'BE',
    cart.subtotalCents,
    FREE_SHIPPING_THRESHOLD_CENTS(),
  )

  return (
    <div className="shopify-section section">
      <div className="page-width page-width--narrow section-padding-default">
        <CheckoutForm
          cart={cart}
          countries={SUPPORTED_COUNTRIES}
          initialRates={initialRates}
        />
      </div>
    </div>
  )
}
