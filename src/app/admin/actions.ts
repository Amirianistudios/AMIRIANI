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

// ---------------------------------------------------------------------------
// Creating catalogue records
//
// Until these existed the admin could only edit what the Shopify import had
// produced, which meant the store could not actually be run without Shopify —
// no new product could be added, no photograph uploaded, nothing put into a
// collection. Each of these writes through the service-role client after
// assertAdmin(), the same way every other action here does.
// ---------------------------------------------------------------------------

/**
 * Mirrors the database's `slugify()`, so a handle typed in the admin matches
 * one the importer would have produced for the same title. Decomposing to NFD
 * and dropping the combining marks is the JavaScript equivalent of `unaccent`.
 */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

const newProductSchema = z.object({
  title: z.string().trim().min(1).max(300),
  slug: z.string().trim().max(200).optional(),
  descriptionHtml: z.string().max(50_000).optional(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
})

/**
 * Creates a product, and with it one default variant.
 *
 * The variant is not optional: the storefront prices everything from
 * product_variants, so a product without one renders with no price and cannot
 * be added to a cart. Creating the pair together avoids leaving that trap for
 * whoever adds the next product.
 */
export async function createProduct(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const parsed = newProductSchema.safeParse({
    title: formData.get('title'),
    slug: formData.get('slug') || undefined,
    descriptionHtml: formData.get('descriptionHtml') ?? undefined,
    status: formData.get('status') || 'draft',
  })
  if (!parsed.success) return { ok: false, error: 'Please check the values.' }

  const supabase = createSupabaseAdminClient()

  const slug = (parsed.data.slug?.trim() || slugify(parsed.data.title)).slice(0, 200)
  if (!slug) return { ok: false, error: 'Could not derive a URL handle from that title.' }

  const { data: product, error } = await supabase
    .from('products')
    .insert({
      slug,
      title: parsed.data.title,
      description_html: parsed.data.descriptionHtml || null,
      status: parsed.data.status,
    })
    .select('id, slug')
    .single()

  if (error) {
    return {
      ok: false,
      error: error.code === '23505' ? `The handle "${slug}" is already taken.` : error.message,
    }
  }

  const { error: variantError } = await supabase.from('product_variants').insert({
    product_id: product.id,
    title: 'Default',
    price_cents: 0,
    inventory_quantity: 0,
    position: 1,
  })

  if (variantError) return { ok: false, error: variantError.message }

  revalidatePath('/admin/products')
  return { ok: true }
}

const newVariantSchema = z.object({
  productId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  sku: z.string().trim().max(100).optional(),
  priceCents: z.coerce.number().int().min(0).max(100_000_000),
  quantity: z.coerce.number().int().min(0).max(1_000_000).default(0),
})

export async function createVariant(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const parsed = newVariantSchema.safeParse({
    productId: formData.get('productId'),
    title: formData.get('title'),
    sku: formData.get('sku') || undefined,
    priceCents: formData.get('priceCents'),
    quantity: formData.get('quantity') || 0,
  })
  if (!parsed.success) return { ok: false, error: 'Please check the values.' }

  const supabase = createSupabaseAdminClient()

  const { data: last } = await supabase
    .from('product_variants')
    .select('position')
    .eq('product_id', parsed.data.productId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: variant, error } = await supabase
    .from('product_variants')
    .insert({
      product_id: parsed.data.productId,
      title: parsed.data.title,
      sku: parsed.data.sku || null,
      price_cents: parsed.data.priceCents,
      position: (last?.position ?? 0) + 1,
      // Opening stock is journalled below rather than written here, so the
      // movement history explains where every unit came from.
      inventory_quantity: 0,
    })
    .select('id')
    .single()

  if (error) {
    return {
      ok: false,
      error: error.code === '23505' ? 'That SKU is already in use.' : error.message,
    }
  }

  if (parsed.data.quantity > 0) {
    const { error: stockError } = await supabase.rpc('adjust_inventory', {
      p_variant_id: variant.id,
      p_delta: parsed.data.quantity,
      p_reason: 'correction',
      p_note: 'opening stock',
    })
    if (stockError) return { ok: false, error: stockError.message }
  }

  const { data: product } = await supabase
    .from('products')
    .select('slug')
    .eq('id', parsed.data.productId)
    .maybeSingle()

  if (product) revalidatePath(`/products/${product.slug}`)
  revalidatePath(`/admin/products/${parsed.data.productId}`)
  return { ok: true }
}

/** What the storage buckets accept, mirrored from the migration. */
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
const MAX_IMAGE_BYTES = 20 * 1024 * 1024

export async function uploadProductImage(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const productId = String(formData.get('productId') ?? '')
  const file = formData.get('file')
  const alt = String(formData.get('alt') ?? '').trim()

  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { ok: false, error: 'Unknown product.' }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Choose a file.' }

  // Checked here as well as by the bucket: the bucket's rejection surfaces as
  // an opaque storage error, and an admin deserves to know which rule they hit.
  if (!IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: `${file.type || 'That file'} is not an accepted image type.` }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'That image is larger than 20 MB.' }
  }

  const supabase = createSupabaseAdminClient()

  const { data: product } = await supabase
    .from('products')
    .select('id, slug')
    .eq('id', productId)
    .maybeSingle()
  if (!product) return { ok: false, error: 'Product not found.' }

  const { data: existing } = await supabase
    .from('product_images')
    .select('position')
    .eq('product_id', productId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (existing?.position ?? 0) + 1
  const extension = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${productId}/${String(position).padStart(2, '0')}-${Date.now()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('product-media')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) return { ok: false, error: uploadError.message }

  const { error } = await supabase.from('product_images').insert({
    product_id: productId,
    storage_path: path,
    alt: alt || null,
    position,
    // The first image a product gets is the one the grid shows.
    is_primary: existing === null,
  })

  if (error) {
    // Do not leave an orphan in the bucket if the row could not be written.
    await supabase.storage.from('product-media').remove([path])
    return { ok: false, error: error.message }
  }

  revalidatePath(`/products/${product.slug}`)
  revalidatePath(`/admin/products/${productId}`)
  revalidatePath('/collections/all')
  revalidatePath('/')
  return { ok: true }
}

