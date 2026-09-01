/**
 * Full-page screenshots of both sites, page by page, for eyes-on comparison.
 *
 *   node scripts/screenshot-pages.mjs
 *
 * compare-visual.mjs measures geometry, which catches drift a person would
 * miss. This does the opposite job: it produces the pictures, so differences
 * that no probe selector covers — a wrong colour, a missing section, an image
 * cropped differently — can actually be seen.
 *
 * Full-page, not viewport-sized. The measuring harness deliberately shoots the
 * viewport because Dawn's fixed-attachment backgrounds composite wrongly in a
 * full-page capture; here the whole page matters more than that artefact, and
 * the hero is scrolled past before shooting so it lands in the right place.
 *
 * Environment:
 *   REF_BASE   reference storefront   (default the local mirror)
 *   NEW_BASE   the rebuild            (default http://127.0.0.1:3100)
 *   OUT_DIR    where images go        (default ./screenshots)
 *   ONLY       comma-separated page names, to reshoot just those
 *   CHROMIUM_PATH
 */

import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const REF_BASE = process.env.REF_BASE ?? 'http://127.0.0.1:8899'
const NEW_BASE = process.env.NEW_BASE ?? 'http://127.0.0.1:3100'
const OUT_DIR = process.env.OUT_DIR ?? 'screenshots'
const ONLY = process.env.ONLY?.split(',').map((s) => s.trim()).filter(Boolean)

/** Same page on both sites; paths differ where the URL shape changed. */
const PAGES = [
  { name: 'home', ref: '/', next: '/' },
  { name: 'collection', ref: '/collections/all', next: '/collections/all' },
  {
    name: 'product',
    ref: '/products/oversized-high-neck-t-shirt-unisex-fit',
    next: '/products/oversized-high-neck-t-shirt-unisex-fit',
  },
  {
    name: 'product-hoodie',
    ref: '/products/oversized-hoodie-unisex-fit',
    next: '/products/oversized-hoodie-unisex-fit',
  },
  { name: 'cart', ref: '/cart', next: '/cart' },
  { name: 'search', ref: '/search?q=tee', next: '/search?q=tee' },
  { name: 'contact', ref: '/pages/contact', next: '/contact' },
  { name: 'about', ref: '/blogs/news', next: '/about' },
  { name: 'policy', ref: '/policies/refund-policy', next: '/policies/refund-policy' },
]

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
]

async function shoot(browser, base, path, viewport, file) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.mobile,
    hasTouch: viewport.mobile,
  })
  const page = await context.newPage()

  try {
    // `load`, not `networkidle`: the rebuild's RSC prefetches and the mirror's
    // absent analytics both keep the network busy long past the point the page
    // is painted, and waiting for idle just burns the timeout.
    await page.goto(base + path, { waitUntil: 'load', timeout: 45000 })
    await page.evaluate(() => document.fonts.ready)

    /*
     * Full-page capture and `background-attachment: fixed` do not mix. Chromium
     * grows the viewport to the page height and then paints fixed backgrounds
     * against that, so Dawn's `.gradient` smears and the footer's payment row
     * lands near the header — differences that exist only in the screenshot.
     * Pinning them to `scroll` for the shot moves no layout, and it is applied
     * to both sites, so the pair stays comparable.
     */
    await page.addStyleTag({
      content: `
        *, *::before, *::after { background-attachment: scroll !important; }
        /*
         * Both storefronts have a sticky header. Chromium grows the viewport
         * for a full-page shot, and a sticky element then paints against that
         * grown viewport rather than its place in the document — which is why
         * footer content appeared next to the logo. A sticky box occupies its
         * normal-flow space anyway, so pinning it to static at scroll 0 moves
         * nothing; it only stops the compositing artefact.
         */
        .shopify-section-group-header-group,
        sticky-header,
        .header-wrapper { position: static !important; }
      `,
    })

    // Dawn reveals sections on scroll. Walk the page so every one of them has
    // run its animation before the shot, then return to the top.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 50))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(1500)

    await page.screenshot({ path: file, fullPage: true })
    return true
  } catch (error) {
    console.log(`    ! ${path}: ${String(error).split('\n')[0].slice(0, 90)}`)
    return false
  } finally {
    await context.close()
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )

  const pages = ONLY ? PAGES.filter((p) => ONLY.includes(p.name)) : PAGES
  let taken = 0

  for (const viewport of VIEWPORTS) {
    console.log(`\n${viewport.name} (${viewport.width}px)`)
    for (const page of pages) {
      const stem = `${page.name}-${viewport.name}`
      const a = await shoot(browser, REF_BASE, page.ref, viewport, `${OUT_DIR}/ref-${stem}.png`)
      const b = await shoot(browser, NEW_BASE, page.next, viewport, `${OUT_DIR}/new-${stem}.png`)
      console.log(`  ${page.name}: ${a && b ? 'both captured' : a ? 'reference only' : b ? 'rebuild only' : 'FAILED'}`)
      if (a && b) taken += 1
    }
  }

  await browser.close()
  console.log(`\n${taken} page pair(s) in ${OUT_DIR}/`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
