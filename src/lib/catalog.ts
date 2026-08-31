import 'server-only'

import { createSupabasePublicClient } from '@/lib/supabase/server'
import { SUPABASE_URL } from '@/lib/env'
import type {
  CollectionRow,
  ContentPageRow,
  NavigationItemRow,
  ProductImageRow,
  ProductRow,
  ProductVariantRow,
} from '@/types/database'

export interface ProductImage {
  id: string
  url: string
  alt: string
  width: number | null
  height: number | null
  position: number
  isPrimary: boolean
  variantId: string | null
}

export interface ProductVariant {
  id: string
  title: string
  sku: string | null
  size: string | null
  priceCents: number
  compareAtCents: number | null
  available: boolean
  inventoryQuantity: number
  position: number
}

export interface Product {
  id: string
  slug: string
  title: string
  vendor: string | null
  descriptionHtml: string | null
  currency: string
  priceCents: number
  compareAtCents: number | null
  available: boolean
  onSale: boolean
  tags: string[]
  seoTitle: string | null
  seoDescription: string | null
  images: ProductImage[]
  variants: ProductVariant[]
}

export interface Collection {
  id: string
  slug: string
  title: string
  descriptionHtml: string | null
  imageUrl: string | null
  sortOrder: string
}

/** Resolves a stored image reference to a URL the browser can load. */
export function imageUrl(row: Pick<ProductImageRow, 'storage_path' | 'external_url'>): string {
  if (row.storage_path) {
    return `${SUPABASE_URL()}/storage/v1/object/public/product-media/${row.storage_path}`
  }
  return row.external_url ?? ''
}

const PRODUCT_SELECT = `
  id, slug, title, vendor, description_html, currency, base_price_cents,
  compare_at_cents, tags, seo_title, seo_description, status, position, created_at,
  product_variants ( id, title, sku, size, price_cents, compare_at_cents, active,
                     inventory_quantity, inventory_tracked, allow_backorder, position ),
  product_images ( id, storage_path, external_url, alt, width, height, position,
                   is_primary, variant_id )
`

type RawProduct = Pick<
  ProductRow,
  | 'id'
  | 'slug'
  | 'title'
  | 'vendor'
  | 'description_html'
  | 'currency'
  | 'base_price_cents'
  | 'compare_at_cents'
  | 'tags'
  | 'seo_title'
  | 'seo_description'
> & {
  product_variants: (Pick<
    ProductVariantRow,
    | 'id'
    | 'title'
    | 'sku'
    | 'size'
    | 'price_cents'
    | 'compare_at_cents'
    | 'active'
    | 'inventory_quantity'
    | 'inventory_tracked'
    | 'allow_backorder'
    | 'position'
  >)[]
  product_images: (Pick<
    ProductImageRow,
    | 'id'
    | 'storage_path'
    | 'external_url'
    | 'alt'
    | 'width'
    | 'height'
    | 'position'
    | 'is_primary'
    | 'variant_id'
  >)[]
}

function shapeProduct(row: RawProduct): Product {
  const variants: ProductVariant[] = (row.product_variants ?? [])
    .filter((v) => v.active)
    .sort((a, b) => a.position - b.position)
    .map((v) => ({
      id: v.id,
      title: v.title,
      sku: v.sku,
      size: v.size,
      priceCents: v.price_cents,
      compareAtCents: v.compare_at_cents,
      available:
        !v.inventory_tracked || v.allow_backorder || v.inventory_quantity > 0,
      inventoryQuantity: v.inventory_quantity,
      position: v.position,
    }))

  const images: ProductImage[] = (row.product_images ?? [])
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position)
    .map((img) => ({
      id: img.id,
      url: imageUrl(img),
      alt: img.alt ?? row.title,
      width: img.width,
      height: img.height,
      position: img.position,
      isPrimary: img.is_primary,
      variantId: img.variant_id,
    }))

  const priceCents =
    row.base_price_cents ??
    (variants.length ? Math.min(...variants.map((v) => v.priceCents)) : 0)

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    vendor: row.vendor,
    descriptionHtml: row.description_html,
    currency: row.currency,
    priceCents,
    compareAtCents: row.compare_at_cents,
    available: variants.some((v) => v.available),
    onSale: Boolean(row.compare_at_cents && row.compare_at_cents > priceCents),
    tags: row.tags ?? [],
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    images,
    variants,
  }
}

/**
 * All active products, ordered the way the reference storefront orders
 * /collections/all: alphabetically by title.
 */
export async function getAllProducts(): Promise<Product[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('status', 'active')
    .order('title', { ascending: true })

  if (error) throw new Error(`getAllProducts: ${error.message}`)
  return ((data ?? []) as unknown as RawProduct[]).map(shapeProduct)
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()

  if (error) throw new Error(`getProductBySlug(${slug}): ${error.message}`)
  return data ? shapeProduct(data as unknown as RawProduct) : null
}

