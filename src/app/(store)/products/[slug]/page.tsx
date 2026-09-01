import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { ProductForm } from '@/components/store/ProductForm'
import { ProductGallery } from '@/components/store/ProductGallery'
import { RelatedProducts } from '@/components/store/RelatedProducts'
import { getProductBySlug, getProductSlugs, getRelatedProducts } from '@/lib/catalog'
import { SITE_URL } from '@/lib/env'

export const revalidate = 3600

export async function generateStaticParams() {
  const slugs = await getProductSlugs().catch(() => [])
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) return {}

  const description =
    product.seoDescription ??
    product.descriptionHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)

  return {
    title: product.seoTitle ?? product.title,
    description,
    alternates: { canonical: `/products/${slug}` },
    openGraph: {
      title: product.seoTitle ?? product.title,
      description,
      url: `/products/${slug}`,
      type: 'website',
      images: product.images[0] ? [{ url: product.images[0].url }] : undefined,
    },
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await getProductBySlug(slug)
  if (!product) notFound()

  const related = await getRelatedProducts(product)

  // Product structured data, so rich results survive the migration off Shopify.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.descriptionHtml?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    image: product.images.map((image) => image.url),
    brand: product.vendor ? { '@type': 'Brand', name: product.vendor } : undefined,
    sku: product.variants[0]?.sku ?? undefined,
    offers: product.variants.map((variant) => ({
      '@type': 'Offer',
      url: `${SITE_URL()}/products/${product.slug}`,
      priceCurrency: product.currency,
      price: (variant.priceCents / 100).toFixed(2),
      availability: variant.available
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      name: variant.title,
    })),
  }

  return (
    <>
      <section className="shopify-section section section-main-product section-main-product-padding">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/*
        The wrapper classes are Dawn's and are what create the two-column
        layout: `grid grid--1-col grid--2-col-tablet` with each column a
        `grid__item`. The reference store uses the `product--medium` width and
        the thumbnail gallery layout.
      */}
      <div className="page-width">
        <div className="product product--medium product--left product--thumbnail product--mobile-hide grid grid--1-col grid--2-col-tablet">
          <div className="grid__item product__media-wrapper">
            <ProductGallery images={product.images} title={product.title} />
          </div>

          <div className="product__info-wrapper grid__item scroll-trigger animate--slide-in">
            <section
              id="ProductInfo"
              className="product__info-container product__column-sticky"
            >
              {product.vendor && (
                <p className="product__text inline-richtext caption-with-letter-spacing">
                  {product.vendor}
                </p>
              )}

              <div className="product__title">
                <h1>{product.title}</h1>
              </div>

              <ProductForm product={product} />

              {product.descriptionHtml && (
                <div
                  className="product__description rte quick-add-hidden"
                  dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
                />
              )}
            </section>
          </div>
        </div>
      </div>
      </section>

      <RelatedProducts products={related} />
    </>
  )
}
