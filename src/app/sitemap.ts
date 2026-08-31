import type { MetadataRoute } from 'next'

import { getAllProducts, getCollections } from '@/lib/catalog'
import { createSupabasePublicClient } from '@/lib/supabase/server'
import { SITE_URL } from '@/lib/env'

export const revalidate = 3600

/**
 * Sitemap.
 *
 * Lists every indexable storefront URL. Cart, checkout and account pages are
 * excluded deliberately — they are per-visitor and marked noindex.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL()

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/collections/all`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/contact`, changeFrequency: 'monthly', priority: 0.5 },
  ]

  try {
    const [products, collections] = await Promise.all([getAllProducts(), getCollections()])

    for (const product of products) {
      entries.push({
        url: `${base}/products/${product.slug}`,
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    }

    for (const collection of collections) {
      entries.push({
        url: `${base}/collections/${collection.slug}`,
        changeFrequency: 'weekly',
        priority: 0.7,
      })
    }

    const supabase = createSupabasePublicClient()
    const { data: policies } = await supabase
      .from('content_pages')
      .select('slug, updated_at')
      .eq('kind', 'policy')
      .eq('published', true)

    for (const policy of policies ?? []) {
      entries.push({
        url: `${base}/policies/${policy.slug}`,
        lastModified: new Date(policy.updated_at),
        changeFrequency: 'yearly',
        priority: 0.3,
      })
    }
  } catch (error) {
    // A database hiccup should not produce a 500 for crawlers; serve the
    // static entries and let the next revalidation fill in the rest.
    console.error('sitemap: could not load catalogue', error)
  }

  return entries
}
