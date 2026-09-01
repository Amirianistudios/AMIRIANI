import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ProductCard } from '@/components/store/ProductCard'
import { getAllProducts, getCollectionProducts, getCollections } from '@/lib/catalog'
import { SITE_URL } from '@/lib/env'
import type { Product } from '@/lib/catalog'

export const revalidate = 3600

/**
 * `/collections/all` is the storefront's catch-all listing. The reference store
 * links its "Essentials" nav item and hero CTA there, and it is not a real
 * collection record, so it is handled as a special case.
 */
const ALL_SLUG = 'all'

export async function generateStaticParams() {
  const collections = await getCollections().catch(() => [])
  return [{ slug: ALL_SLUG }, ...collections.map((c) => ({ slug: c.slug }))]
}

async function load(
  slug: string,
): Promise<{ title: string; description: string | null; products: Product[] } | null> {
  if (slug === ALL_SLUG) {
    return { title: 'Products', description: null, products: await getAllProducts() }
  }

  const { collection, products } = await getCollectionProducts(slug)
  if (!collection) return null

  return {
    title: collection.title,
    description: collection.descriptionHtml,
    products,
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const data = await load(slug)
  if (!data) return {}

  return {
    title: data.title,
    description: data.description?.replace(/<[^>]+>/g, '').trim() || undefined,
    alternates: { canonical: `/collections/${slug}` },
    openGraph: {
      title: data.title,
      url: `/collections/${slug}`,
      images: data.products[0]?.images[0]
        ? [{ url: data.products[0].images[0].url }]
        : undefined,
    },
  }
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const data = await load(slug)
  if (!data) notFound()

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: data.title,
    numberOfItems: data.products.length,
    itemListElement: data.products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL()}/products/${product.slug}`,
      name: product.title,
    })),
  }

  return (
    <section className="shopify-section section section-product-grid">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      {/*
        The reference collection template renders no visible page title or
        product count — the grid starts straight under the header — so the
        heading here is for assistive tech only.
      */}
      <h1 className="visually-hidden">{data.title}</h1>

      {/*
        `gradient color-scheme-custom` is what paints this section white. The
        page body is cream, so without it the cream showed through behind the
        grid and every product card read as a white tile floating on beige —
        the reference has a white ground here and the cards blend into it.
      */}
      <div className="section-product-grid-padding gradient color-scheme-custom">
        <div className="collection page-width">
          {data.products.length === 0 ? (
            <div className="collection collection--empty page-width" id="product-grid">
              <div className="loading__spinner hidden" />
              <div className="title-wrapper center">
                <h2 className="title title--primary">
                  No products found.
                </h2>
              </div>
            </div>
          ) : (
            <ul
              id="product-grid"
              className="grid product-grid grid--4-col-desktop grid--2-col-tablet-down contains-card contains-card--product contains-card--standard"
              role="list"
            >
              {data.products.map((product, index) => (
                <li
                  key={product.id}
                  className="grid__item scroll-trigger animate--slide-in"
                  data-cascade=""
                  style={{ '--animation-order': index + 1 } as React.CSSProperties}
                >
                  <ProductCard product={product} priority={index < 4} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
