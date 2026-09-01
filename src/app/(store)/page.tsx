import type { Metadata } from 'next'

import { FeaturedCollection } from '@/components/store/FeaturedCollection'
import { ImageBanner } from '@/components/store/ImageBanner'
import { getCollectionProducts, getHomepageSections, resolveStorageUrl } from '@/lib/catalog'
import { getSiteConfig } from '@/lib/site'
import type { Product } from '@/lib/catalog'

// Revalidate hourly; the admin revalidates on demand after a content change.
export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig()
  return {
    title: site.name,
    description: site.name,
    alternates: { canonical: '/' },
    openGraph: {
      title: site.name,
      description: site.name,
      url: '/',
      images: site.logoUrl ? [{ url: site.logoUrl }] : undefined,
    },
  }
}

interface BannerSettings {
  image?: string | null
  heading?: string | null
  cta_label?: string | null
  cta_href?: string | null
}

interface FeaturedSettings {
  title?: string | null
  description?: string | null
  collection?: string | null
  limit?: number | null
  view_all_href?: string | null
}

/**
 * Homepage.
 *
 * Section composition is data-driven from `homepage_sections`, so the order and
 * content can be changed from the admin without a deploy. The reference store's
 * order — image banner, then featured collection — is what the seed installs.
 */
export default async function HomePage() {
  const sections = await getHomepageSections()

  // Resolve every featured-collection section's products up front so the
  // sections themselves stay synchronous to render.
  const featured = new Map<string, Product[]>()
  for (const section of sections) {
    if (section.kind !== 'featured_collection') continue
    const settings = section.settings as FeaturedSettings
    const slug = settings.collection ?? 'frontpage'
    const { products } = await getCollectionProducts(slug, {
      limit: settings.limit ?? 3,
    })
    featured.set(section.id, products)
  }

  return (
    <>
      {sections.map((section) => {
        if (section.kind === 'image_banner') {
          const settings = section.settings as BannerSettings
          return (
            <ImageBanner
              key={section.id}
              imageUrl={resolveStorageUrl(settings.image)}
              heading={settings.heading ?? null}
              ctaLabel={settings.cta_label ?? null}
              ctaHref={settings.cta_href ?? null}
            />
          )
        }

        if (section.kind === 'featured_collection') {
          const settings = section.settings as FeaturedSettings
          return (
            <FeaturedCollection
              key={section.id}
              title={settings.title ?? null}
              description={settings.description ?? null}
              products={featured.get(section.id) ?? []}
              viewAllHref={settings.view_all_href ?? '/collections/all'}
            />
          )
        }

        return null
      })}
    </>
  )
}
