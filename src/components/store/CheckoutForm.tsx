'use client'

import { useState } from 'react'

import { formatMoney } from '@/lib/money'
import type { Cart } from '@/lib/cart/server'
import type { ShippingRate } from '@/lib/shipping'

/**
 * Checkout details form.
 *
 * Collects contact and shipping details, then hands off to Stripe Checkout for
 * payment — card details never touch this application. The totals shown here
 * are informational; the server re-prices the order from the database when it
 * is created.
 */
export function CheckoutForm({
  cart,
  countries,
  initialRates,
}: {
  cart: Cart
  countries: { code: string; name: string }[]
  initialRates: ShippingRate[]
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [country, setCountry] = useState('BE')
  const [rates, setRates] = useState<ShippingRate[]>(initialRates)
  const [rateCode, setRateCode] = useState(initialRates[0]?.code ?? '')

  /*
   * Options depend on the destination and the cart total, so they are refetched
   * when the customer picks a country — an event, not a synchronisation, so it
   * belongs in the handler rather than an effect. The checkout route prices the
   * order from the rate code regardless, so a stale list cannot alter the total.
   */
  async function onCountryChange(countryCode: string) {
    setCountry(countryCode)
    try {
      const res = await fetch(`/api/shipping-rates?country=${countryCode}`)
      if (!res.ok) return
      const payload = (await res.json()) as { rates: ShippingRate[] }
      setRates(payload.rates)
      setRateCode(payload.rates[0]?.code ?? '')
    } catch {
      // Keep whatever is on screen; checkout re-validates the selection anyway.
    }
  }

  const selectedRate = rates.find((rate) => rate.code === rateCode) ?? rates[0]
  const shippingCents = selectedRate?.priceCents ?? 0
  const total = cart.subtotalCents + shippingCents

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)

    const form = new FormData(event.currentTarget)
    const body = {
      email: String(form.get('email') ?? ''),
      shippingRateCode: rateCode || null,
      shippingAddress: {
        first_name: String(form.get('first_name') ?? ''),
        last_name: String(form.get('last_name') ?? ''),
        address1: String(form.get('address1') ?? ''),
        address2: String(form.get('address2') ?? '') || null,
        city: String(form.get('city') ?? ''),
        region: String(form.get('region') ?? '') || null,
        postcode: String(form.get('postcode') ?? ''),
        country_code: String(form.get('country_code') ?? 'BE'),
        phone: String(form.get('phone') ?? '') || null,
      },
      discountCode: String(form.get('discount_code') ?? '') || null,
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = (await res.json()) as { url?: string; error?: string }

      if (!res.ok || !payload.url) {
        setError(payload.error ?? 'Could not start checkout.')
        setSubmitting(false)
        return
      }

      // Hand off to Stripe's hosted page.
      window.location.href = payload.url
    } catch {
      setError('Network error. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h1 className="title title--primary">Checkout</h1>

      {error && (
        <div className="form__message form__message--error" role="alert">
          {error}
        </div>
      )}

      <h2 className="h4">Contact</h2>
      <div className="field">
        <input
          className="field__input"
          type="email"
          id="checkout-email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          required
        />
        <label className="field__label" htmlFor="checkout-email">
          Email
        </label>
      </div>

      <h2 className="h4">Shipping address</h2>
      <div className="contact__fields">
        <div className="field">
          <input
            className="field__input"
            type="text"
            id="checkout-first-name"
            name="first_name"
            placeholder="First name"
            autoComplete="given-name"
            required
          />
          <label className="field__label" htmlFor="checkout-first-name">
            First name
          </label>
        </div>
        <div className="field">
          <input
            className="field__input"
            type="text"
            id="checkout-last-name"
            name="last_name"
            placeholder="Last name"
            autoComplete="family-name"
            required
          />
          <label className="field__label" htmlFor="checkout-last-name">
            Last name
          </label>
        </div>
      </div>

      <div className="field">
        <input
          className="field__input"
          type="text"
          id="checkout-address1"
          name="address1"
          placeholder="Address"
          autoComplete="address-line1"
          required
        />
        <label className="field__label" htmlFor="checkout-address1">
          Address
        </label>
      </div>

      <div className="field">
        <input
          className="field__input"
          type="text"
          id="checkout-address2"
          name="address2"
          placeholder="Apartment, suite, etc. (optional)"
          autoComplete="address-line2"
        />
        <label className="field__label" htmlFor="checkout-address2">
          Apartment, suite, etc. (optional)
        </label>
      </div>

      <div className="contact__fields">
        <div className="field">
          <input
            className="field__input"
            type="text"
            id="checkout-postcode"
            name="postcode"
            placeholder="Postal code"
            autoComplete="postal-code"
            required
          />
          <label className="field__label" htmlFor="checkout-postcode">
            Postal code
          </label>
        </div>
        <div className="field">
          <input
            className="field__input"
            type="text"
            id="checkout-city"
            name="city"
            placeholder="City"
            autoComplete="address-level2"
            required
          />
          <label className="field__label" htmlFor="checkout-city">
            City
          </label>
        </div>
      </div>

      <div className="field">
        <select
          className="select__select"
          id="checkout-country"
          name="country_code"
          value={country}
          onChange={(event) => void onCountryChange(event.target.value)}
          required
        >
          {countries.map((entry) => (
            <option key={entry.code} value={entry.code}>
              {entry.name}
            </option>
          ))}
        </select>
        <label className="form__label" htmlFor="checkout-country">
          Country/region
        </label>
      </div>

      <div className="field">
        <input
          className="field__input"
          type="tel"
          id="checkout-phone"
          name="phone"
          placeholder="Phone (optional)"
          autoComplete="tel"
        />
        <label className="field__label" htmlFor="checkout-phone">
          Phone (optional)
        </label>
      </div>

      <div className="field">
        <input
          className="field__input"
          type="text"
          id="checkout-discount"
          name="discount_code"
          placeholder="Discount code (optional)"
        />
        <label className="field__label" htmlFor="checkout-discount">
          Discount code (optional)
        </label>
      </div>

      <h2 className="h4">Delivery</h2>
      {rates.length === 0 ? (
        <p className="form__message form__message--error" role="alert">
          We do not currently ship to that country.
        </p>
      ) : (
        <fieldset className="js product-form__input">
          <legend className="visually-hidden">Delivery option</legend>
          {rates.map((rate) => (
            <label key={rate.code} className="checkout__delivery-option">
              <input
                type="radio"
                name="shipping_rate"
                value={rate.code}
                checked={rate.code === rateCode}
                onChange={() => setRateCode(rate.code)}
              />
              <span>{rate.label}</span>
              <span>{formatMoney(rate.priceCents, cart.currency)}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="totals">
        <h2 className="totals__subtotal">Subtotal</h2>
        <p className="totals__subtotal-value">
          {formatMoney(cart.subtotalCents, cart.currency)}
        </p>
      </div>
      <div className="totals">
        <h2 className="totals__subtotal">Shipping</h2>
        <p className="totals__subtotal-value">
          {shippingCents === 0 ? 'Free' : formatMoney(shippingCents, cart.currency)}
        </p>
      </div>
      <div className="totals">
        <h2 className="totals__total">Total</h2>
        <p className="totals__total-value">{formatMoney(total, cart.currency)}</p>
      </div>

      <small className="tax-note caption-large rte">
        Taxes included. Any discount is applied and verified on the next step.
      </small>

      <div className="cart__ctas">
        <button
          type="submit"
          className="button button--full-width"
          disabled={submitting || rates.length === 0}
        >
          {submitting ? 'Redirecting…' : 'Continue to payment'}
        </button>
      </div>
    </form>
  )
}
