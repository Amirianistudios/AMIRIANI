'use client'

import Image from 'next/image'
import { useState } from 'react'

import type { ProductImage } from '@/lib/catalog'

/**
 * Product media gallery.
 *
 * Mirrors Dawn's "thumbnail" desktop layout exactly: a media list that behaves
 * as a slider on mobile and a stack on desktop, with a thumbnail strip beneath.
 * The class names are load-bearing — `product-media-container`,
 * `constrain-height`, `media-fit-contain` and the `--ratio` custom properties
 * are what size the main image, so they are reproduced verbatim.
 */
export function ProductGallery({
  images,
  title,
}: {
  images: ProductImage[]
  title: string
}) {
  const [active, setActive] = useState(0)

  if (images.length === 0) return null

  const activeIndex = Math.min(active, images.length - 1)

  return (
    <media-gallery
      className="product__column-sticky"
      role="region"
      aria-label="Gallery Viewer"
      data-desktop-layout="thumbnail"
    >
      <ul
        className="product__media-list contains-media grid grid--peek list-unstyled slider slider--mobile"
        role="list"
      >
        {images.map((image, index) => (
          <li
            key={image.id}
            /*
             * Every image stays in the DOM: the mobile slider scrolls through
             * them all, and on desktop
             * `.product--thumbnail .product__media-item:not(.is-active)` hides
             * everything but the selected one.
             */
            className={`product__media-item grid__item slider__slide scroll-trigger animate--fade-in${
              index === activeIndex ? ' is-active' : ''
            }`}
          >
            <div
              className="product-media-container media-type-image media-fit-contain global-media-settings gradient constrain-height"
              style={
                {
                  '--ratio': 1,
                  '--preview-ratio': 1,
                } as React.CSSProperties
              }
            >
              <div className="product__media media media--transparent">
                <Image
                  src={image.url}
                  alt={image.alt || title}
                  width={image.width ?? 2000}
                  height={image.height ?? 2000}
                  sizes="(min-width: 1400px) 715px, (min-width: 990px) 55vw, (min-width: 750px) calc(100vw - 10rem), 100vw"
                  priority={index === 0}
                  loading={index === 0 ? undefined : 'lazy'}
                  quality={90}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>

      {images.length > 1 && (
        <slider-component className="thumbnail-slider slider-mobile-gutter quick-add-hidden small-hide thumbnail-slider--no-slide">
          <ul className="thumbnail-list list-unstyled slider slider--mobile" role="list">
            {images.map((image, index) => (
              <li
                key={image.id}
                className={`thumbnail-list__item slider__slide${
                  index === activeIndex ? ' thumbnail-list_item--variant' : ''
                }`}
                data-media-position={index + 1}
              >
                <button
                  type="button"
                  className="thumbnail global-media-settings global-media-settings--no-shadow"
                  aria-label={`Load image ${index + 1} in gallery view`}
                  aria-current={index === activeIndex}
                  onClick={() => setActive(index)}
                >
                  <Image
                    src={image.url}
                    alt={image.alt || title}
                    width={416}
                    height={416}
                    sizes="(min-width: 1400px) 178px, (min-width: 990px) 13vw, (min-width: 750px) calc((100vw - 15rem) / 8), calc((100vw - 8rem) / 3)"
                    loading="lazy"
                  />
                </button>
              </li>
            ))}
          </ul>
        </slider-component>
      )}
    </media-gallery>
  )
}