/**
 * Replaces a product's collection membership with exactly the boxes ticked.
 *
 * Sent as repeated `collectionId` fields, so unticking the last one clears the
 * product out of every collection — which a "add these" action could not do.
 */
export async function setProductCollections(formData: FormData): Promise<ActionResult> {
  await assertAdmin()

  const productId = String(formData.get('productId') ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(productId)) return { ok: false, error: 'Unknown product.' }

  const wanted = formData
    .getAll('collectionId')
    .map(String)
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))

  const supabase = createSupabaseAdminClient()

  const { data: product } = await supabase
    .from('products')
    .select('slug')
    .eq('id', productId)
    .maybeSingle()
  if (!product) return { ok: false, error: 'Product not found.' }

  const { data: current } = await supabase
    .from('collection_products')
    .select('collection_id')
    .eq('product_id', productId)

  const held = new Set((current ?? []).map((row) => row.collection_id))
  const target = new Set(wanted)

  const toRemove = [...held].filter((id) => !target.has(id))
  const toAdd = [...target].filter((id) => !held.has(id))

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('collection_products')
      .delete()
      .eq('product_id', productId)
      .in('collection_id', toRemove)
    if (error) return { ok: false, error: error.message }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('collection_products')
      .insert(toAdd.map((collectionId) => ({ product_id: productId, collection_id: collectionId })))
    if (error) return { ok: false, error: error.message }
  }

  const { data: collections } = await supabase
    .from('collections')
    .select('slug')
    .in('id', [...toRemove, ...toAdd])

  for (const collection of collections ?? []) revalidatePath(`/collections/${collection.slug}`)
  revalidatePath(`/products/${product.slug}`)
  revalidatePath(`/admin/products/${productId}`)
  revalidatePath('/collections/all')
  return { ok: true }
}
