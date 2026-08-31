/**
 * Money formatting.
 *
 * The reference storefront renders prices as `€99,95` and `€1.234,56` — the
 * Shopify "amount with comma separator" format for EUR, with no space between
 * symbol and number. `Intl.NumberFormat` inserts a non-breaking space for most
 * euro locales, which would visibly differ, so the format is built by hand.
 *
 * All amounts move through the system as integer minor units. There are no
 * floating-point prices anywhere.
 */

const SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
}

export function formatMoney(cents: number, currency = 'EUR'): string {
  const symbol = SYMBOLS[currency] ?? `${currency} `
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))

  const whole = Math.floor(abs / 100)
  const fraction = String(abs % 100).padStart(2, '0')

  // Dot as the thousands separator, comma as the decimal separator.
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  return `${negative ? '-' : ''}${symbol}${grouped},${fraction}`
}

/** Parses a decimal string such as "99.95" into 9995 minor units. */
export function parsePriceToCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
  if (!Number.isFinite(numeric)) return null
  return Math.round(numeric * 100)
}
