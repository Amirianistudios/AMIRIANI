/**
 * Visual comparison against the reference Shopify storefront.
 *
 * Screenshots the same pages from both sites at several widths, and reports the
 * geometry of key elements side by side. Numbers catch drift that eyeballing
 * screenshots does not — a heading four pixels off, a grid missing its gutter.
 *
 *   node scripts/compare-visual.mjs
 *
 * Environment:
 *   NEW_BASE   the rebuilt site           (default http://127.0.0.1:3000)
 *   REF_BASE   the reference storefront   (default the live Shopify store)
 *   OUT_DIR    where screenshots go       (default ./visual-comparison)
 *   CHROMIUM_PATH  explicit Chromium binary, for environments where the
 *                  installed browser does not match this Playwright version
 *
 * Note on the reference: if you mirror it locally to compare offline, make sure
 * the mirrored @font-face URLs resolve. With the real fonts missing the browser
 * substitutes a fallback and every text measurement is wrong — which looks like
 * a fidelity bug in the rebuild when it is an artefact of the mirror.
 */

import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const NEW_BASE = process.env.NEW_BASE ?? 'http://127.0.0.1:3000'
const REF_BASE = process.env.REF_BASE ?? 'https://7t6swe-yh.myshopify.com'
const OUT_DIR = process.env.OUT_DIR ?? 'visual-comparison'

/** Same page on both sites; paths differ because some URLs changed shape. */
const PAGES = [
  { name: 'home', ref: '/', next: '/' },
  { name: 'collection', ref: '/collections/all', next: '/collections/all' },
  {
    name: 'product',
    ref: '/products/oversized-high-neck-t-shirt-unisex-fit',
    next: '/products/oversized-high-neck-t-shirt-unisex-fit',
  },
  { name: 'cart', ref: '/cart', next: '/cart' },
]

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 2400 },
  { name: 'mobile-430', width: 430, height: 2400 },
  { name: 'tablet-768', width: 768, height: 2400 },
  { name: 'laptop-1280', width: 1280, height: 2400 },
  { name: 'desktop-1440', width: 1440, height: 2600 },
  { name: 'wide-1920', width: 1920, height: 2600 },
]

/** Elements whose geometry is worth comparing numerically. */
const PROBES = [
  '.header',
  '.header__heading-logo',
  '.list-menu--inline',
  '.banner',
  '.banner__heading',
  '.product-grid',
  '.product-grid .grid__item',
  '.card__heading',
  '.price',
  '.product__info-wrapper',
  '.footer',
]

async function capture(browser, base, path, viewport, file) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.width < 750,
    hasTouch: viewport.width < 750,
  })
  const page = await context.newPage()

  try {
    await page.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)

    // Settle lazy images and any reveal-on-scroll animation.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) {
        window.scrollTo(0, y)
        await new Promise((r) => setTimeout(r, 60))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(1200)

    /*
     * A viewport-sized shot, not fullPage: Dawn's `.gradient` sets
     * `background-attachment: fixed` and the hero image is `position: fixed`,
     * both of which composite incorrectly in a full-page capture.
     */
    await page.screenshot({ path: file })

    const metrics = await page.evaluate((selectors) => {
      const out = {}
      for (const selector of selectors) {
        const el = document.querySelector(selector)
        if (!el) {
          out[selector] = null
          continue
        }
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        out[selector] = {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          font: `${cs.fontSize} ${cs.fontWeight}`,
        }
      }
      return out
    }, PROBES)

    return metrics
  } catch (error) {
    console.log(`    ! ${path} failed: ${String(error).slice(0, 100)}`)
    return null
  } finally {
    await context.close()
  }
}

function diff(refMetrics, newMetrics) {
  if (!refMetrics || !newMetrics) return []

  const rows = []
  for (const selector of PROBES) {
    const a = refMetrics[selector]
    const b = newMetrics[selector]

    if (!a && !b) continue
    if (!a || !b) {
      rows.push(`      ${selector}: ${!a ? 'missing on reference' : 'MISSING ON REBUILD'}`)
      continue
    }

    // Vertical offset accumulates from everything above, so only flag size,
    // horizontal placement and typography — the things that indicate drift.
    const deltas = []
    if (Math.abs(a.x - b.x) > 2) deltas.push(`x ${a.x}→${b.x}`)
    if (Math.abs(a.w - b.w) > 2) deltas.push(`w ${a.w}→${b.w}`)
    if (Math.abs(a.h - b.h) > 4) deltas.push(`h ${a.h}→${b.h}`)
    if (a.font !== b.font) deltas.push(`font ${a.font}→${b.font}`)

    if (deltas.length > 0) rows.push(`      ${selector}: ${deltas.join(', ')}`)
  }
  return rows
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  let differences = 0

  for (const viewport of VIEWPORTS) {
    console.log(`\n${viewport.name} (${viewport.width}px)`)

    for (const page of PAGES) {
      const refFile = `${OUT_DIR}/ref-${page.name}-${viewport.name}.png`
      const newFile = `${OUT_DIR}/new-${page.name}-${viewport.name}.png`

      const refMetrics = await capture(browser, REF_BASE, page.ref, viewport, refFile)
      const newMetrics = await capture(browser, NEW_BASE, page.next, viewport, newFile)

      const rows = diff(refMetrics, newMetrics)
      differences += rows.length

      console.log(`  ${page.name}: ${rows.length === 0 ? 'matches' : `${rows.length} difference(s)`}`)
      for (const row of rows) console.log(row)
    }
  }

  await browser.close()

  console.log(
    `\n${differences === 0 ? 'No differences above threshold.' : `${differences} difference(s) to review.`}`,
  )
  console.log(`Screenshots in ${OUT_DIR}/ — compare them in pairs.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
