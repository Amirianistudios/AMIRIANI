'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'

import { IconCaret } from '@/components/store/Icons'
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
  const [slide, setSlide] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  if (images.length === 0) return null

  const activeIndex = Math.min(active, images.length - 1)

  /*
   * On mobile the media list is a horizontal scroller, so which slide is
   * showing is a function of scrollLeft rather than of the thumbnail the
   * customer last clicked. Dawn tracks it the same way to drive the counter.
   */
  const onScroll = () => {
    const list = listRef.current
    if (!list) return
    const first = list.firstElementChild as HTMLElement | null
    if (!first) return
    const step = first.getBoundingClientRect().width + 16
    const index = Math.round(list.scrollLeft / step)
    setSlide(Math.max(0, Math.min(index, images.length - 1)))
  }

  const scrollTo = (index: number) => {
    const list = listRef.current
    const first = list?.firstElementChild as HTMLElement | null
    if (!list || !first) return
    const step = first.getBoundingClientRect().width + 16
    list.scrollTo({ left: index * step, behavior: 'smooth' })
  }

  return (
    <media-gallery
      className="product__column-sticky"
      role="region"
      aria-label="Gallery Viewer"
      data-desktop-layout="thumbnail"
    >
      {/*
        Dawn wraps the media list in a <slider-component class="slider-mobile-gutter">,
        and `.product__media-wrapper slider-component` carries a -1.5rem gutter
        that lets the gallery run edge to edge on mobile. Without the wrapper
        the list stayed inside the page padding, so the photograph was 32px
        narrower than the reference and sat 16px further in.
      */}
      <slider-component className="slider-mobile-gutter">
      <ul
        ref={listRef}
        onScroll={onScroll}
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

      {/*
        The mobile pager. CSS hides it above 749px, which is why the desktop
        thumbnail strip below is unaffected.
      */}
      {images.length > 1 && (
        <div className="slider-buttons quick-add-hidden">
          <button
            type="button"
            className="slider-button slider-button--prev"
            name="previous"
            aria-label="Slide left"
            disabled={slide === 0}
            onClick={() => scrollTo(slide - 1)}
          >
            <span className="svg-wrapper">
              <IconCaret className="icon icon-caret" />
            </span>
          </button>

          <div className="slider-counter caption">
            <span className="slider-counter--current">{slide + 1}</span>
            <span aria-hidden="true"> / </span>
            <span className="visually-hidden">of</span>{' '}
            <span className="slider-counter--total">{images.length}</span>
          </div>

          <button
            type="button"
            className="slider-button slider-button--next"
            name="next"
            aria-label="Slide right"
            disabled={slide === images.length - 1}
            onClick={() => scrollTo(slide + 1)}
          >
            <span className="svg-wrapper">
              <IconCaret className="icon icon-caret" />
            </span>
          </button>
        </div>
      )}
      </slider-component>

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
