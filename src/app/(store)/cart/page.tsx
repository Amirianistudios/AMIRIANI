import type { Metadata } from 'next'

import { CartItems } from '@/components/store/CartItems'
import { getUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Your Cart',
  robots: { index: false, follow: true },
}

// The cart is per-visitor, so it must never be cached.
export const dynamic = 'force-dynamic'

export default async function CartPage() {
  // The reference only offers "Log in to check out faster" to guests.
  const signedIn = Boolean(await getUser())

  return (
    <div className="shopify-section section section-cart-items section-cart-footer">
      {/*
        Full-bleed white, as the reference's <cart-items> element is. The page
        body is cream; without this the cart sat on cream where the reference
        shows white from edge to edge.
      */}
      <div className="gradient color-scheme-custom">
        <div className="cart section-cart-items-padding page-width" id="main-cart-items">
          <CartItems signedIn={signedIn} />
        </div>
      </div>
    </div>
  )
}
