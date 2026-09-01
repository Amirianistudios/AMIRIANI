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
 *   SHOPIFY_CSV=<path>       Shopify admin product export CSV. Supplies
 *                            everything the public storefront cannot: real
 *                            per-variant inventory, barcodes, cost per item,
 *                            per-variant weight, and SEO title/description.
 *                            Strongly recommended before going live.
 *                            (INVENTORY_CSV is accepted as an older alias.)
 *   DEFAULT_INVENTORY=<n>     placeholder stock for available variants when no
 *                            CSV is given (default 25). Placeholder only — the
 *                            public JSON exposes just an availability boolean.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const IMAGE_STRATEGY = (process.env.IMAGE_STRATEGY ?? 'storage') as 'storage' | 'external'
const IMAGE_BASE_URL = process.env.IMAGE_BASE_URL ?? null
const DEFAULT_INVENTORY = Number(process.env.DEFAULT_INVENTORY ?? 25)
/** Force placeholder stock over existing values. Off by default; see below. */
const OVERWRITE_INVENTORY = process.env.OVERWRITE_INVENTORY === '1'
// SHOPIFY_CSV is the current name; INVENTORY_CSV is kept working so existing
// commands and docs do not break.
const SHOPIFY_CSV = process.env.SHOPIFY_CSV ?? process.env.INVENTORY_CSV ?? null

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
 * Everything a Shopify admin product export carries that the public storefront
 * JSON does not. Keyed by variant SKU, which is the only identifier common to
 * both the CSV and the public feed.
 */
interface AdminVariantFields {
  inventoryQuantity: number | null
  barcode: string | null
  costCents: number | null
  weightGrams: number | null
  requiresShipping: boolean | null
  taxable: boolean | null
}

/** Per-product fields from the CSV, keyed by product handle. */
interface AdminProductFields {
  seoTitle: string | null
  seoDescription: string | null
  productType: string | null
  vendor: string | null
  status: string | null
}

interface AdminExport {
  variants: Map<string, AdminVariantFields>
  products: Map<string, AdminProductFields>
}

/** Case- and spacing-insensitive column lookup, returning -1 when absent. */
function columnIndex(header: string[], ...names: string[]): number {
  const normalised = header.map((h) => h.trim().toLowerCase())
  for (const name of names) {
    const index = normalised.indexOf(name.toLowerCase())
    if (index !== -1) return index
  }
  return -1
}

function cell(row: string[], index: number): string | null {
  if (index === -1) return null
  const value = row[index]?.trim()
  return value ? value : null
}

/**
 * Parses a Shopify admin product export CSV.
 *
 * Shopify emits one row per variant, with product-level columns filled only on
 * the first row of each product and blank on the rest — so product fields are
 * carried forward from the last row that had a handle.
 *
 * Weight needs unit conversion: the CSV reports a value plus a unit column
 * (g/kg/lb/oz), and the database stores grams.
 */
