'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { Header, type HeaderProps } from '@/components/store/Header'

/**
 * Client wrapper around the header.
 *
 * Two jobs the server component cannot do:
 *
 *  1. Supply the active path so the current nav item gets its underline.
 *  2. Reproduce Dawn's sticky-on-scroll-up behaviour, and publish the
 *     `--header-height` / `--header-bottom-position` custom properties that
 *     component-menu-drawer.css needs to size the drawer under the header.
 */
export function HeaderShell(props: Omit<HeaderProps, 'currentPath'>) {
  const pathname = usePathname()
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = wrapperRef.current?.querySelector<HTMLElement>('.header-wrapper')
    if (!element) return

    const publishMetrics = () => {
      const height = element.offsetHeight
      const root = document.documentElement
      root.style.setProperty('--header-height', `${height}px`)
      root.style.setProperty(
        '--header-bottom-position',
        `${Math.round(element.getBoundingClientRect().bottom)}px`,
      )
      root.style.setProperty('--viewport-height', `${window.innerHeight}px`)
    }

    publishMetrics()

    let lastScroll = window.scrollY
    const onScroll = () => {
      const current = window.scrollY
      const scrollingDown = current > lastScroll

      // Dawn's "on scroll up" mode: pin the header when moving up, release it
      // when moving down, and drop the sticky treatment entirely at the top.
      if (current <= 0) {
        element.classList.remove('shopify-section-header-sticky', 'shopify-section-header-hidden')
      } else if (scrollingDown) {
        element.classList.add('shopify-section-header-hidden')
      } else {
        element.classList.add('shopify-section-header-sticky')
        element.classList.remove('shopify-section-header-hidden')
      }

      lastScroll = current
      publishMetrics()
    }

    const observer = new ResizeObserver(publishMetrics)
    observer.observe(element)

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', publishMetrics)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', publishMetrics)
    }
  }, [])

  return (
    <div ref={wrapperRef}>
      <Header {...props} currentPath={pathname} />
    </div>
  )
}
