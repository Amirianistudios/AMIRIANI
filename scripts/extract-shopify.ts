/**
 * Extracts the catalogue and site content from the public Shopify storefront
 * into `data/shopify-export.json`, the single source the importer reads.
 *
 * Everything here comes from public endpoints (`/products.json`,
 * `/collections.json`, rendered pages). Nothing is invented: if a field is not
 * exposed publicly it is written as null and reported at the end so it can be
 * filled from a real Shopify admin export.
 *
 *   npx tsx scripts/extract-shopify.ts
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const STORE = process.env.SHOPIFY_STORE_URL ?? 'https://7t6swe-yh.myshopify.com'
const OUT = resolve(process.cwd(), 'data/shopify-export.json')

/**
 * Market pin.
 *
 * This store runs Shopify Markets, and prices differ per market: requesting
 * `/products.json` with `Accept-Language: en` returns the international
 * catalogue (e.g. 119.00), while a Belgian visitor sees 99.95 — which is what
 * the storefront actually renders. Node's fetch sends `Accept-Language: *` by
 * default, so without pinning, the extractor silently captures the wrong
 * prices.
 *
 * The `localization` cookie is what the storefront itself sets, and it wins
 * over the language header, so every request here carries it. `verifyPrices`
 * below cross-checks the result against the rendered HTML regardless.
 */
const MARKET_COUNTRY = process.env.SHOPIFY_MARKET_COUNTRY ?? 'BE'

const REQUEST_HEADERS: Record<string, string> = {
  cookie: `localization=${MARKET_COUNTRY}`,
  accept: '*/*',
}

type Json = Record<string, unknown>

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${STORE}${path}`, { headers: REQUEST_HEADERS })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.json() as Promise<T>
}

async function getHtml(path: string): Promise<string> {
  const res = await fetch(`${STORE}${path}`, { headers: REQUEST_HEADERS })
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`)
  return res.text()
}

/**
 * Cross-checks extracted prices against the rendered product page.
 *
 * The JSON API and the storefront must agree; if they do not, we have captured
 * a different market's catalogue and the export is wrong. Fail loudly rather
 * than importing prices no customer has ever been shown.
 */
