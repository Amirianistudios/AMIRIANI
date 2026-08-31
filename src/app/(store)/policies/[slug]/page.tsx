import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getContentPage } from '@/lib/catalog'
import { createSupabasePublicClient } from '@/lib/supabase/server'

export const revalidate = 86400

export async function generateStaticParams() {
  try {
    const supabase = createSupabasePublicClient()
    const { data } = await supabase
      .from('content_pages')
      .select('slug')
      .eq('kind', 'policy')
      .eq('published', true)
    return (data ?? []).map((row) => ({ slug: row.slug }))
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
  const page = await getContentPage(slug, 'policy')
  if (!page) return {}

  return {
    title: page.seo_title ?? page.title,
    description: page.seo_description ?? undefined,
    alternates: { canonical: `/policies/${slug}` },
  }
}

export default async function PolicyPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const page = await getContentPage(slug, 'policy')
  if (!page) notFound()

  return (
    <div className="shopify-section section">
      <div className="policy section-padding-default page-width page-width--narrow">
        <h1 className="main-page-title page-title h0">{page.title}</h1>
        <div
          className="rte"
          dangerouslySetInnerHTML={{ __html: page.body_html ?? '' }}
        />
      </div>
    </div>
  )
}
