import type { Metadata } from 'next'

import { ContactForm } from '@/components/store/ContactForm'
import { getContentPage } from '@/lib/catalog'

export const revalidate = 86400

export async function generateMetadata(): Promise<Metadata> {
  const page = await getContentPage('contact')
  return {
    title: page?.seo_title ?? 'Contact',
    description: page?.seo_description ?? undefined,
    alternates: { canonical: '/contact' },
  }
}

/**
 * Contact page.
 *
 * The reference store renders Dawn's contact-form section in a narrow column,
 * with the heading "whisper something." and fields Name / Email* / Phone /
 * Comment.
 */
export default async function ContactPage() {
  const page = await getContentPage('contact')

  return (
    <section className="shopify-section section section-contact-form">
      <div className="color-scheme-custom gradient">
        <div className="contact page-width page-width--narrow section-contact-form-padding">
          <h2 className="title title-wrapper--no-top-margin inline-richtext h1 scroll-trigger animate--slide-in">
            {page?.title ?? 'whisper something.'}
          </h2>
          <ContactForm />
        </div>
      </div>
    </section>
  )
}
