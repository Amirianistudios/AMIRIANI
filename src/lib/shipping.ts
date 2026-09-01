/**
 * Shipping rates.
 *
 * These are the reference Shopify store's *actual* configured rates, read from
 * its live checkout via `/cart/shipping_rates.json` for each country — not from
 * its shipping policy page, which disagrees with the configuration (see the
 * note on FREE_SHIPPING below).
 *
 * Observed on the live store (cart in EUR, Belgium market):
 *
 *   Zone   Countries                                Standard   Above threshold
 *   EU     BE NL FR DE AT LU SE DK CZ               €8.56      + "EU Flat Rate" €4.12
 *   UK     GB                                       €8.56      + "GB Flat Rate" €3.95
 *   EFTA   CH                                       €11.15     + "FT Flat Rate" €8.60
 *
 * Every other country tested returned no rates at all — ES, IT, IE, PT, PL, FI,
 * SK, HU, HR, GR, RO, BG, EE, LV, LT, SI, NO, US, CA, AU — so the store does
 * not ship there. We reproduce that: checkout is refused for an unserved
 * country rather than inventing a price.
 *
 * Rates are quoted per order, not per item, and do not vary with weight.
 *
 * IMPORTANT: this module is the only source of shipping prices. The browser
 * sends a rate *code*, never an amount; the checkout route re-derives the price
 * from this table.
 */

export interface ShippingRate {
  /** Stable identifier the browser sends back; the price is never sent. */
  code: string
  /** Exactly the label the reference checkout shows. */
  label: string
  priceCents: number
}

interface Zone {
  id: string
  countries: string[]
  standard: { code: string; label: string; priceCents: number }
  /** Cheaper option that appears once the subtotal reaches the threshold. */
  discounted?: { code: string; label: string; priceCents: number }
}

/**
 * Subtotal at which the second, cheaper rate appears.
 *
 * Bounded empirically: a €149.95 cart offered only the standard rate, a €199.90
 * cart offered both. The store's own shipping policy says "complimentary
 * shipping on all orders above €199.95", but no zone is configured with a €0
 * rate — the cheaper option is €4.12 (EU) / €3.95 (UK) / €8.60 (EFTA). We
 * reproduce the configuration, because that is what customers are actually
 * charged.
 *
 * The exact value is somewhere in (€149.95, €199.90]; €199.90 reproduces the
 * observed behaviour at every price point tested. Confirm it in Shopify admin
 * (Settings → Shipping and delivery) and set FREE_SHIPPING_THRESHOLD_CENTS if
 * it differs.
 */
export const DEFAULT_DISCOUNT_THRESHOLD_CENTS = 19990

const ZONES: Zone[] = [
  {
    id: 'eu',
    countries: ['BE', 'NL', 'FR', 'DE', 'AT', 'LU', 'SE', 'DK', 'CZ'],
    standard: {
      code: 'eu-standard',
      label: 'AMIRIANI Delivery — EU Zone',
      priceCents: 856,
    },
    discounted: { code: 'eu-flat', label: 'EU Flat Rate', priceCents: 412 },
  },
  {
    id: 'uk',
    countries: ['GB'],
    standard: {
      code: 'uk-standard',
      label: 'AMIRIANI Delivery — UK Zone',
      priceCents: 856,
    },
    discounted: { code: 'gb-flat', label: 'GB Flat Rate', priceCents: 395 },
  },
  {
    id: 'efta',
    countries: ['CH'],
    standard: {
      code: 'efta-standard',
      label: 'AMIRIANI Delivery — EFTA Zone',
      priceCents: 1115,
    },
    discounted: { code: 'ft-flat', label: 'FT Flat Rate', priceCents: 860 },
  },
]

/** Every country the store ships to, for the checkout country selector. */
export const SUPPORTED_COUNTRIES: { code: string; name: string }[] = [
  { code: 'BE', name: 'Belgium' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'AT', name: 'Austria' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'SE', name: 'Sweden' },
  { code: 'DK', name: 'Denmark' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CH', name: 'Switzerland' },
]

function zoneFor(countryCode: string): Zone | null {
  const code = countryCode.trim().toUpperCase()
  return ZONES.find((zone) => zone.countries.includes(code)) ?? null
}

export function shipsTo(countryCode: string): boolean {
  return zoneFor(countryCode) !== null
}

/**
 * Rates available for a destination and cart subtotal, cheapest first — the
 * order the reference checkout presents them in.
 *
 * An empty array means the store does not ship there.
 */
export function getShippingRates(
  countryCode: string,
  subtotalCents: number,
  thresholdCents: number = DEFAULT_DISCOUNT_THRESHOLD_CENTS,
): ShippingRate[] {
  const zone = zoneFor(countryCode)
  if (!zone) return []

  const rates: ShippingRate[] = []
  if (zone.discounted && subtotalCents >= thresholdCents) {
    rates.push({ ...zone.discounted })
  }
  rates.push({ ...zone.standard })

  return rates
}

/**
 * Resolves a rate code to its price, for a given destination and subtotal.
 *
 * Returns null when the code is not one this destination and subtotal actually
 * offers — which is what stops a browser selecting the cheap rate on a cart
 * that has not earned it, or a rate from another zone entirely.
 */
export function resolveShippingRate(
  countryCode: string,
  subtotalCents: number,
  code: string | null | undefined,
  thresholdCents: number = DEFAULT_DISCOUNT_THRESHOLD_CENTS,
): ShippingRate | null {
  const rates = getShippingRates(countryCode, subtotalCents, thresholdCents)
  if (rates.length === 0) return null

  // No selection means the default: the cheapest rate on offer.
  if (!code) return rates[0]!

  return rates.find((rate) => rate.code === code) ?? null
}
