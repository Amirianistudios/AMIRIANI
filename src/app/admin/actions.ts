'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { isAdmin } from '@/lib/auth'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

/**
 * Admin server actions.
 *
 * Every action re-checks `isAdmin()` before touching anything. Server Actions
 * are reachable as POST endpoints by anyone who can guess the action id, so the
 * layout's guard is not sufficient on its own — the check has to be here too.
 */
async function assertAdmin() {
  if (!(await isAdmin())) {
    throw new Error('Not authorised')
  }
}

export type ActionResult = { ok: true } | { ok: false; error: string }

const orderUpdateSchema = z.object({
  orderId: z.string().uuid(),
  fulfilmentStatus: z.enum([
    'unfulfilled',
    'partially_fulfilled',
    'fulfilled',
    'delivered',
    'cancelled',
  ]),
  status: z.enum(['pending', 'open', 'cancelled', 'archived']),
})

export async function updateOrderStatus(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const parsed = orderUpdateSchema.safeParse({
    orderId: formData.get('orderId'),
    fulfilmentStatus: formData.get('fulfilmentStatus'),
    status: formData.get('status'),
  })
  if (!parsed.success) return { ok: false, error: 'Invalid values.' }

  const supabase = createSupabaseAdminClient()
  const { orderId, fulfilmentStatus, status } = parsed.data

  const { data: current } = await supabase
    .from('orders')
    .select('status, payment_status')
    .eq('id', orderId)
    .maybeSingle()

  if (!current) return { ok: false, error: 'Order not found.' }

  const { error } = await supabase
    .from('orders')
    .update({
      fulfilment_status: fulfilmentStatus,
      status,
      cancelled_at: status === 'cancelled' ? new Date().toISOString() : null,
    })
    .eq('id', orderId)

  if (error) return { ok: false, error: error.message }

  // Cancelling releases the stock the order was holding. restock_order is
  // idempotent, so cancelling twice cannot inflate inventory.
  if (status === 'cancelled' && current.status !== 'cancelled') {
    await supabase.rpc('restock_order', { p_order_id: orderId })
  }

  revalidatePath(`/admin/orders/${orderId}`)
  revalidatePath('/admin/orders')
  return { ok: true }
}

const inventorySchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.coerce.number().int().min(0).max(1_000_000),
})

