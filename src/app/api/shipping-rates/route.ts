import { NextResponse } from 'next/server'

import { getCart } from '@/lib/cart/server'
import { FREE_SHIPPING_THRESHOLD_CENTS } from '@/lib/env'
import { getShippingRates } from '@/lib/shipping'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Delivery options for a destination, priced against the visitor's real cart.
 *
 * The checkout page calls this when the country changes so the customer sees
 * the same options the order will be created with. It is a convenience for
 * display only — the checkout route independently re-derives the price from the
 * rate code, so a stale or tampered response here cannot change what is charged.
 */
export async function GET(request: Request) {
  const country = new URL(request.url).searchParams.get('country') ?? ''

  if (!/^[A-Za-z]{2}$/.test(country)) {
    return NextResponse.json({ error: 'Invalid country.' }, { status: 400 })
  }

  const cart = await getCart()
  const rates = getShippingRates(
    country,
    cart.subtotalCents,
    FREE_SHIPPING_THRESHOLD_CENTS(),
  )

  return NextResponse.json({
    rates,
    shipsTo: rates.length > 0,
    subtotalCents: cart.subtotalCents,
    currency: cart.currency,
  })
}
