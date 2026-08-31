'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import { PriceBlock } from '@/components/store/PriceBlock'
import { useCart } from '@/components/store/CartProvider'
import type { Product } from '@/lib/catalog'

/**
 * Variant picker and add-to-cart.
 *
 * The reference store presents its single "Size" option as Dawn variant pills
 * (`product-form__input--pill`), so that is what is rendered here. Products
 * with more than one option fall back to one pill group per option, which is
 * the same component Dawn would use.
 *
 * The price shown updates with the selection, but it is only ever a display:
 * the server re-reads the price from the database at checkout, so nothing the
 * browser sends can influence what is charged.
 */
export function ProductForm({ product }: { product: Product }) {
  const firstAvailable =
    product.variants.find((variant) => variant.available) ?? product.variants[0]

  const [selectedId, setSelectedId] = useState(firstAvailable?.id ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const { addItem, pending } = useCart()

  const selected = useMemo(
    () => product.variants.find((variant) => variant.id === selectedId) ?? firstAvailable,
    [product.variants, selectedId, firstAvailable],
  )

  if (!selected) {
    return (
      <p className="product__text" role="status">
        This product is currently unavailable.
      </p>
    )
  }

  const soldOut = !selected.available

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || soldOut || pending) return

    setMessage(null)
    const ok = await addItem(selected.id, 1, {
      title: product.title,
      variantTitle: selected.title,
      imageUrl: product.images[0]?.url ?? null,
    })

    if (!ok) setMessage('Could not add this item. Please try again.')
  }

  return (
    <>
      <div id="price-product" role="status">
        <PriceBlock
          priceCents={selected.priceCents}
          compareAtCents={selected.compareAtCents}
          currency={product.currency}
          large
          soldOut={soldOut}
        />
      </div>

      <div className="product__tax caption rte">
        Taxes included. <Link href="/policies/shipping-policy">Shipping</Link> calculated
        at checkout.
      </div>

      {product.variants.length > 1 && (
        <variant-selects data-section="product">
          <fieldset className="js product-form__input product-form__input--pill">
            <legend className="form__label">Size</legend>
            {product.variants.map((variant) => (
              <span key={variant.id}>
                <input
                  type="radio"
                  id={`variant-${variant.id}`}
                  name="Size"
                  value={variant.title}
                  checked={variant.id === selected.id}
                  onChange={() => {
                    setSelectedId(variant.id)
                    setMessage(null)
                  }}
                  className={variant.available ? undefined : 'disabled'}
                />
                <label htmlFor={`variant-${variant.id}`}>
                  {variant.size ?? variant.title}
                  {!variant.available && (
                    <span className="visually-hidden label-unavailable">
                      Variant sold out or unavailable
                    </span>
                  )}
                </label>
              </span>
            ))}
          </fieldset>
        </variant-selects>
      )}

      <div>
        <product-form className="product-form" data-section-id="product">
          {message && (
            <div className="product-form__error-message-wrapper" role="alert">
              <span className="product-form__error-message">{message}</span>
            </div>
          )}

          <form className="form" onSubmit={onSubmit}>
            <div className="product-form__buttons">
              <button
                type="submit"
                name="add"
                className="product-form__submit button button--full-width button--primary"
                disabled={soldOut || pending}
                aria-busy={pending}
              >
                <span>{soldOut ? 'Sold out' : 'Add to cart'}</span>
              </button>
            </div>
          </form>
        </product-form>
      </div>
    </>
  )
}