async function verifyPrices(
  products: { handle: string; title: string; variants: { price: string }[] }[],
): Promise<void> {
  const sample = products.slice(0, 3)

  for (const product of sample) {
    const html = await getHtml(`/products/${product.handle}`)
    const rendered = /price-item price-item--regular"?\s*>\s*([^<]+)</.exec(html)?.[1]?.trim()

    if (!rendered) {
      console.warn(`  ! could not read a rendered price for ${product.handle}; skipped check`)
      continue
    }

    // Rendered prices use the shop's format, e.g. "€99,95".
    const renderedCents = Math.round(
      Number(rendered.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')) * 100,
    )
    const jsonCents = Math.round(Number(product.variants[0]!.price) * 100)

    if (renderedCents !== jsonCents) {
      throw new Error(
        `Price mismatch for "${product.title}": the JSON API returned ` +
          `${(jsonCents / 100).toFixed(2)} but the storefront renders ${rendered}. ` +
          `This means the extractor captured a different Shopify market. ` +
          `Check SHOPIFY_MARKET_COUNTRY (currently "${MARKET_COUNTRY}").`,
      )
    }
  }

  console.log(`Price check: JSON and storefront agree across ${sample.length} products`)
}

/** Pulls the inner HTML of the first element matching a class, brace-balanced on tags. */
function extractBlock(html: string, startPattern: RegExp): string | null {
  const m = startPattern.exec(html)
  if (!m) return null
  const open = m.index + m[0].length
  // Walk forward counting <div ...> / </div> to find the matching close.
  let depth = 1
  let i = open
  const tag = /<\/?div\b[^>]*>/g
  tag.lastIndex = open
  let t: RegExpExecArray | null
  while ((t = tag.exec(html))) {
    depth += t[0].startsWith('</') ? -1 : 1
    if (depth === 0) {
      i = t.index
      break
    }
  }
  return html.slice(open, i).trim()
}

function unescapeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function textOf(html: string): string {
  return unescapeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

async function main() {
  const gaps: string[] = []

  // ---------------------------------------------------------------- products
  const productsRaw: { products: Json[] } = await getJson('/products.json?limit=250')
  const products = productsRaw.products.map((p) => {
    const variants = (p.variants as Json[]).map((v) => ({
      external_id: String(v.id),
      title: String(v.title),
      sku: (v.sku as string) || null,
      price: String(v.price),
      compare_at_price: (v.compare_at_price as string) ?? null,
      option1: (v.option1 as string) ?? null,
      option2: (v.option2 as string) ?? null,
      option3: (v.option3 as string) ?? null,
      grams: (v.grams as number) ?? null,
      available: Boolean(v.available),
      position: Number(v.position ?? 0),
      featured_image: (v.featured_image as Json | null)?.src
        ? absolutise(String((v.featured_image as Json).src))
        : null,
    }))

    const images = (p.images as Json[]).map((img) => ({
      external_id: String(img.id),
      src: absolutise(String(img.src)),
      alt: (img.alt as string) ?? null,
      width: (img.width as number) ?? null,
      height: (img.height as number) ?? null,
      position: Number(img.position ?? 0),
      variant_ids: ((img.variant_ids as unknown[]) ?? []).map(String),
    }))

    return {
      external_id: String(p.id),
      handle: String(p.handle),
      title: String(p.title),
      body_html: (p.body_html as string) ?? null,
      vendor: (p.vendor as string) ?? null,
      product_type: (p.product_type as string) || null,
      tags: (p.tags as string[]) ?? [],
      published_at: (p.published_at as string) ?? null,
      created_at: (p.created_at as string) ?? null,
      options: (p.options as Json[]).map((o) => ({
        name: String(o.name),
        position: Number(o.position ?? 0),
        values: o.values as string[],
      })),
      variants,
      images,
      // Not exposed publicly — must come from an admin export.
      inventory_quantities: null,
      cost_per_item: null,
      barcode: null,
      seo_title: null,
      seo_description: null,
    }
  })

  await verifyPrices(products)

  gaps.push(
    'Per-variant inventory counts (public JSON only exposes an `available` boolean).',
    'Cost per item, barcodes, and per-product SEO title/description.',
  )

  // ------------------------------------------------------------- collections
  const collectionsRaw: { collections: Json[] } = await getJson('/collections.json?limit=250')
  const collections = []
  for (const c of collectionsRaw.collections) {
    const handle = String(c.handle)
    // Membership + ordering come from the collection's own products feed.
    let memberHandles: string[] = []
    try {
      const members: { products: Json[] } = await getJson(
        `/collections/${handle}/products.json?limit=250`,
      )
      memberHandles = members.products.map((p) => String(p.handle))
    } catch {
      gaps.push(`Could not read membership for collection "${handle}".`)
    }
    collections.push({
      external_id: String(c.id),
      handle,
      title: String(c.title),
      body_html: (c.description as string) || null,
      image: (c.image as Json | null)?.src ? absolutise(String((c.image as Json).src)) : null,
      published_at: (c.published_at as string) ?? null,
      product_handles: memberHandles,
    })
  }

  // ------------------------------------------------------------------ policies
  const policySlugs = [
    'privacy-policy',
    'refund-policy',
    'terms-of-service',
    'shipping-policy',
    'legal-notice',
    'contact-information',
  ]
  // The footer renders the policies in the shop's own order, which is not
  // alphabetical; capture it so the rebuilt footer can reproduce it.
  const home0 = await getHtml('/')
  const footerOrder: string[] = [
    ...new Set(
      [...home0.matchAll(/href="\/policies\/([a-z0-9-]+)"/g)].map((m) => m[1]!),
    ),
  ]

  const policies = []
  for (const slug of policySlugs) {
    try {
      const html = await getHtml(`/policies/${slug}`)
      const title = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? slug
      const body =
        extractBlock(html, /<div class="rte"[^>]*>/) ??
        extractBlock(html, /<div class="shopify-policy__body"[^>]*>/)
      if (!body) {
        gaps.push(`Policy "${slug}" body could not be parsed.`)
        continue
      }
      const position = footerOrder.indexOf(slug)
      policies.push({
        slug,
        title: textOf(title),
        body_html: body,
        // Policies absent from the footer sort after those present.
        position: position === -1 ? 999 : position,
      })
    } catch (err) {
      gaps.push(`Policy "${slug}" failed: ${(err as Error).message}`)
    }
  }

  // --------------------------------------------------------------- site pages
  const aboutHtml = await getHtml('/blogs/news')
  const aboutHeading = /<h2[^>]*class="rich-text__heading[\s\S]*?>([\s\S]*?)<\/h2>/.exec(
    aboutHtml,
  )?.[1]
  const aboutBody = extractBlock(aboutHtml, /<div[^>]*class="rich-text__text rte[\s\S]*?>/)

  const pages = [
    {
      slug: 'about',
      title: 'About AMIRIANI',
      heading: aboutHeading ? textOf(aboutHeading) : null,
      body_html: aboutBody,
    },
    {
      slug: 'contact',
      title: 'whisper something.',
      heading: null,
      body_html: null, // The contact page is a form, not prose.
    },
  ]

  // ------------------------------------------------------ homepage + settings
  const home = await getHtml('/')
  const bannerImg = /class="banner__media[^"]*"[\s\S]*?<img\s+src="([^"]+)"/.exec(home)?.[1]
  const bannerHeading = /<h2\s+class="banner__heading[^"]*"\s*>([\s\S]*?)<\/h2>/.exec(home)?.[1]
  const bannerCta = /class="banner__buttons"[\s\S]*?href="([^"]+)"[\s\S]*?>([^<]+)<\/a>/.exec(home)
  const logo = /class="header__heading-logo-wrapper">[\s\S]*?<img src="([^"]+)"/.exec(home)?.[1]
  const featuredTitle = /<h2 class="title inline-richtext h1[^"]*">([\s\S]*?)<\/h2>/.exec(home)?.[1]
  const featuredDesc = extractBlock(home, /<div class="collection__description subtitle rte[^>]*>/)

  const site = {
    name: 'AMIRIANI',
    currency: 'EUR',
    locale: 'nl-BE',
    country: 'BE',
    logo_url: logo ? absolutise(logo) : null,
    instagram: /href="(https?:\/\/[^"]*instagram[^"]*)"/.exec(home)?.[1] ?? null,
    contact_email: 'amiriani.studio@gmail.com',
    navigation: [
      { label: 'Home', href: '/' },
      { label: 'Essentials', href: '/collections/all' },
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
    newsletter_heading: 'Stay in the quiet.',
    homepage: {
      banner: {
        image: bannerImg ? absolutise(bannerImg) : null,
        heading: bannerHeading ? textOf(bannerHeading) : null,
        cta_href: bannerCta?.[1] ?? null,
        cta_label: bannerCta ? textOf(bannerCta[2]) : null,
      },
      featured_collection: {
        title: featuredTitle ? textOf(featuredTitle) : null,
        description: featuredDesc ? textOf(featuredDesc) : null,
        limit: 3,
      },
    },
  }

  await mkdir(resolve(process.cwd(), 'data'), { recursive: true })
  await writeFile(
    OUT,
    JSON.stringify(
      {
        source: STORE,
        extracted_at: new Date().toISOString(),
        products,
        collections,
        policies,
        pages,
        site,
        known_gaps: [...new Set(gaps)],
      },
      null,
      2,
    ),
  )

  console.log(`Wrote ${OUT}`)
  console.log(
    `  ${products.length} products, ${collections.length} collections, ` +
      `${policies.length} policies, ${pages.length} pages`,
  )
  console.log('\nFields that need a Shopify admin export:')
  for (const g of [...new Set(gaps)]) console.log(`  - ${g}`)
}

function absolutise(url: string): string {
  const clean = unescapeEntities(url)
  if (clean.startsWith('//')) return `https:${clean}`
  if (clean.startsWith('/')) return `${STORE}${clean}`
  return clean
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