async function loadAdminExport(path: string): Promise<AdminExport> {
  const text = await readFile(path, 'utf8')
  const rows = parseCsv(text)
  const header = rows.shift()
  if (!header) return { variants: new Map(), products: new Map() }

  const idx = {
    handle: columnIndex(header, 'Handle'),
    sku: columnIndex(header, 'Variant SKU'),
    qty: columnIndex(header, 'Variant Inventory Qty', 'Variant Inventory Quantity'),
    barcode: columnIndex(header, 'Variant Barcode'),
    cost: columnIndex(header, 'Cost per item', 'Variant Cost'),
    weight: columnIndex(header, 'Variant Grams', 'Variant Weight'),
    weightUnit: columnIndex(header, 'Variant Weight Unit'),
    requiresShipping: columnIndex(header, 'Variant Requires Shipping'),
    taxable: columnIndex(header, 'Variant Taxable'),
    seoTitle: columnIndex(header, 'SEO Title'),
    seoDescription: columnIndex(header, 'SEO Description'),
    productType: columnIndex(header, 'Type', 'Product Type'),
    vendor: columnIndex(header, 'Vendor'),
    status: columnIndex(header, 'Status'),
  }

  if (idx.handle === -1 || idx.sku === -1) {
    throw new Error(
      'SHOPIFY_CSV does not look like a Shopify product export ' +
        '(expected at least "Handle" and "Variant SKU" columns)',
    )
  }

  const variants = new Map<string, AdminVariantFields>()
  const products = new Map<string, AdminProductFields>()
  let currentHandle: string | null = null

  for (const row of rows) {
    const handle = cell(row, idx.handle)
    if (handle) currentHandle = handle

    // Product-level columns appear only on a product's first row.
    if (handle && currentHandle) {
      products.set(currentHandle, {
        seoTitle: cell(row, idx.seoTitle),
        seoDescription: cell(row, idx.seoDescription),
        productType: cell(row, idx.productType),
        vendor: cell(row, idx.vendor),
        status: cell(row, idx.status)?.toLowerCase() ?? null,
      })
    }

    const sku = cell(row, idx.sku)
    if (!sku) continue

    const qtyRaw = cell(row, idx.qty)
    const qty = qtyRaw === null ? null : Number(qtyRaw)

    const costRaw = cell(row, idx.cost)
    const cost = costRaw === null ? null : Number(costRaw)

    const weightRaw = cell(row, idx.weight)
    const weightValue = weightRaw === null ? null : Number(weightRaw)
    const weightUnit = (cell(row, idx.weightUnit) ?? 'g').toLowerCase()

    const toGrams = (value: number): number => {
      switch (weightUnit) {
        case 'kg':
          return Math.round(value * 1000)
        case 'lb':
          return Math.round(value * 453.59237)
        case 'oz':
          return Math.round(value * 28.349523)
        default:
          return Math.round(value)
      }
    }

    const boolOf = (index: number): boolean | null => {
      const raw = cell(row, index)
      if (raw === null) return null
      return ['true', 'yes', '1'].includes(raw.toLowerCase())
    }

    variants.set(sku, {
      inventoryQuantity:
        qty !== null && Number.isFinite(qty) ? Math.max(0, Math.trunc(qty)) : null,
      barcode: cell(row, idx.barcode),
      costCents:
        cost !== null && Number.isFinite(cost) ? Math.round(cost * 100) : null,
      weightGrams:
        weightValue !== null && Number.isFinite(weightValue) ? toGrams(weightValue) : null,
      requiresShipping: boolOf(idx.requiresShipping),
      taxable: boolOf(idx.taxable),
    })
  }

  return { variants, products }
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

  const admin: AdminExport = SHOPIFY_CSV
    ? await loadAdminExport(SHOPIFY_CSV)
    : { variants: new Map(), products: new Map() }

  if (SHOPIFY_CSV) {
    console.log(
      `Admin export: ${admin.variants.size} variants and ` +
        `${admin.products.size} products from ${SHOPIFY_CSV}`,
    )
  }

  const productIdByHandle = new Map<string, string>()
  // Counts variants whose existing stock this run deliberately left untouched.
  let preservedStock = 0

  // ------------------------------------------------------------- products
  for (const product of data.products) {
    console.log(`Product: ${product.title}`)

    // Fields the public storefront JSON cannot expose, when a CSV was supplied.
    const adminProduct = admin.products.get(product.handle)

    const { data: upserted, error } = await supabase
      .from('products')
      .upsert(
        {
          slug: product.handle,
          title: product.title,
          description_html: product.body_html,
          status:
            adminProduct?.status === 'draft'
              ? 'draft'
              : adminProduct?.status === 'archived'
                ? 'archived'
                : product.published_at
                  ? 'active'
                  : 'draft',
          vendor: adminProduct?.vendor ?? product.vendor,
          product_type: adminProduct?.productType ?? product.product_type,
          seo_title: adminProduct?.seoTitle ?? null,
          seo_description: adminProduct?.seoDescription ?? null,
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
      const adminVariant = variant.sku ? admin.variants.get(variant.sku) : undefined

      // Does this variant already exist? Determines whether we may touch stock.
      const { data: existingVariant } = await supabase
        .from('product_variants')
        .select('id, inventory_quantity')
        .eq('external_source', SOURCE)
        .eq('external_id', variant.external_id)
        .maybeSingle()

      /*
       * Inventory is deliberately conservative on re-import.
       *
       * Re-running this script is the normal way to sync catalogue changes, and
       * stock moves for reasons the script knows nothing about — sales,
       * restocks, admin corrections. Blindly upserting a number would silently
       * undo all of that, and on a store with no admin CSV it would reset live
       * stock to a placeholder.
       *
       * So: set stock when creating a variant, or when the admin export states
       * it explicitly. Otherwise leave whatever the database holds. Pass
       * OVERWRITE_INVENTORY=1 to force the export's numbers over the top.
       */
      const quantity: number | undefined = (() => {
        if (adminVariant?.inventoryQuantity !== null && adminVariant?.inventoryQuantity !== undefined) {
          return adminVariant.inventoryQuantity
        }
        if (!existingVariant) return variant.available ? DEFAULT_INVENTORY : 0
        if (OVERWRITE_INVENTORY) return variant.available ? DEFAULT_INVENTORY : 0
        return undefined
      })()

      if (existingVariant && quantity === undefined) preservedStock += 1

      const { error: variantError } = await supabase.from('product_variants').upsert(
        {
          product_id: productId,
          title: variant.title,
          sku: variant.sku,
          barcode: adminVariant?.barcode ?? null,
          size: sizeOption ? variant.option1 : null,
          price_cents: toCents(variant.price) ?? 0,
          compare_at_cents: toCents(variant.compare_at_price),
          cost_cents: adminVariant?.costCents ?? null,
          weight_grams: adminVariant?.weightGrams ?? variant.grams,
          position: variant.position,
          active: true,
          // Omitted entirely when undefined, so the stored value survives.
          ...(quantity === undefined ? {} : { inventory_quantity: quantity }),
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

  if (!SHOPIFY_CSV) {
    console.log(
      `\nWARNING: inventory is PLACEHOLDER data — ${DEFAULT_INVENTORY} per available\n` +
        '         variant. The public Shopify API exposes only an availability\n' +
        '         boolean, so there is no real count to import.\n\n' +
        '         Do not go live on these numbers. Export your products from\n' +
        '         Shopify admin (Products -> Export -> CSV) and re-run:\n\n' +
        '           SHOPIFY_CSV=./products_export.csv npm run data:import\n\n' +
        '         That also fills in barcodes, cost per item, per-variant weight\n' +
        '         and SEO title/description, none of which are public either.',
    )
  } else {
    const withStock = [...admin.variants.values()].filter(
      (v) => v.inventoryQuantity !== null,
    ).length
    console.log(
      `\nInventory, barcodes, costs and SEO imported from the admin export ` +
        `(${withStock} variants with real counts).`,
    )
  }

  if (preservedStock > 0) {
    console.log(
      `\nLeft existing stock untouched on ${preservedStock} variant(s): this run ` +
        'had no count for them,\n     and overwriting would have discarded sales ' +
        'and admin corrections.\n     Pass OVERWRITE_INVENTORY=1 to force placeholder ' +
        'values instead.',
    )
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
