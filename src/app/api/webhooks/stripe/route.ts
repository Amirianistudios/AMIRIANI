import { NextResponse } from 'next/server'
import type Stripe from 'stripe'

import { STRIPE_WEBHOOK_SECRET } from '@/lib/env'
import { stripe } from '@/lib/stripe/client'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stripe webhook.
 *
 * This is the only thing that marks an order paid — the browser returning to
 * the success page proves nothing, since anyone can visit that URL.
 *
 * Every event is verified against the signing secret using the raw request
 * body; an unsigned or tampered payload is rejected before any database work.
 * Handlers are written to be idempotent because Stripe retries, and may deliver
 * the same event more than once.
 */
export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  // Signature verification needs the exact bytes Stripe signed, so read the
  // body as text and never re-serialise it.
  const payload = await request.text()

  let event: Stripe.Event
  try {
    event = stripe().webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET())
  } catch (error) {
    console.error('stripe webhook: signature verification failed', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const orderId = session.metadata?.order_id ?? session.client_reference_id
        if (!orderId) break

        // Only advance an order that has not already been paid, so a repeated
        // delivery cannot re-run the side effects.
        const { data: order } = await supabase
          .from('orders')
          .select('id, payment_status')
          .eq('id', orderId)
          .maybeSingle()

        if (!order || order.payment_status === 'paid') break

        const paid = session.payment_status === 'paid'

        await supabase
          .from('orders')
          .update({
            status: 'open',
            payment_status: paid ? 'paid' : 'authorized',
            paid_at: paid ? new Date().toISOString() : null,
            stripe_payment_intent:
              typeof session.payment_intent === 'string' ? session.payment_intent : null,
          })
          .eq('id', orderId)
          // Guard against a concurrent delivery flipping it first.
          .neq('payment_status', 'paid')
        break
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = event.data.object
        const orderId = session.metadata?.order_id ?? session.client_reference_id
        if (!orderId) break

        const { data: order } = await supabase
          .from('orders')
          .select('id, payment_status')
          .eq('id', orderId)
          .maybeSingle()

        // Never restock an order that was actually paid.
        if (!order || order.payment_status === 'paid') break

        // restock_order is itself idempotent — it no-ops if the order has
        // already been restocked.
        await supabase.rpc('restock_order', { p_order_id: orderId })
        await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            payment_status: 'failed',
            cancelled_at: new Date().toISOString(),
          })
          .eq('id', orderId)
          .neq('payment_status', 'paid')
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object
        const intent =
          typeof charge.payment_intent === 'string' ? charge.payment_intent : null
        if (!intent) break

        const fullyRefunded = charge.amount_refunded >= charge.amount

        await supabase
          .from('orders')
          .update({
            payment_status: fullyRefunded ? 'refunded' : 'partially_refunded',
          })
          .eq('stripe_payment_intent', intent)
        break
      }

      default:
        // Unhandled event types are acknowledged so Stripe stops retrying them.
        break
    }
  } catch (error) {
    // Return 500 so Stripe retries; the handlers above are safe to re-run.
    console.error(`stripe webhook: handler failed for ${event.type}`, error)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
