import type { Metadata } from 'next'

import { CartItems } from '@/components/store/CartItems'

export const metadata: Metadata = {
  title: 'Your Cart',
  robots: { index: false, follow: true },
}

// The cart is per-visitor, so it must never be cached.
export const dynamic = 'force-dynamic'

export default function CartPage() {
  return (
    <div className="shopify-section section section-cart-items section-cart-footer">
      <div className="cart section-cart-items-padding page-width" id="main-cart-items">
        <CartItems />
      </div>
    </div>
  )
}
