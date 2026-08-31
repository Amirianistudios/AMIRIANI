import 'server-only'

import { cache } from 'react'

import { getNavigation, getSiteSetting } from '@/lib/catalog'
import { createSupabasePublicClient } from '@/lib/supabase/server'
import type { NavigationItemRow } from '@/types/database'

export interface SiteConfig {
  name: string
  logoUrl: string | null
  instagramUrl: string | null
  contactEmail: string | null
  newsletterHeading: string
  currency: string
  localization: { country: string; currency: string; symbol: string }
}

const FALLBACK: SiteConfig = {
  name: 'AMIRIANI',
  logoUrl: null,
  instagramUrl: null,
  contactEmail: null,
  newsletterHeading: 'Stay in the quiet.',
  currency: 'EUR',
  localization: { country: 'Belgium', currency: 'EUR', symbol: '€' },
}

/**
 * Shell data needed by every storefront page.
 *
 * `cache` dedupes it within a request, so the header, footer and metadata all
 * share one round trip. If Supabase is unreachable the storefront still renders
 * with the fallback shell rather than 500-ing on every route.
 */
export const getSiteConfig = cache(async (): Promise<SiteConfig> => {
  try {
    const value = await getSiteSetting<Partial<SiteConfig>>('site')
    if (!value) return FALLBACK
    return { ...FALLBACK, ...value, localization: { ...FALLBACK.localization, ...value.localization } }
  } catch {
    return FALLBACK
  }
})

export const getMainNavigation = cache(async (): Promise<NavigationItemRow[]> => {
  try {
    return await getNavigation('main')
  } catch {
    return []
  }
})

export const getFooterPolicies = cache(
  async (): Promise<{ slug: string; title: string }[]> => {
    try {
      const supabase = createSupabasePublicClient()
      const { data } = await supabase
        .from('content_pages')
        .select('slug, title')
        .eq('kind', 'policy')
        .eq('published', true)
        // The shop's own order, not alphabetical — see the position column.
        .order('position', { ascending: true })
        .order('title', { ascending: true })
      return data ?? []
    } catch {
      return []
    }
  },
)