export async function setInventory(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const parsed = inventorySchema.safeParse({
    variantId: formData.get('variantId'),
    quantity: formData.get('quantity'),
  })
  if (!parsed.success) return { ok: false, error: 'Invalid quantity.' }

  const supabase = createSupabaseAdminClient()
  const { data: variant } = await supabase
    .from('product_variants')
    .select('inventory_quantity, product_id')
    .eq('id', parsed.data.variantId)
    .maybeSingle()

  if (!variant) return { ok: false, error: 'Variant not found.' }

  const delta = parsed.data.quantity - variant.inventory_quantity
  if (delta === 0) return { ok: true }

  // Route the change through adjust_inventory so it is journalled rather than
  // silently overwriting the count.
  const { error } = await supabase.rpc('adjust_inventory', {
    p_variant_id: parsed.data.variantId,
    p_delta: delta,
    p_reason: 'correction',
    p_note: 'set from admin',
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/products')
  revalidatePath('/admin')
  return { ok: true }
}

const productSchema = z.object({
  productId: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  status: z.enum(['draft', 'active', 'archived']),
  descriptionHtml: z.string().max(50_000).optional(),
  seoTitle: z.string().trim().max(300).optional(),
  seoDescription: z.string().trim().max(500).optional(),
  featured: z.coerce.boolean().optional(),
})

export async function updateProduct(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const parsed = productSchema.safeParse({
    productId: formData.get('productId'),
    title: formData.get('title'),
    status: formData.get('status'),
    descriptionHtml: formData.get('descriptionHtml') ?? undefined,
    seoTitle: formData.get('seoTitle') ?? undefined,
    seoDescription: formData.get('seoDescription') ?? undefined,
    featured: formData.get('featured') === 'on',
  })
  if (!parsed.success) return { ok: false, error: 'Please check the values.' }

  const supabase = createSupabaseAdminClient()
  const { productId, ...fields } = parsed.data

  const { data: product, error } = await supabase
    .from('products')
    .update({
      title: fields.title,
      status: fields.status,
      description_html: fields.descriptionHtml || null,
      seo_title: fields.seoTitle || null,
      seo_description: fields.seoDescription || null,
      featured: Boolean(fields.featured),
    })
    .eq('id', productId)
    .select('slug')
    .single()

  if (error) return { ok: false, error: error.message }

  // Refresh the cached storefront pages this product appears on.
  revalidatePath(`/products/${product.slug}`)
  revalidatePath('/collections/all')
  revalidatePath('/')
  revalidatePath(`/admin/products/${productId}`)
  return { ok: true }
}

const variantPriceSchema = z.object({
  variantId: z.string().uuid(),
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
  compareAtCents: z.coerce.number().int().min(0).max(100_000_000).optional(),
})

export async function updateVariantPrice(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const raw = formData.get('compareAtCents')
  const parsed = variantPriceSchema.safeParse({
    variantId: formData.get('variantId'),
    priceCents: formData.get('priceCents'),
    compareAtCents: raw === null || raw === '' ? undefined : raw,
  })
  if (!parsed.success) return { ok: false, error: 'Invalid price.' }

  const { variantId, priceCents, compareAtCents } = parsed.data

  if (compareAtCents !== undefined && compareAtCents < priceCents) {
    return {
      ok: false,
      error: 'The compare-at price must be at least the selling price.',
    }
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('product_variants')
    .update({
      price_cents: priceCents,
      compare_at_cents: compareAtCents ?? null,
    })
    .eq('id', variantId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/products')
  revalidatePath('/collections/all')
  revalidatePath('/')
  return { ok: true }
}

const discountSchema = z.object({
  code: z.string().trim().min(2).max(60),
  kind: z.enum(['percentage', 'fixed_amount', 'free_shipping']),
  value: z.coerce.number().min(0).max(1_000_000),
  minimumSubtotalCents: z.coerce.number().int().min(0).default(0),
  usageLimit: z.coerce.number().int().min(1).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
})

export async function createDiscount(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const endsAtRaw = String(formData.get('endsAt') ?? '')
  const usageLimitRaw = String(formData.get('usageLimit') ?? '')

  const parsed = discountSchema.safeParse({
    code: formData.get('code'),
    kind: formData.get('kind'),
    value: formData.get('value'),
    minimumSubtotalCents: formData.get('minimumSubtotalCents') || 0,
    usageLimit: usageLimitRaw === '' ? undefined : usageLimitRaw,
    startsAt: String(formData.get('startsAt') ?? '') || undefined,
    endsAt: endsAtRaw || undefined,
  })
  if (!parsed.success) return { ok: false, error: 'Please check the discount details.' }

  const d = parsed.data
  if (d.kind === 'percentage' && (d.value <= 0 || d.value > 100)) {
    return { ok: false, error: 'A percentage discount must be between 1 and 100.' }
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from('discount_codes').insert({
    code: d.code,
    kind: d.kind,
    value: d.value,
    minimum_subtotal_cents: d.minimumSubtotalCents,
    usage_limit: d.usageLimit ?? null,
    starts_at: d.startsAt ? new Date(d.startsAt).toISOString() : new Date().toISOString(),
    ends_at: d.endsAt ? new Date(d.endsAt).toISOString() : null,
    active: true,
  })

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'That code already exists.' }
    return { ok: false, error: error.message }
  }

  revalidatePath('/admin/discounts')
  return { ok: true }
}

export async function toggleDiscount(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const id = z.string().uuid().safeParse(formData.get('id'))
  if (!id.success) return { ok: false, error: 'Invalid discount.' }

  const supabase = createSupabaseAdminClient()
  const { data: existing } = await supabase
    .from('discount_codes')
    .select('active')
    .eq('id', id.data)
    .maybeSingle()

  if (!existing) return { ok: false, error: 'Discount not found.' }

  const { error } = await supabase
    .from('discount_codes')
    .update({ active: !existing.active })
    .eq('id', id.data)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/discounts')
  return { ok: true }
}

const contentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(300),
  bodyHtml: z.string().max(200_000).optional(),
  published: z.coerce.boolean().optional(),
})

export async function updateContentPage(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const parsed = contentSchema.safeParse({
    id: formData.get('id'),
    title: formData.get('title'),
    bodyHtml: formData.get('bodyHtml') ?? undefined,
    published: formData.get('published') === 'on',
  })
  if (!parsed.success) return { ok: false, error: 'Please check the values.' }

  const supabase = createSupabaseAdminClient()
  const { data: page, error } = await supabase
    .from('content_pages')
    .update({
      title: parsed.data.title,
      body_html: parsed.data.bodyHtml ?? null,
      published: Boolean(parsed.data.published),
    })
    .eq('id', parsed.data.id)
    .select('slug, kind')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath(page.kind === 'policy' ? `/policies/${page.slug}` : `/${page.slug}`)
  revalidatePath('/admin/content')
  return { ok: true }
}

const homepageSchema = z.object({
  bannerHeading: z.string().trim().max(300),
  bannerCtaLabel: z.string().trim().max(100),
  bannerCtaHref: z.string().trim().max(300),
  featuredTitle: z.string().trim().max(200),
  featuredDescription: z.string().trim().max(500),
})

/** Edits the homepage copy without a deploy. */
export async function updateHomepage(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const parsed = homepageSchema.safeParse({
    bannerHeading: formData.get('bannerHeading'),
    bannerCtaLabel: formData.get('bannerCtaLabel'),
    bannerCtaHref: formData.get('bannerCtaHref'),
    featuredTitle: formData.get('featuredTitle'),
    featuredDescription: formData.get('featuredDescription'),
  })
  if (!parsed.success) return { ok: false, error: 'Please check the values.' }

  // Only same-site paths, so the hero cannot be pointed at an external site.
  if (!parsed.data.bannerCtaHref.startsWith('/')) {
    return { ok: false, error: 'The button link must be a path beginning with "/".' }
  }

  const supabase = createSupabaseAdminClient()

  const { data: sections } = await supabase
    .from('homepage_sections')
    .select('id, kind, settings')

  for (const section of sections ?? []) {
    const settings = section.settings as Record<string, unknown>

    if (section.kind === 'image_banner') {
      await supabase
        .from('homepage_sections')
        .update({
          settings: {
            ...settings,
            heading: parsed.data.bannerHeading,
            cta_label: parsed.data.bannerCtaLabel,
            cta_href: parsed.data.bannerCtaHref,
          },
        })
        .eq('id', section.id)
    }

    if (section.kind === 'featured_collection') {
      await supabase
        .from('homepage_sections')
        .update({
          settings: {
            ...settings,
            title: parsed.data.featuredTitle,
            description: parsed.data.featuredDescription,
          },
        })
        .eq('id', section.id)
    }
  }

  revalidatePath('/')
  revalidatePath('/admin/content')
  return { ok: true }
}
