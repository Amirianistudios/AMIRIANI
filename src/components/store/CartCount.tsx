'use client'

import { useCart } from '@/components/store/CartProvider'

/**
 * The count bubble on the header cart icon.
 *
 * Dawn renders nothing at all when the cart is empty, so the icon sits alone.
 */
export function CartCount() {
  const { cart } = useCart()
  if (cart.itemCount === 0) return null

  return (
    <div className="cart-count-bubble">
      <span aria-hidden="true">{cart.itemCount}</span>
      <span className="visually-hidden">
        {cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'}
      </span>
    </div>
  )
}
