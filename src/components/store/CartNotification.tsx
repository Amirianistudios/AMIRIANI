'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useEffect } from 'react'

import { useCart } from '@/components/store/CartProvider'
import { IconClose } from '@/components/store/Icons'

/**
 * "Added to cart" popup.
 *
 * The reference store uses Dawn's cart *notification* rather than a cart
 * drawer — confirmed by the presence of `cart-notification` and the absence of
 * any `<cart-drawer>` in its rendered markup — so that is what is reproduced:
 * a panel that drops in under the header and dismisses itself.
 */
export function CartNotification() {
  const { lastAdded, dismissNotification } = useCart()

  useEffect(() => {
    if (!lastAdded) return
    const timer = window.setTimeout(dismissNotification, 5000)
    return () => window.clearTimeout(timer)
  }, [lastAdded, dismissNotification])

  useEffect(() => {
    if (!lastAdded) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissNotification()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lastAdded, dismissNotification])

  return (
    <cart-notification>
      <div
        className={`cart-notification-wrapper page-width${lastAdded ? '' : ' hidden'}`}
      >
        <div
          className="cart-notification color-scheme-custom gradient focus-inset"
          aria-modal="true"
          aria-label="Item added to your cart"
          role="dialog"
          tabIndex={-1}
        >
          <div className="cart-notification__header">
            <h2 className="cart-notification__heading caption-large text-body">
              <span className="svg-wrapper">
                <svg
                  viewBox="0 0 12 9"
                  fill="none"
                  aria-hidden="true"
                  className="icon icon-checkmark"
                >
                  <path
                    d="M1 4.5l3.5 3.5L11 1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              Item added to your cart
            </h2>
            <button
              type="button"
              className="cart-notification__close modal__close-button link link--text focus-inset"
              aria-label="Close"
              onClick={dismissNotification}
            >
              <span className="svg-wrapper">
                <IconClose className="icon icon-close" />
              </span>
            </button>
          </div>

          {lastAdded && (
            <div className="cart-notification-product">
              {lastAdded.imageUrl && (
                <div className="cart-notification-product__image global-media-settings">
                  <img
                    src={lastAdded.imageUrl}
                    alt=""
                    width={70}
                    height={70}
                    loading="lazy"
                  />
                </div>
              )}
              <div>
                <h3 className="cart-notification-product__name h4">{lastAdded.title}</h3>
                <dl>
                  <div className="product-option">
                    <dt>Size</dt>
                    <dd>{lastAdded.variantTitle}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          <div className="cart-notification__links">
            <Link
              href="/cart"
              className="button button--full-width button--secondary"
              onClick={dismissNotification}
            >
              View cart
            </Link>
            <Link
              href="/checkout"
              className="button button--full-width button--primary"
              onClick={dismissNotification}
            >
              Check out
            </Link>
            <button
              type="button"
              className="link button-label"
              onClick={dismissNotification}
            >
              Continue shopping
            </button>
          </div>
        </div>
      </div>
    </cart-notification>
  )
}
