/**
 * Imports data/shopify-export.json into Supabase.
 *
 * Idempotent: every record is keyed on (external_source, external_id) or its
 * slug, so re-running updates in place rather than duplicating. Safe to run
 * repeatedly as the Shopify store changes during the migration window.
 *
 *   npx tsx scripts/import-to-supabase.ts
 *
 * Options (environment):
 *   IMAGE_STRATEGY=storage   download images and upload to Supabase Storage
 *                            (default; makes the store independent of Shopify)
 *   IMAGE_STRATEGY=external  keep the source URLs, no downloads
 *   IMAGE_BASE_URL=<url>     rewrite image hosts, used by the local dev harness
 *   DEFAULT_INVENTORY=<n>    starting stock for variants the public API reports
 *                            as available (default 25). Public Shopify JSON
 *                            exposes only a boolean, so real counts must come
 *                            from an admin export — see --inventory-csv below.
 *   INVENTORY_CSV=<path>     Shopify admin product export CSV; when given, real
 *                            per-variant inventory is read from it.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const IMAGE_STRATEGY = (process.env.IMAGE_STRATEGY ?? 'storage') as 'storage' | 'external'
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL ?? null
const DEFAULT_INVENTORY = Number(process.env.DEFAULT_INVENTORY ?? 25)
const INVENTORY_CSV = process.env.INVENTORY_CSV ?? null

const SOURCE = 'shopify'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

interface ExportShape {
  source: string
  products: {
    external_id: string
    handle: string
    title: string
    body_html: string | null
    vendor: string | null
    product_type: string | null
    tags: string[]
    published_at: string | null
    options: { name: string; position: number; values: string[] }[]
    variants: {
      external_id: string
      title: string
      sku: string | null
      price: string
      compare_at_price: string | null
      option1: string | null
      grams: number | null
      available: boolean
      position: number
    }[]
    images: {
      external_id: string
      src: string
      alt: string | null
      width: number | null
      height: number | null
      position: number
      variant_ids: string[]
    }[]
  }[]
  collections: {
    external_id: string
    handle: string
    title: string
    body_html: string | null
    image: string | null
    product_handles: string[]
  }[]
  policies: { slug: string; title: string; body_html: string; position: number }[]
  pages: { slug: string; title: string; heading: string | null; body_html: string | null }[]
  site: Record<string, unknown>
}

function toCents(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

function rewriteImageUrl(url: string): string {
  if (!IMAGE_BASE_URL) return url
  // Used by the local harness to point at the mirrored assets instead of the
  // Shopify CDN, which is unreachable from the dev container.
  const path = new URL(url).pathname.replace(/^\//, '')
  return `${IMAGE_BASE_URL.replace(/\/$/, '')}/${path}`
}

/**
 * Parses a Shopify admin product export CSV into
 * `variantSku -> inventory quantity`.
 */
async function loadInventoryCsv(path: string): Promise<Map<string, number>> {
  const text = await readFile(path, 'utf8')
  const rows = parseCsv(text)
  const header = rows.shift()
  if (!header) return new Map()

  const skuIndex = header.findIndex((h) => h.trim().toLowerCase() === 'variant sku')
  const qtyIndex = header.findIndex((h) =>
    ['variant inventory qty', 'variant inventory quantity'].includes(h.trim().toLowerCase()),
  )

  if (skuIndex === -1 || qtyIndex === -1) {
    throw new Error(
      'INVENTORY_CSV does not look like a Shopify product export ' +
        '(expected "Variant SKU" and "Variant Inventory Qty" columns)',
    )
  }

  const map = new Map<string, number>()
  for (const row of rows) {
    const sku = row[skuIndex]?.trim()
    const qty = Number(row[qtyIndex])
    if (sku && Number.isFinite(qty)) map.set(sku, Math.max(0, Math.trunc(qty)))
  }
  return map
}

/** RFC 4180 CSV parser: handles quoted fields, embedded commas and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

/** Downloads an image and stores it in Supabase Storage, returning its path. */
async function uploadImage(
  bucket: string,
  storagePath: string,
  sourceUrl: string,
): Promise<string | null> {
  const res = await fetch(sourceUrl)
  if (!res.ok) {
    console.warn(`  ! could not fetch ${sourceUrl} (${res.status})`)
    return null
  }

  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const body = Buffer.from(await res.arrayBuffer())

  const { error } = await supabase.storage.from(bucket).upload(storagePath, body, {
    contentType,
    upsert: true,
  })

  if (error) {
    console.warn(`  ! upload failed for ${storagePath}: ${error.message}`)
    return null
  }
  return storagePath
}

