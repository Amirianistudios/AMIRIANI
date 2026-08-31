import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/env'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Per-visitor and administrative paths carry no value for crawlers and
      // must never appear in an index.
      disallow: ['/cart', '/checkout', '/account', '/admin', '/api/', '/search'],
    },
    sitemap: `${SITE_URL()}/sitemap.xml`,
  }
}
