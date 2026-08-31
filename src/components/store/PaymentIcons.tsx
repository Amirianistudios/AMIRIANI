/* eslint-disable @next/next/no-img-element */

/**
 * Footer payment badges.
 *
 * The marks are the same ones the reference storefront renders, extracted to
 * static SVGs in /public/payment. Shop Pay is deliberately absent: it is a
 * Shopify-operated wallet and will not be an available method once the store
 * runs on Stripe, so advertising it would misrepresent checkout.
 *
 * Plain <img> rather than next/image: these are tiny fixed-size static SVGs,
 * where the optimiser adds a request and no benefit.
 */

const METHODS = [
  { slug: 'american-express', name: 'American Express' },
  { slug: 'apple-pay', name: 'Apple Pay' },
  { slug: 'bancontact', name: 'Bancontact' },
  { slug: 'google-pay', name: 'Google Pay' },
  { slug: 'ideal-wero', name: 'iDEAL Wero' },
  { slug: 'klarna', name: 'Klarna' },
  { slug: 'maestro', name: 'Maestro' },
  { slug: 'mastercard', name: 'Mastercard' },
  { slug: 'mobilepay', name: 'MobilePay' },
  { slug: 'paypal', name: 'PayPal' },
  { slug: 'union-pay', name: 'Union Pay' },
  { slug: 'visa', name: 'Visa' },
]

export function PaymentIcons() {
  return (
    <ul className="list list-payment" role="list">
      {METHODS.map((method) => (
        <li key={method.slug} className="list-payment__item">
          <img
            src={`/payment/${method.slug}.svg`}
            alt={method.name}
            width={38}
            height={24}
            className="icon icon--full-color"
            loading="lazy"
            decoding="async"
          />
        </li>
      ))}
    </ul>
  )
}