export async function getProductSlugs(): Promise<string[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('products')
    .select('slug')
    .eq('status', 'active')

  if (error) throw new Error(`getProductSlugs: ${error.message}`)
  return (data ?? []).map((r) => r.slug)
}

export async function getCollectionBySlug(slug: string): Promise<Collection | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('collections')
    .select('id, slug, title, description_html, image_url, image_path, sort_order')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()

  if (error) throw new Error(`getCollectionBySlug(${slug}): ${error.message}`)
  if (!data) return null

  const row = data as Pick<
    CollectionRow,
    'id' | 'slug' | 'title' | 'description_html' | 'image_url' | 'image_path' | 'sort_order'
  >

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    descriptionHtml: row.description_html,
    imageUrl: row.image_path
      ? `${SUPABASE_URL()}/storage/v1/object/public/collection-media/${row.image_path}`
      : row.image_url,
    sortOrder: row.sort_order,
  }
}

export async function getCollections(): Promise<Collection[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('collections')
    .select('id, slug, title, description_html, image_url, image_path, sort_order')
    .eq('status', 'active')
    .order('position', { ascending: true })

  if (error) throw new Error(`getCollections: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    descriptionHtml: row.description_html,
    imageUrl: row.image_path
      ? `${SUPABASE_URL()}/storage/v1/object/public/collection-media/${row.image_path}`
      : row.image_url,
    sortOrder: row.sort_order,
  }))
}

function sortProducts(products: Product[], sortOrder: string): Product[] {
  const sorted = [...products]
  switch (sortOrder) {
    case 'title_desc':
      return sorted.sort((a, b) => b.title.localeCompare(a.title))
    case 'price_asc':
      return sorted.sort((a, b) => a.priceCents - b.priceCents)
    case 'price_desc':
      return sorted.sort((a, b) => b.priceCents - a.priceCents)
    case 'title_asc':
      return sorted.sort((a, b) => a.title.localeCompare(b.title))
    // 'manual', 'created_desc' and 'created_asc' are applied by the query.
    default:
      return sorted
  }
}

/**
 * Products in a collection.
 *
 * `manual` preserves the position column, which is how the homepage's featured
 * row keeps the same order as the reference store.
 */
export async function getCollectionProducts(
  slug: string,
  options: { limit?: number } = {},
): Promise<{ collection: Collection | null; products: Product[] }> {
  const collection = await getCollectionBySlug(slug)
  if (!collection) return { collection: null, products: [] }

  const supabase = createSupabasePublicClient()
  let query = supabase
    .from('collection_products')
    .select(`position, products!inner ( ${PRODUCT_SELECT} )`)
    .eq('collection_id', collection.id)
    .eq('products.status', 'active')
    .order('position', { ascending: true })

  if (options.limit) query = query.limit(options.limit)

  const { data, error } = await query
  if (error) throw new Error(`getCollectionProducts(${slug}): ${error.message}`)

  const rows = (data ?? []) as unknown as { position: number; products: RawProduct }[]
  const products = rows.map((r) => shapeProduct(r.products))

  // 'manual' means the join table's position column is already the order.
  return {
    collection,
    products:
      collection.sortOrder === 'manual'
        ? products
        : sortProducts(products, collection.sortOrder),
  }
}

/** Full-text-ish search over title and description. */
export async function searchProducts(term: string): Promise<Product[]> {
  const trimmed = term.trim()
  if (!trimmed) return []

  const supabase = createSupabasePublicClient()
  const pattern = `%${trimmed.replace(/[%_]/g, (m) => `\\${m}`)}%`

  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('status', 'active')
    .or(`title.ilike.${pattern},description_html.ilike.${pattern}`)
    .order('title', { ascending: true })

  if (error) throw new Error(`searchProducts: ${error.message}`)
  return ((data ?? []) as unknown as RawProduct[]).map(shapeProduct)
}

export async function getNavigation(menu = 'main'): Promise<NavigationItemRow[]> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('navigation_items')
    .select('*')
    .eq('menu', menu)
    .order('position', { ascending: true })

  if (error) throw new Error(`getNavigation: ${error.message}`)
  return data ?? []
}

export async function getContentPage(
  slug: string,
  kind: 'page' | 'policy' = 'page',
): Promise<ContentPageRow | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('content_pages')
    .select('*')
    .eq('slug', slug)
    .eq('kind', kind)
    .eq('published', true)
    .maybeSingle()

  if (error) throw new Error(`getContentPage(${slug}): ${error.message}`)
  return data
}

export async function getSiteSetting<T = Record<string, unknown>>(
  key: string,
): Promise<T | null> {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()

  if (error) throw new Error(`getSiteSetting(${key}): ${error.message}`)
  return (data?.value as T) ?? null
}

export async function getHomepageSections() {
  const supabase = createSupabasePublicClient()
  const { data, error } = await supabase
    .from('homepage_sections')
    .select('*')
    .eq('enabled', true)
    .order('position', { ascending: true })

  if (error) throw new Error(`getHomepageSections: ${error.message}`)
  return data ?? []
}
