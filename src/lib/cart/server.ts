import 'server-only'

import { cookies } from 'next/headers'

import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { imageUrl } from '@/lib/catalog'
import type { CartRow } from '@/types/database'

export const CART_COOKIE = 'amiriani_cart'

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 days
}

export interface CartLine {
  id: string
  variantId: string
  productId: string
  productTitle: string
  productSlug: string
  variantTitle: string
  sku: string | null
  imageUrl: string | null
  unitPriceCents: number
  compareAtCents: number | null
  quantity: number
  lineTotalCents: number
  /** Stock actually available right now, so the cart page can flag shortfalls. */
  availableQuantity: number | null
  available: boolean
}

export interface Cart {
  id: string
  token: string
  currency: string
  lines: CartLine[]
  itemCount: number
  subtotalCents: number
  discountCode: string | null
}

export const EMPTY_CART: Cart = {
  id: '',
  token: '',
  currency: 'EUR',
  lines: [],
  itemCount: 0,
  subtotalCents: 0,
  discountCode: null,
}

/**
 * Reads the cart for the current visitor without creating one.
 *
 * Anonymous carts are addressed by an unguessable token in an httpOnly cookie,
 * so the browser can never enumerate or tamper with another visitor's cart.
 * All access goes through the service-role client because RLS deliberately
 * gives the anon role no path to carts at all.
 */
export async function getCart(): Promise<Cart> {
  const token = (await cookies()).get(CART_COOKIE)?.value
  if (!token) return EMPTY_CART
  return loadCartByToken(token)
}

export async function loadCartByToken(token: string): Promise<Cart> {
  const supabase = createSupabaseAdminClient()

  const { data: cartRow } = await supabase
    .from('carts')
    .select('id, token, currency, discount_code, completed_at')
    .eq('token', token)
    .is('completed_at', null)
    .maybeSingle()

  if (!cartRow) return EMPTY_CART

  const { data: items, error } = await supabase
    .from('cart_items')
    .select(
      `id, quantity, variant_id,
       product_variants!inner (
         id, title, sku, price_cents, compare_at_cents, active,
         inventory_quantity, inventory_tracked, allow_backorder,
         products!inner ( id, title, slug, currency, status )
       )`,
    )
    .eq('cart_id', cartRow.id)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`loadCart: ${error.message}`)

  type Row = {
    id: string
    quantity: number
    variant_id: string
    product_variants: {
      id: string
      title: string
      sku: string | null
      price_cents: number
      compare_at_cents: number | null
      active: boolean
      inventory_quantity: number
      inventory_tracked: boolean
      allow_backorder: boolean
      products: {
        id: string
        title: string
        slug: string
        currency: string
        status: string
      }
    }
  }

  const rows = (items ?? []) as unknown as Row[]

  // One query for the primary image of every product in the cart.
  const productIds = [...new Set(rows.map((r) => r.product_variants.products.id))]
  const imagesByProduct = new Map<string, string>()

  if (productIds.length > 0) {
    const { data: images } = await supabase
      .from('product_images')
      .select('product_id, storage_path, external_url, is_primary, position')
      .in('product_id', productIds)
      .order('is_primary', { ascending: false })
      .order('position', { ascending: true })

    for (const img of images ?? []) {
      if (!imagesByProduct.has(img.product_id)) {
        imagesByProduct.set(img.product_id, imageUrl(img))
      }
    }
  }

  const lines: CartLine[] = rows.map((row) => {
    const variant = row.product_variants
    const product = variant.products
    const tracked = variant.inventory_tracked && !variant.allow_backorder
    return {
      id: row.id,
      variantId: variant.id,
      productId: product.id,
      productTitle: product.title,
      productSlug: product.slug,
      variantTitle: variant.title,
      sku: variant.sku,
      imageUrl: imagesByProduct.get(product.id) ?? null,
      unitPriceCents: variant.price_cents,
      compareAtCents: variant.compare_at_cents,
      quantity: row.quantity,
      lineTotalCents: variant.price_cents * row.quantity,
      availableQuantity: tracked ? variant.inventory_quantity : null,
      available:
        variant.active &&
        product.status === 'active' &&
        (!tracked || variant.inventory_quantity >= row.quantity),
    }
  })

  return {
    id: cartRow.id,
    token: cartRow.token,
    currency: (cartRow as CartRow).currency,
    lines,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    discountCode: cartRow.discount_code,
  }
}

/** Returns the visitor's cart, creating one (and setting the cookie) if needed. */
export async function getOrCreateCart(): Promise<{ id: string; token: string }> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(CART_COOKIE)?.value
  const supabase = createSupabaseAdminClient()

  if (existing) {
    const { data } = await supabase
      .from('carts')
      .select('id, token')
      .eq('token', existing)
      .is('completed_at', null)
      .maybeSingle()
    if (data) return data
  }

  const { data, error } = await supabase
    .from('carts')
    .insert({})
    .select('id, token')
    .single()

  if (error || !data) throw new Error(`getOrCreateCart: ${error?.message}`)

  cookieStore.set(CART_COOKIE, data.token, COOKIE_OPTIONS)
  return data
}

/*
 * There is deliberately no `clearCartCookie` helper.
 *
 * Nothing needs one: checkout sets `carts.completed_at`, and every read here
 * filters on `completed_at is null`, so a leftover token already behaves as an
 * empty cart and `getOrCreateCart` replaces it on the next add. Offering the
 * helper only tempted callers to invoke it from the confirmation page — a
 * Server Component, where writing a cookie throws and takes the page down.
 */

/**
 * Attaches an anonymous cart to a customer once they sign in, so the items
 * they collected before authenticating are not lost.
 */
export async function attachCartToCustomer(customerId: string): Promise<void> {
  const token = (await cookies()).get(CART_COOKIE)?.value
  if (!token) return

  const supabase = createSupabaseAdminClient()
  await supabase
    .from('carts')
    .update({ customer_id: customerId })
    .eq('token', token)
    .is('completed_at', null)
}
