import Image from 'next/image'
import Link from 'next/link'

import { PriceBlock } from '@/components/store/PriceBlock'
import type { Product } from '@/lib/catalog'

export interface ProductCardProps {
  product: Product
  /** Matches Dawn's `sizes` per grid so the browser picks the right source. */
  sizes?: string
  priority?: boolean
}

const DEFAULT_SIZES =
  '(min-width: 1400px) 317px, (min-width: 990px) calc((100vw - 130px) / 4), (min-width: 750px) calc((100vw - 120px) / 3), calc((100vw - 35px) / 2)'

/**
 * Standard product card.
 *
 * Reproduces Dawn's `card--standard card--media` structure, including the
 * second-image hover swap (`media--hover-effect`) and the 1:1 `--ratio-percent`
 * the reference store uses. The nested card__content blocks look redundant but
 * they are what Dawn emits and what component-card.css positions, so they stay.
 */
export function ProductCard({ product, sizes = DEFAULT_SIZES, priority }: ProductCardProps) {
  const [primary, secondary] = product.images
  const href = `/products/${product.slug}`
  const soldOut = !product.available

  return (
    <div className="card-wrapper product-card-wrapper underline-links-hover">
      <div
        className={`card card--standard${primary ? ' card--media' : ' card--text'}`}
        style={{ '--ratio-percent': '100%' } as React.CSSProperties}
      >
        <div
          className="card__inner color-scheme-custom gradient ratio"
          style={{ '--ratio-percent': '100%' } as React.CSSProperties}
        >
          {primary && (
            <div className="card__media">
              <div
                className={`media media--transparent${
                  secondary ? ' media--hover-effect' : ''
                }`}
              >
                <Image
                  src={primary.url}
                  alt={primary.alt}
                  width={primary.width ?? 2000}
                  height={primary.height ?? 2000}
                  sizes={sizes}
                  className="motion-reduce"
                  priority={priority}
                  loading={priority ? undefined : 'lazy'}
                />
                {secondary && (
                  <Image
                    src={secondary.url}
                    alt={secondary.alt}
                    width={secondary.width ?? 2000}
                    height={secondary.height ?? 2000}
                    sizes={sizes}
                    className="motion-reduce"
                    loading="lazy"
                  />
                )}
              </div>
            </div>
          )}

          <div className="card__content">
            <div className="card__information">
              <h3 className="card__heading">
                <Link href={href} className="full-unstyled-link">
                  {product.title}
                </Link>
              </h3>
            </div>
            <div className="card__badge bottom left">
              {soldOut && <span className="badge color-accent-3">Sold out</span>}
            </div>
          </div>
        </div>

        <div className="card__content">
          <div className="card__information">
            <h3 className="card__heading h5">
              <Link href={href} className="full-unstyled-link">
                {product.title}
              </Link>
            </h3>
            <div className="card-information">
              <span className="caption-large light" />
              <PriceBlock
                priceCents={product.priceCents}
                compareAtCents={product.compareAtCents}
                currency={product.currency}
                soldOut={soldOut}
              />
            </div>
          </div>
          <div className="card__badge bottom left" />
        </div>
      </div>
    </div>
  )
}
