import type { DetailedHTMLProps, HTMLAttributes } from 'react'

/**
 * Dawn's markup wraps several regions in custom elements. We keep those tags so
 * the ported stylesheets — which target them by name (e.g. `header-drawer`
 * takes `grid-area: left-icons`) — lay the page out unchanged. They carry no
 * behaviour here; the interactivity is React's.
 */
type CustomElement = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        'header-drawer': CustomElement & { 'data-breakpoint'?: string }
        'sticky-header': CustomElement & { 'data-sticky-type'?: string }
        'slideshow-component': CustomElement
        'slider-component': CustomElement
        'media-gallery': CustomElement & { 'data-desktop-layout'?: string }
        'variant-selects': CustomElement & { 'data-section'?: string }
        'product-form': CustomElement & { 'data-section-id'?: string }
        'cart-items': CustomElement
        'cart-notification': CustomElement
        'quantity-input': CustomElement
        'predictive-search': CustomElement
        'details-modal': CustomElement
        'localization-form': CustomElement
      }
    }
  }
}

export {}
