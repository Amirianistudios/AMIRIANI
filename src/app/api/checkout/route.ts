import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import { getCart } from '@/lib/cart/server'
import { rateLimit } from '@/lib/rate-limit'
import { stripe } from '@/lib/stripe/client'
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server'
import { FREE_SHIPPING_THRESHOLD_CENTS, SITE_URL } from '@/lib/env'
import { resolveShippingRate, shipsTo } from '@/lib/shipping'
import type { Address, OrderRow } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const addressSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  company: z.string().trim().max(100).optional().nullable(),
  address1: z.string().trim().min(1).max(200),
  address2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).optional().nullable(),
  postcode: z.string().trim().min(1).max(20),
  country_code: z.string().trim().length(2).toUpperCase(),
  phone: z.string().trim().max(40).optional().nullable(),
})

const checkoutSchema = z.object({
  email: z.string().trim().email().max(200),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional().nullable(),
  discountCode: z.string().trim().max(60).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
  /*
   * A rate *code*, never a price. The server looks the amount up in the
   * shipping table for this destination and subtotal, so a browser cannot
   * select a rate the cart has not earned or invent a cheaper one.
   */
  shippingRateCode: z.string().trim().max(40).optional().nullable(),
})

/**
 * Creates an order and a Stripe Checkout session.
 *
 * The browser sends only an email, an address and an optional discount code.
 * Everything that determines what is charged — line prices, the discount, the
 * shipping rate and the total — is computed on the server from the database.
 * A price posted by a client is never read.
 *
 * `create_order_from_cart` does the work in a single transaction: it re-reads
 * prices, validates and decrements stock under row locks, writes immutable line
 * snapshots and closes the cart. If anything is short of stock the whole thing
 * rolls back and no Stripe session is created.
 */
export async function POST(request: Request) {
  const limited = await rateLimit(request, 'checkout', { limit: 10, windowMs: 60_000 })
  if (limited) return limited

  const parsed = checkoutSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check the details you entered.', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { email, shippingAddress, billingAddress, discountCode, note, shippingRateCode } =
    parsed.data

  const cart = await getCart()
  if (!cart.id || cart.lines.length === 0) {
    return NextResponse.json({ error: 'Your cart is empty.' }, { status: 400 })
  }

  // Re-check availability before taking payment, for a clearer error than the
  // database exception would give.
  const short = cart.lines.find((line) => !line.available)
  if (short) {
    return NextResponse.json(
      {
        error: `"${short.productTitle}" (${short.variantTitle}) is no longer available in that quantity.`,
      },
      { status: 409 },
    )
  }

  // Shipping is a server-side rule, never a client input.
  if (!shipsTo(shippingAddress.country_code)) {
    return NextResponse.json(
      { error: 'We do not currently ship to that country.' },
      { status: 400 },
    )
  }

  const shippingRate = resolveShippingRate(
    shippingAddress.country_code,
    cart.subtotalCents,
    shippingRateCode,
    FREE_SHIPPING_THRESHOLD_CENTS(),
  )

  if (!shippingRate) {
    return NextResponse.json(
      { error: 'That delivery option is not available for your order.' },
      { status: 400 },
    )
  }

  const shippingCents = shippingRate.priceCents

  // Link the order to the signed-in customer, when there is one.
  let customerId: string | null = null
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      customerId = customer?.id ?? null
    }
  } catch {
    // Guest checkout is fine; carry on without a customer link.
  }

  const admin = createSupabaseAdminClient()
  const idempotencyKey = randomUUID()

  const { data: order, error } = await admin.rpc('create_order_from_cart', {
    p_cart_id: cart.id,
    p_email: email,
    p_shipping_address: shippingAddress as Address,
    p_billing_address: (billingAddress ?? null) as Address | null,
    p_shipping_cents: shippingCents,
    p_idempotency_key: idempotencyKey,
    p_customer_id: customerId,
    p_discount_code: discountCode ?? null,
    p_phone: shippingAddress.phone ?? null,
    p_note: note ?? null,
  })

  if (error || !order) {
    const message = error?.message ?? ''
    if (message.includes('insufficient_inventory')) {
      return NextResponse.json(
        { error: 'One of your items just sold out. Please review your cart.' },
        { status: 409 },
      )
    }
    if (message.includes('cart_empty') || message.includes('cart_unavailable')) {
      return NextResponse.json({ error: 'Your cart is no longer available.' }, { status: 409 })
    }
    console.error('checkout: order creation failed', error)
    return NextResponse.json({ error: 'Could not start checkout.' }, { status: 500 })
  }

  const created = order as unknown as OrderRow

  // Build Stripe line items from the order the database just wrote, so what is
  // charged always equals what was recorded.
  const { data: items } = await admin
    .from('order_items')
    .select('product_title, variant_title, unit_price_cents, quantity, image_url')
    .eq('order_id', created.id)

  const lineItems = (items ?? []).map((item) => ({
    quantity: item.quantity,
    price_data: {
      currency: created.currency.toLowerCase(),
      unit_amount: item.unit_price_cents,
      product_data: {
        name: `${item.product_title} — ${item.variant_title}`,
        images: item.image_url?.startsWith('https://') ? [item.image_url] : undefined,
      },
    },
  }))

  // Stripe Checkout has no negative line item, so any discount is expressed as
  // a one-off coupon in the session below, keeping the session total equal to
  // the order total.
  try {
    const session = await stripe().checkout.sessions.create(
      {
        mode: 'payment',
        line_items: lineItems,
        customer_email: email,
        client_reference_id: created.id,
        metadata: { order_id: created.id, order_number: created.order_number },
        success_url: `${SITE_URL()}/checkout/success?order=${created.order_number}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${SITE_URL()}/cart`,
        // Shipping and discounts are already priced into the order; express
        // them to Stripe so the customer sees the same breakdown.
        shipping_options:
          created.shipping_cents > 0
            ? [
                {
                  shipping_rate_data: {
                    type: 'fixed_amount',
                    display_name: shippingRate.label,
                    fixed_amount: {
                      amount: created.shipping_cents,
                      currency: created.currency.toLowerCase(),
                    },
                  },
                },
              ]
            : undefined,
        discounts:
          created.discount_cents > 0
            ? [
                {
                  coupon: (
                    await stripe().coupons.create({
                      amount_off: created.discount_cents,
                      currency: created.currency.toLowerCase(),
                      duration: 'once',
                      name: created.discount_code ?? 'Discount',
                    })
                  ).id,
                },
              ]
            : undefined,
      },
      // Stripe-side idempotency, so a retried request reuses the same session
      // rather than creating a second one for the same order.
      { idempotencyKey: `checkout_${created.id}` },
    )

    await admin
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', created.id)

    return NextResponse.json({ url: session.url, orderNumber: created.order_number })
  } catch (stripeError) {
    console.error('checkout: stripe session failed', stripeError)

    // The order exists but cannot be paid; release the stock we reserved so the
    // items do not sit unavailable.
    await admin.rpc('restock_order', { p_order_id: created.id })
    await admin
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: 'failed',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', created.id)

    return NextResponse.json(
      { error: 'Payment could not be started. Please try again.' },
      { status: 502 },
    )
  }
}
