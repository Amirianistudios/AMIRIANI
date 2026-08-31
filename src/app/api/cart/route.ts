import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCart, getOrCreateCart, loadCartByToken } from '@/lib/cart/server'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const addSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
})

const updateSchema = z.object({
  lineId: z.string().uuid(),
  quantity: z.number().int().min(0).max(99),
})

const removeSchema = z.object({ lineId: z.string().uuid() })

export async function GET() {
  const cart = await getCart()
  return NextResponse.json({ cart })
}

/** Add a variant to the cart, or bump its quantity if already present. */
export async function POST(request: Request) {
  const limited = await rateLimit(request, 'cart-add', { limit: 60, windowMs: 60_000 })
  if (limited) return limited

  const parsed = addSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const { variantId, quantity } = parsed.data
  const supabase = createSupabaseAdminClient()

  // Validate the variant server-side: it must exist, be active, belong to an
  // active product, and have the stock to cover the requested quantity.
  const { data: variant } = await supabase
    .from('product_variants')
    .select(
      `id, active, inventory_quantity, inventory_tracked, allow_backorder,
       products!inner ( status )`,
    )
    .eq('id', variantId)
    .maybeSingle()

  type VariantRow = {
    id: string
    active: boolean
    inventory_quantity: number
    inventory_tracked: boolean
    allow_backorder: boolean
    products: { status: string }
  }

  const row = variant as unknown as VariantRow | null

  if (!row || !row.active || row.products.status !== 'active') {
    return NextResponse.json({ error: 'This item is unavailable.' }, { status: 404 })
  }

  const cart = await getOrCreateCart()

  const { data: existing } = await supabase
    .from('cart_items')
    .select('id, quantity')
    .eq('cart_id', cart.id)
    .eq('variant_id', variantId)
    .maybeSingle()

  const desired = (existing?.quantity ?? 0) + quantity

  if (row.inventory_tracked && !row.allow_backorder && desired > row.inventory_quantity) {
    return NextResponse.json(
      {
        error:
          row.inventory_quantity > 0
            ? `Only ${row.inventory_quantity} left in stock.`
            : 'This item is sold out.',
      },
      { status: 409 },
    )
  }

  if (desired > 99) {
    return NextResponse.json({ error: 'Maximum quantity is 99.' }, { status: 409 })
  }

  const { error } = existing
    ? await supabase.from('cart_items').update({ quantity: desired }).eq('id', existing.id)
    : await supabase
        .from('cart_items')
        .insert({ cart_id: cart.id, variant_id: variantId, quantity })

  if (error) {
    return NextResponse.json({ error: 'Could not add to cart.' }, { status: 500 })
  }

  return NextResponse.json({ cart: await loadCartByToken(cart.token) })
}

/** Change a line's quantity. Zero removes the line. */
export async function PATCH(request: Request) {
  const limited = await rateLimit(request, 'cart-update', { limit: 120, windowMs: 60_000 })
  if (limited) return limited

  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const cart = await getCart()
  if (!cart.id) return NextResponse.json({ cart }, { status: 200 })

  const { lineId, quantity } = parsed.data
  const line = cart.lines.find((l) => l.id === lineId)
  // Only lines belonging to this visitor's cart are addressable.
  if (!line) return NextResponse.json({ error: 'Line not found.' }, { status: 404 })

  const supabase = createSupabaseAdminClient()

  if (quantity === 0) {
    await supabase.from('cart_items').delete().eq('id', lineId).eq('cart_id', cart.id)
    return NextResponse.json({ cart: await loadCartByToken(cart.token) })
  }

  if (line.availableQuantity !== null && quantity > line.availableQuantity) {
    return NextResponse.json(
      { error: `Only ${line.availableQuantity} left in stock.` },
      { status: 409 },
    )
  }

  await supabase
    .from('cart_items')
    .update({ quantity })
    .eq('id', lineId)
    .eq('cart_id', cart.id)

  return NextResponse.json({ cart: await loadCartByToken(cart.token) })
}

export async function DELETE(request: Request) {
  const parsed = removeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const cart = await getCart()
  if (!cart.id) return NextResponse.json({ cart })

  const supabase = createSupabaseAdminClient()
  await supabase
    .from('cart_items')
    .delete()
    .eq('id', parsed.data.lineId)
    .eq('cart_id', cart.id)

  return NextResponse.json({ cart: await loadCartByToken(cart.token) })
}