async function main() {
  const raw = await readFile(resolve(process.cwd(), 'data/shopify-export.json'), 'utf8')
  const data = JSON.parse(raw) as ExportShape

  const inventory = INVENTORY_CSV ? await loadInventoryCsv(INVENTORY_CSV) : new Map<string, number>()
  if (INVENTORY_CSV) {
    console.log(`Loaded inventory for ${inventory.size} SKUs from ${INVENTORY_CSV}`)
  }

  const productIdByHandle = new Map<string, string>()

  // ------------------------------------------------------------- products
  for (const product of data.products) {
    console.log(`Product: ${product.title}`)

    const { data: upserted, error } = await supabase
      .from('products')
      .upsert(
        {
          slug: product.handle,
          title: product.title,
          description_html: product.body_html,
          status: product.published_at ? 'active' : 'draft',
          vendor: product.vendor,
          product_type: product.product_type,
          tags: product.tags,
          currency: 'EUR',
          taxable: true,
          tax_included: true,
          published_at: product.published_at,
          external_source: SOURCE,
          external_id: product.external_id,
        },
        { onConflict: 'external_source,external_id' },
      )
      .select('id')
      .single()

    if (error || !upserted) throw new Error(`product ${product.handle}: ${error?.message}`)

    const productId = upserted.id
    productIdByHandle.set(product.handle, productId)

    // ------------------------------------------------------------ variants
    // The single option on this catalogue is Size; map it to the dedicated
    // column so filtering and the picker do not have to parse titles.
    const sizeOption = product.options.find((o) => o.name.toLowerCase() === 'size')

    for (const variant of product.variants) {
      const quantity =
        (variant.sku ? inventory.get(variant.sku) : undefined) ??
        (variant.available ? DEFAULT_INVENTORY : 0)

      const { error: variantError } = await supabase.from('product_variants').upsert(
        {
          product_id: productId,
          title: variant.title,
          sku: variant.sku,
          size: sizeOption ? variant.option1 : null,
          price_cents: toCents(variant.price) ?? 0,
          compare_at_cents: toCents(variant.compare_at_price),
          weight_grams: variant.grams,
          position: variant.position,
          active: true,
          inventory_quantity: quantity,
          inventory_tracked: true,
          external_source: SOURCE,
          external_id: variant.external_id,
        },
        { onConflict: 'external_source,external_id' },
      )

      if (variantError) {
        throw new Error(`variant ${variant.external_id}: ${variantError.message}`)
      }
    }

    // -------------------------------------------------------------- images
    // Replace the image set wholesale so removals upstream are reflected.
    await supabase.from('product_images').delete().eq('product_id', productId)

    for (const [index, image] of product.images.entries()) {
      const sourceUrl = rewriteImageUrl(image.src)
      let storagePath: string | null = null

      if (IMAGE_STRATEGY === 'storage') {
        const extension = new URL(image.src).pathname.split('.').pop() ?? 'jpg'
        storagePath = await uploadImage(
          'product-media',
          `${productId}/${String(index + 1).padStart(2, '0')}-${image.external_id}.${extension}`,
          sourceUrl,
        )
      }

      const { error: imageError } = await supabase.from('product_images').insert({
        product_id: productId,
        storage_path: storagePath,
        external_url: storagePath ? null : sourceUrl,
        alt: image.alt ?? product.title,
        width: image.width,
        height: image.height,
        position: image.position,
        is_primary: index === 0,
      })

      if (imageError) throw new Error(`image ${image.external_id}: ${imageError.message}`)
    }

    console.log(
      `  ${product.variants.length} variants, ${product.images.length} images`,
    )
  }

  // ---------------------------------------------------------- collections
  for (const collection of data.collections) {
    // Shopify's default catch-all collection is called "frontpage" and titled
    // "Home page"; on the storefront it is the homepage's featured row.
    const { data: upserted, error } = await supabase
      .from('collections')
      .upsert(
        {
          slug: collection.handle,
          title: collection.title,
          description_html: collection.body_html,
          image_url: collection.image,
          status: 'active',
          // The homepage row follows the collection's own manual order.
          sort_order: 'manual',
          external_source: SOURCE,
          external_id: collection.external_id,
        },
        { onConflict: 'external_source,external_id' },
      )
      .select('id')
      .single()

    if (error || !upserted) throw new Error(`collection ${collection.handle}: ${error?.message}`)

    await supabase.from('collection_products').delete().eq('collection_id', upserted.id)

    const memberships = collection.product_handles
      .map((handle, index) => {
        const productId = productIdByHandle.get(handle)
        if (!productId) return null
        return { collection_id: upserted.id, product_id: productId, position: index }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    if (memberships.length > 0) {
      const { error: linkError } = await supabase
        .from('collection_products')
        .insert(memberships)
      if (linkError) throw new Error(`collection links: ${linkError.message}`)
    }

    console.log(`Collection: ${collection.title} (${memberships.length} products)`)
  }

  // ------------------------------------------------------ policies & pages
  for (const policy of data.policies) {
    const { error } = await supabase.from('content_pages').upsert(
      {
        slug: policy.slug,
        kind: 'policy',
        title: policy.title,
        body_html: policy.body_html,
        position: policy.position,
        published: true,
      },
      { onConflict: 'kind,slug' },
    )
    if (error) throw new Error(`policy ${policy.slug}: ${error.message}`)
  }
  console.log(`Policies: ${data.policies.length}`)

  for (const page of data.pages) {
    const { error } = await supabase.from('content_pages').upsert(
      {
        slug: page.slug,
        kind: 'page',
        title: page.title,
        body_html: page.body_html,
        // The About template renders this as its rich-text heading.
        seo_title: page.heading,
        published: true,
      },
      { onConflict: 'kind,slug' },
    )
    if (error) throw new Error(`page ${page.slug}: ${error.message}`)
  }
  console.log(`Pages: ${data.pages.length}`)

  // ---------------------------------------------------- site configuration
  const site = data.site as {
    name: string
    logo_url: string | null
    instagram: string | null
    contact_email: string | null
    newsletter_heading: string
    currency: string
    navigation: { label: string; href: string }[]
    homepage: {
      banner: {
        image: string | null
        heading: string | null
        cta_href: string | null
        cta_label: string | null
      }
      featured_collection: {
        title: string | null
        description: string | null
        limit: number
      }
    }
  }

  let logoPath: string | null = null
  let bannerPath: string | null = null

  if (IMAGE_STRATEGY === 'storage') {
    if (site.logo_url) {
      logoPath = await uploadImage('site-media', 'logo.png', rewriteImageUrl(site.logo_url))
    }
    if (site.homepage.banner.image) {
      bannerPath = await uploadImage(
        'site-media',
        'homepage-banner.png',
        rewriteImageUrl(site.homepage.banner.image),
      )
    }
  }

  const publicUrl = (path: string) =>
    `${SUPABASE_URL}/storage/v1/object/public/site-media/${path}`

  const { error: settingsError } = await supabase.from('site_settings').upsert({
    key: 'site',
    value: {
      name: site.name,
      logoUrl: logoPath ? publicUrl(logoPath) : rewriteImageUrl(site.logo_url ?? ''),
      instagramUrl: site.instagram,
      contactEmail: site.contact_email,
      newsletterHeading: site.newsletter_heading,
      currency: site.currency,
      localization: { country: 'Belgium', currency: 'EUR', symbol: '€' },
    },
  })
  if (settingsError) throw new Error(`site settings: ${settingsError.message}`)

  // ---------------------------------------------------------- navigation
  await supabase.from('navigation_items').delete().eq('menu', 'main')
  const { error: navError } = await supabase.from('navigation_items').insert(
    site.navigation.map((item, index) => ({
      menu: 'main',
      label: item.label,
      href: item.href,
      position: index,
    })),
  )
  if (navError) throw new Error(`navigation: ${navError.message}`)
  console.log(`Navigation: ${site.navigation.length} items`)

  // ---------------------------------------------------- homepage sections
  await supabase.from('homepage_sections').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  const { error: sectionError } = await supabase.from('homepage_sections').insert([
    {
      kind: 'image_banner',
      position: 0,
      enabled: true,
      settings: {
        image: bannerPath
          ? publicUrl(bannerPath)
          : rewriteImageUrl(site.homepage.banner.image ?? ''),
        heading: site.homepage.banner.heading,
        cta_label: site.homepage.banner.cta_label,
        cta_href: site.homepage.banner.cta_href,
      },
    },
    {
      kind: 'featured_collection',
      position: 1,
      enabled: true,
      settings: {
        title: site.homepage.featured_collection.title,
        description: site.homepage.featured_collection.description,
        collection: 'frontpage',
        limit: site.homepage.featured_collection.limit,
        view_all_href: '/collections/all',
      },
    },
  ])
  if (sectionError) throw new Error(`homepage sections: ${sectionError.message}`)
  console.log('Homepage sections: 2')

  // ------------------------------------------------------------- redirects
  // Preserve the Shopify URLs that change shape on the new site.
  const redirects = [
    { from_path: '/blogs/news', to_path: '/about', permanent: true },
    { from_path: '/pages/contact', to_path: '/contact', permanent: true },
    { from_path: '/pages/about', to_path: '/about', permanent: true },
    { from_path: '/collections/frontpage', to_path: '/collections/all', permanent: true },
  ]

  for (const redirect of redirects) {
    const { error: redirectError } = await supabase
      .from('redirects')
      .upsert(redirect, { onConflict: 'from_path' })
    if (redirectError) throw new Error(`redirect: ${redirectError.message}`)
  }
  console.log(`Redirects: ${redirects.length}`)

  console.log('\nImport complete.')

  if (!INVENTORY_CSV) {
    console.log(
      `\nNOTE: inventory was seeded at ${DEFAULT_INVENTORY} per available variant.\n` +
        '      The public Shopify API exposes only an availability boolean.\n' +
        '      Re-run with INVENTORY_CSV=<shopify-products-export.csv> to load\n' +
        '      real per-variant counts, or set them in /admin.',
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
