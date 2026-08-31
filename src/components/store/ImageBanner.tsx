import Image from 'next/image'
import Link from 'next/link'

export interface ImageBannerProps {
  imageUrl: string | null
  heading: string | null
  ctaLabel: string | null
  ctaHref: string | null
}

/**
 * Homepage hero.
 *
 * Reproduces the reference `image_banner` section exactly: a large full-bleed
 * banner (`banner--large`), image fixed on desktop (`animate--fixed`), heading
 * and secondary button centred in a transparent box
 * (`banner--desktop-transparent`), with the box gaining a background on mobile
 * via `content-container--full-width-mobile`.
 */
export function ImageBanner({ imageUrl, heading, ctaLabel, ctaHref }: ImageBannerProps) {
  return (
    <section className="shopify-section section section-image-banner">
      <div className="banner banner--content-align-center banner--content-align-mobile-center banner--large banner--desktop-transparent scroll-trigger animate--fade-in">
        {imageUrl && (
          <div className="banner__media media animate--fixed scroll-trigger animate--fade-in">
            <Image
              src={imageUrl}
              alt=""
              width={1600}
              height={2000}
              sizes="100vw"
              priority
              fetchPriority="high"
              quality={90}
            />
          </div>
        )}

        <div className="banner__content banner__content--middle-center page-width scroll-trigger animate--slide-in">
          <div className="banner__box content-container content-container--full-width-mobile color-scheme-custom gradient">
            {heading && <h2 className="banner__heading inline-richtext h1">{heading}</h2>}
            {ctaLabel && ctaHref && (
              <div className="banner__buttons">
                <Link href={ctaHref} className="button button--secondary">
                  {ctaLabel}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
