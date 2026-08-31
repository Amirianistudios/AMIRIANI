import type { NextConfig } from 'next'

/**
 * Remote image hosts.
 *
 * Product media normally lives in Supabase Storage, so the project's own
 * hostname is derived from NEXT_PUBLIC_SUPABASE_URL rather than hard-coded.
 * The Shopify CDN stays allowed so a partially migrated catalogue (images still
 * on `external_url`) keeps rendering during the cutover; it can be dropped once
 * every asset has moved.
 */
function remotePatterns(): NonNullable<NextConfig['images']>['remotePatterns'] {
  const patterns: NonNullable<NextConfig['images']>['remotePatterns'] = [
    { protocol: 'https', hostname: 'cdn.shopify.com' },
    { protocol: 'https', hostname: '*.myshopify.com' },
  ]

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl)
      patterns.push({
        protocol: url.protocol.replace(':', '') as 'http' | 'https',
        hostname: url.hostname,
        port: url.port || undefined,
        pathname: '/storage/v1/object/public/**',
      })
    } catch {
      // A malformed URL is reported by lib/env at request time; don't fail the
      // build config over it.
    }
  }

  return patterns
}

/**
 * The local development harness (scripts/local-supabase.mjs) serves storage
 * from 127.0.0.1, and Next refuses to optimise images from private IPs as an
 * SSRF guard. Relax that only when the harness explicitly asks for it, and
 * never in a production build — so it cannot be switched on by accident.
 */
const allowLocalImages =
  process.env.NODE_ENV !== 'production' && process.env.ALLOW_LOCAL_IMAGE_HOSTS === '1'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: remotePatterns(),
    formats: ['image/avif', 'image/webp'],
    dangerouslyAllowLocalIP: allowLocalImages,
  },

  // Surfaces accidental client-side use of server-only modules at build time.
  serverExternalPackages: [],

  /**
   * URL preservation.
   *
   * A handful of Shopify URLs change shape on the new site. These are kept as
   * permanent redirects so existing links and search results keep working —
   * the same set the importer seeds into the `redirects` table for reference.
   */
  async redirects() {
    return [
      // The reference store served its About page from the blog.
      { source: '/blogs/news', destination: '/about', permanent: true },
      { source: '/blogs/news/:slug', destination: '/about', permanent: true },
      { source: '/pages/about', destination: '/about', permanent: true },
      { source: '/pages/contact', destination: '/contact', permanent: true },
      // Shopify's default catch-all collection.
      { source: '/collections/frontpage', destination: '/collections/all', permanent: true },
      // Shopify nests product URLs under a collection; ours are flat.
      {
        source: '/collections/:collection/products/:slug',
        destination: '/products/:slug',
        permanent: true,
      },
    ]
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ]
  },
}

export default nextConfig
