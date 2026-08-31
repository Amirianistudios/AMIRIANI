import type { Metadata } from 'next'

import { ProductCard } from '@/components/store/ProductCard'
import { searchProducts } from '@/lib/catalog'

export const metadata: Metadata = {
  title: 'Search',
  robots: { index: false, follow: true },
}

export const dynamic = 'force-dynamic'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const term = (q ?? '').trim()
  const results = term ? await searchProducts(term) : []

  return (
    <div className="shopify-section section">
      <div className="template-search section-padding-default page-width">
        <div className="template-search__header center">
          <h1 className="h2">{term ? `Search results for "${term}"` : 'Search'}</h1>

          <form action="/search" method="get" role="search" className="search">
            <div className="field">
              <input
                className="search__input field__input"
                id="Search-In-Template"
                type="search"
                name="q"
                defaultValue={term}
                placeholder="Search"
              />
              <label className="field__label" htmlFor="Search-In-Template">
                Search
              </label>
              <button type="submit" className="search__button field__button" aria-label="Search">
                <span className="svg-wrapper">
                  <svg fill="none" viewBox="0 0 18 19" className="icon icon-search">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M11.03 11.68A5.784 5.784 0 112.85 3.5a5.784 5.784 0 018.18 8.18zm.26 1.12a6.78 6.78 0 11.72-.7l5.4 5.4a.5.5 0 11-.71.7l-5.41-5.4z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
              </button>
            </div>
          </form>
        </div>

        {term && (
          <p className="template-search__search-count center">
            {results.length === 0
              ? 'No results found.'
              : `${results.length} ${results.length === 1 ? 'result' : 'results'}`}
          </p>
        )}

        {results.length > 0 && (
          <ul
            className="grid product-grid grid--4-col-desktop grid--2-col-tablet-down contains-card contains-card--product contains-card--standard"
            role="list"
          >
            {results.map((product) => (
              <li key={product.id} className="grid__item">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
