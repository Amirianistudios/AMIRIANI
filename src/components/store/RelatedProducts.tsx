import { ProductCard } from '@/components/store/ProductCard'
import type { Product } from '@/lib/catalog'

/**
 * "You may also like", below the product.
 *
 * Markup mirrors Dawn's related-products section, because
 * `src/styles/dawn/section-related-products.css` is what lays it out — the
 * heading spacing and the grid columns come from those class names.
 *
 * The reference store loads this over AJAX into a `<product-recommendations>`
 * custom element, so the section is briefly empty on first paint and the cards
 * arrive afterwards. Here the products are already known on the server, so they
 * are rendered with the page: same result, one fewer request, and no layout
 * shift when it lands.
 */
export function RelatedProducts({ products }: { products: Product[] }) {
  if (products.length === 0) return null

  return (
    <section className="shopify-section section">
      <div className="color-scheme-custom gradient">
        <div className="related-products page-width section-related-products-padding isolate scroll-trigger animate--slide-in">
          <h2 className="related-products__heading inline-richtext h2">You may also like</h2>

          <ul
            className="grid product-grid grid--4-col-desktop grid--2-col-tablet-down contains-card contains-card--product contains-card--standard"
            role="list"
          >
            {products.map((product) => (
              <li key={product.id} className="grid__item">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
