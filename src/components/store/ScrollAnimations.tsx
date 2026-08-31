'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Reveal-on-scroll, reproducing Dawn's mechanism exactly.
 *
 * base.css drives this with an inverted class: `.scroll-trigger` starts at
 * opacity .01, and `.scroll-trigger:not(.scroll-trigger--offscreen)` reveals it
 * with the fade/slide keyframes. So the element is *visible by default*, and
 * Dawn's script marks what is below the fold with `scroll-trigger--offscreen`,
 * removing it as each element scrolls into view.
 *
 * Getting this backwards leaves whole sections at opacity 0, so the offscreen
 * class is only ever added to elements that are genuinely below the viewport
 * on first paint.
 *
 * Siblings marked `data-cascade` stagger via `--animation-order`, which
 * base.css already reads as an animation-delay.
 */
export function ScrollAnimations() {
  const pathname = usePathname()

  useEffect(() => {
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>('.scroll-trigger'),
    )
    if (targets.length === 0) return

    // Honour reduced motion, and degrade to "everything visible" wherever
    // IntersectionObserver is unavailable.
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      targets.forEach((el) => el.classList.remove('scroll-trigger--offscreen'))
      return
    }

    const viewportHeight = window.innerHeight
    const pending: HTMLElement[] = []

    for (const el of targets) {
      // Anything already on screen stays visible and animates immediately.
      if (el.getBoundingClientRect().top < viewportHeight) continue
      el.classList.add('scroll-trigger--offscreen')
      pending.push(el)
    }

    if (pending.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.remove('scroll-trigger--offscreen')
          observer.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -50px 0px', threshold: 0 },
    )

    pending.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [pathname])

  return null
}
