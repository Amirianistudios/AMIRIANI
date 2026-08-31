import Link from 'next/link'

import { ProductCard } from '@/components/store/ProductCard'
import type { Product } from '@/lib/catalog'

export interface FeaturedCollectionProps {
  title: string | null
  description: string | null
  products: Product[]
  viewAllHref: string | null
}

/**
 * Homepage "The Essentials" row.
 *
 * A four-column desktop grid (two on tablet and below) holding standard product
 * cards, with a centred "View all" secondary button underneath — the reference
 * store shows three products in that four-column grid, so the last cell is
 * intentionally empty rather than the grid collapsing to three columns.
 */
export function FeaturedCollection({
  title,
  description,
  products,
  viewAllHref,
}: FeaturedCollectionProps) {
  if (products.length === 0) return null

  return (
    <section className="shopify-section section section-featured-collection">
      <div className="color-scheme-custom isolate gradient">
        <div className="collection section-featured-collection-padding">
          {(title || description) && (
            <div className="collection__title title-wrapper title-wrapper--no-top-margin page-width">
              {title && (
                <h2 className="title inline-richtext h1 scroll-trigger animate--slide-in">
                  {title}
                </h2>
              )}
              {description && (
                <div className="collection__description subtitle rte scroll-trigger animate--slide-in">
                  <p>{description}</p>
                </div>
              )}
            </div>
          )}

          {/*
            A real <slider-component>, not a div: Dawn's
            `slider-component.page-width{padding:0 1.5rem}` is element-qualified
            and beats `.page-width-desktop{padding:0}`, so a div would lose the
            mobile side gutter and the grid would sit flush to the screen edge.
          */}
          <slider-component className="slider-mobile-gutter page-width page-width-desktop scroll-trigger animate--slide-in">
            <ul
              className="grid product-grid contains-card contains-card--product contains-card--standard grid--4-col-desktop grid--2-col-tablet-down"
              role="list"
            >
              {products.map((product, index) => (
                <li
                  key={product.id}
                  className="grid__item scroll-trigger animate--slide-in"
                  data-cascade=""
                  style={{ '--animation-order': index + 1 } as React.CSSProperties}
                >
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          </slider-component>

          {viewAllHref && (
            <div className="center collection__view-all scroll-trigger animate--slide-in">
              <Link
                className="button"
                href={viewAllHref}
                aria-label={`View all products in the ${title ?? 'collection'} collection`}
              >
                View all
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
