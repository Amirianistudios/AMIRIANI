import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getContentPage } from '@/lib/catalog'

export const revalidate = 86400

export async function generateMetadata(): Promise<Metadata> {
  const page = await getContentPage('about')
  if (!page) return {}
  return {
    title: page.seo_title ?? page.title,
    description: page.seo_description ?? undefined,
    alternates: { canonical: '/about' },
  }
}

/**
 * About page.
 *
 * On the reference store this lives at /blogs/news: a page title followed by an
 * empty article list and a centred, full-width rich-text block on the cream
 * scheme. There are no articles and no blog functionality behind it, so it is
 * modelled here as a content page — with /blogs/news redirected to it so the
 * old URL keeps working.
 */
export default async function AboutPage() {
  const page = await getContentPage('about')
  if (!page) notFound()

  const heading = (page.seo_title ?? '').trim()

  return (
    <>
      <section className="shopify-section section section-main-blog">
        <div className="main-blog page-width section-main-blog-padding">
          <h1 className="title--primary scroll-trigger animate--fade-in">{page.title}</h1>
          <div className="blog-articles" />
        </div>
      </section>

      <section className="shopify-section section section-rich-text">
        <div className="isolate">
          <div className="rich-text content-container color-background-1 gradient rich-text--full-width content-container--full-width section-rich-text-padding">
            <div className="rich-text__wrapper rich-text__wrapper--center page-width">
              <div className="rich-text__blocks center">
                {heading && (
                  <h2
                    className="rich-text__heading rte inline-richtext h2 scroll-trigger animate--slide-in"
                    data-cascade=""
                    style={{ '--animation-order': 1 } as React.CSSProperties}
                  >
                    <strong>{heading}</strong>
                  </h2>
                )}
                <div
                  className="rich-text__text rte scroll-trigger animate--slide-in"
                  data-cascade=""
                  style={{ '--animation-order': 2 } as React.CSSProperties}
                  dangerouslySetInnerHTML={{ __html: page.body_html ?? '' }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
