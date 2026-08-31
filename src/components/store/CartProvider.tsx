'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from 'react'

import type { Cart } from '@/lib/cart/server'

interface CartContextValue {
  cart: Cart
  pending: boolean
  error: string | null
  /** Last item added, used to drive the cart notification popup. */
  lastAdded: { title: string; variantTitle: string; imageUrl: string | null } | null
  dismissNotification: () => void
  addItem: (
    variantId: string,
    quantity: number,
    meta: { title: string; variantTitle: string; imageUrl: string | null },
  ) => Promise<boolean>
  updateLine: (lineId: string, quantity: number) => Promise<void>
  removeLine: (lineId: string) => Promise<void>
}

const CartContext = createContext<CartContextValue | null>(null)

const EMPTY: Cart = {
  id: '',
  token: '',
  currency: 'EUR',
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  discountCode: null,
}

export function CartProvider({
  initialCart,
  children,
}: {
  initialCart: Cart
  children: React.ReactNode
}) {
  const [cart, setCart] = useState<Cart>(initialCart ?? EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [lastAdded, setLastAdded] = useState<CartContextValue['lastAdded']>(null)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  const request = useCallback(
    async (method: string, body: unknown): Promise<boolean> => {
      setBusy(true)
      setError(null)
      try {
        const res = await fetch('/api/cart', {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const payload = (await res.json()) as { cart?: Cart; error?: string }

        if (!res.ok) {
          setError(payload.error ?? 'Something went wrong.')
          return false
        }
        if (payload.cart) setCart(payload.cart)
        return true
      } catch {
        setError('Network error. Please try again.')
        return false
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const addItem = useCallback<CartContextValue['addItem']>(
    async (variantId, quantity, meta) => {
      const ok = await request('POST', { variantId, quantity })
      if (ok) {
        setLastAdded(meta)
        // Keep the server components in step with the new cart state.
        startTransition(() => {})
      }
      return ok
    },
    [request],
  )

  const updateLine = useCallback<CartContextValue['updateLine']>(
    async (lineId, quantity) => {
      await request('PATCH', { lineId, quantity })
    },
    [request],
  )

  const removeLine = useCallback<CartContextValue['removeLine']>(
    async (lineId) => {
      await request('DELETE', { lineId })
    },
    [request],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      pending: pending || busy,
      error,
      lastAdded,
      dismissNotification: () => setLastAdded(null),
      addItem,
      updateLine,
      removeLine,
    }),
    [cart, pending, busy, error, lastAdded, addItem, updateLine, removeLine],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used inside CartProvider')
  return context
}
