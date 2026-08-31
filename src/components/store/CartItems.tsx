'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { useCart } from '@/components/store/CartProvider'
import { IconMinus, IconPlus, IconRemove } from '@/components/store/Icons'
import { formatMoney } from '@/lib/money'

/**
 * Cart page contents.
 *
 * Dawn's cart table markup, so component-cart-items.css lays out the columns,
 * the quantity stepper and the totals block exactly as on the reference store.
 */
export function CartItems() {
  const { cart, updateLine, removeLine, pending, error } = useCart()
  const router = useRouter()

  if (cart.lines.length === 0) {
    return (
      <div className="cart__empty-text-wrapper">
        <h1 className="title title--primary">Your cart is empty</h1>
        <Link href="/collections/all" className="button">
          Continue shopping
        </Link>
      </div>
    )
  }

  const unavailable = cart.lines.filter((line) => !line.available)

  return (
    <>
      <div className="title-wrapper-with-link title-wrapper--self-padded-tablet-down">
        <h1 className="title title--primary">Your cart</h1>
        <Link href="/collections/all" className="underlined-link">
          Continue shopping
        </Link>
      </div>

      {error && (
        <div className="cart__warnings form__message form__message--error" role="alert">
          {error}
        </div>
      )}

      {unavailable.length > 0 && (
        <div className="cart__warnings form__message form__message--error" role="alert">
          Some items are no longer available in the quantity requested. Please adjust
          them before checking out.
        </div>
      )}

      <form className="cart__contents critical-hidden">
        <div className="cart__items" id="main-cart-items">
          <cart-items>
            <table className="cart-items">
              <thead>
                <tr>
                  {/*
                    "Product" spans two columns — the image and the details —
                    which is what keeps the four body cells aligned under the
                    four headings. Without the colspan the table distributes
                    widths across five slots and the row layout breaks.
                  */}
                  <th className="caption-with-letter-spacing" colSpan={2} scope="col">
                    Product
                  </th>
                  <th className="medium-hide large-up-hide right" colSpan={1} scope="col">
                    Total
                  </th>
                  <th
                    className="cart-items__heading--wide caption-with-letter-spacing small-hide"
                    colSpan={1}
                    scope="col"
                  >
                    Quantity
                  </th>
                  <th className="small-hide right caption-with-letter-spacing" colSpan={1} scope="col">
                    Total
                  </th>
                </tr>
              </thead>

              <tbody>
                {cart.lines.map((line) => (
                  <tr key={line.id} className="cart-item">
                    <td className="cart-item__media">
                      {line.imageUrl && (
                        <Link
                          href={`/products/${line.productSlug}`}
                          className="cart-item__link"
                          aria-hidden="true"
                          tabIndex={-1}
                        >
                          <img
                            className="cart-item__image"
                            src={line.imageUrl}
                            alt={line.productTitle}
                            width={150}
                            height={150}
                            loading="lazy"
                          />
                        </Link>
                      )}
                    </td>

                    <td className="cart-item__details">
                      <Link
                        href={`/products/${line.productSlug}`}
                        className="cart-item__name h4 break"
                      >
                        {line.productTitle}
                      </Link>
                      <div className="product-option">{line.variantTitle}</div>
                      <div className="cart-item__price-wrapper">
                        <span className="price price--end">
                          {formatMoney(line.unitPriceCents, cart.currency)}
                        </span>
                      </div>
                      {!line.available && (
                        <small className="cart-item__error-text">
                          {line.availableQuantity === 0
                            ? 'Sold out'
                            : `Only ${line.availableQuantity} left`}
                        </small>
                      )}
                    </td>

                    <td className="cart-item__quantity">
                      <div className="cart-item__quantity-wrapper quantity-popover-container">
                        <quantity-input className="quantity">
                          <button
                            type="button"
                            className="quantity__button"
                            name="minus"
                            aria-label={`Decrease quantity for ${line.productTitle}`}
                            disabled={pending}
                            onClick={() => updateLine(line.id, line.quantity - 1)}
                          >
                            <IconMinus className="icon icon-minus" />
                          </button>
                          <input
                            className="quantity__input"
                            type="number"
                            value={line.quantity}
                            min={0}
                            max={99}
                            aria-label={`Quantity for ${line.productTitle}`}
                            onChange={(event) => {
                              const next = Number(event.target.value)
                              if (Number.isInteger(next) && next >= 0 && next <= 99) {
                                void updateLine(line.id, next)
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="quantity__button"
                            name="plus"
                            aria-label={`Increase quantity for ${line.productTitle}`}
                            disabled={
                              pending ||
                              (line.availableQuantity !== null &&
                                line.quantity >= line.availableQuantity)
                            }
                            onClick={() => updateLine(line.id, line.quantity + 1)}
                          >
                            <IconPlus className="icon icon-plus" />
                          </button>
                        </quantity-input>

                        {/*
                          Dawn sizes this with the element selector
                          `.cart-item cart-remove-button{width:4.5rem;height:4.5rem}`,
                          so the custom element has to be the wrapper — a class
                          alone leaves the icon unconstrained and oversized.
                        */}
                        <cart-remove-button>
                          <button
                            type="button"
                            className="button button--tertiary"
                            aria-label={`Remove ${line.productTitle}`}
                            disabled={pending}
                            onClick={() => removeLine(line.id)}
                          >
                            <IconRemove className="icon icon-remove" />
                          </button>
                        </cart-remove-button>
                      </div>
                    </td>

                    <td className="cart-item__totals right small-hide">
                      <div className="cart-item__price-wrapper">
                        <span className="price price--end">
                          {formatMoney(line.lineTotalCents, cart.currency)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </cart-items>
        </div>
      </form>

      <div className="cart__footer isolate">
        <div className="totals">
          <h2 className="totals__total">Estimated total</h2>
          <p className="totals__total-value">
            {formatMoney(cart.subtotalCents, cart.currency)}
          </p>
        </div>

        <small className="tax-note caption-large rte">
          Taxes included. Discounts and shipping calculated at checkout.
        </small>

        <div className="cart__ctas">
          <button
            type="button"
            className="cart__checkout-button button"
            disabled={pending || unavailable.length > 0}
            onClick={() => router.push('/checkout')}
          >
            Check out
          </button>
        </div>
      </div>
    </>
  )
}
