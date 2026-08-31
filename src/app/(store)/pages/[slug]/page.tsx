import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getContentPage } from '@/lib/catalog'
import { createSupabasePublicClient } from '@/lib/supabase/server'

export const revalidate = 86400

// `about` and `contact` have dedicated templates that match the reference
// store's bespoke layouts, so they are excluded from this generic renderer.
const DEDICATED = new Set(['about', 'contact'])

export async function generateStaticParams() {
  try {
    const supabase = createSupabasePublicClient()
    const { data } = await supabase
      .from('content_pages')
      .select('slug')
      .eq('kind', 'page')
      .eq('published', true)
    return (data ?? [])
      .filter((row) => !DEDICATED.has(row.slug))
      .map((row) => ({ slug: row.slug }))
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const page = await getContentPage(slug)
  if (!page) return {}
  return {
    title: page.seo_title ?? page.title,
    description: page.seo_description ?? undefined,
    alternates: { canonical: `/pages/${slug}` },
  }
}

export default async function ContentPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  if (DEDICATED.has(slug)) notFound()

  const page = await getContentPage(slug)
  if (!page) notFound()

  return (
    <div className="shopify-section section">
      <div className="page-width page-width--narrow section-padding-default">
        <h1 className="main-page-title page-title h0">{page.title}</h1>
        <div className="rte" dangerouslySetInnerHTML={{ __html: page.body_html ?? '' }} />
      </div>
    </div>
  )
}
