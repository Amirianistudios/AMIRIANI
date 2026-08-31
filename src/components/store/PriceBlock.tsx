import { formatMoney } from '@/lib/money'

export interface PriceBlockProps {
  priceCents: number
  compareAtCents?: number | null
  currency?: string
  /** `price--large` on the product page, default size on cards. */
  large?: boolean
  soldOut?: boolean
}

/**
 * Price display.
 *
 * Mirrors Dawn's price component markup, including the visually-hidden
 * "Regular price"/"Sale price" labels that screen readers rely on to tell a
 * struck-through price from the one actually charged.
 */
export function PriceBlock({
  priceCents,
  compareAtCents,
  currency = 'EUR',
  large,
  soldOut,
}: PriceBlockProps) {
  const onSale = Boolean(compareAtCents && compareAtCents > priceCents)

  const classes = [
    'price',
    large ? 'price--large' : null,
    onSale ? 'price--on-sale' : null,
    soldOut ? 'price--sold-out' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <div className="price__container">
        <div className="price__regular">
          <span className="visually-hidden visually-hidden--inline">Regular price</span>
          <span className="price-item price-item--regular">
            {formatMoney(priceCents, currency)}
          </span>
        </div>

        <div className="price__sale">
          <span className="visually-hidden visually-hidden--inline">Regular price</span>
          <span>
            <s className="price-item price-item--regular">
              {compareAtCents ? formatMoney(compareAtCents, currency) : null}
            </s>
          </span>
          <span className="visually-hidden visually-hidden--inline">Sale price</span>
          <span className="price-item price-item--sale price-item--last">
            {formatMoney(priceCents, currency)}
          </span>
        </div>
      </div>
    </div>
  )
}
