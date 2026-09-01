/**
 * Stripe webhook verification.
 *
 * Posts constructed events at the running application and checks the things
 * that actually matter for money:
 *
 *   - an unsigned or wrongly-signed event is rejected before any database work
 *   - a stale timestamp is rejected (replay protection)
 *   - a valid `checkout.session.completed` marks the order paid
 *   - delivering the same event twice does not double-apply anything
 *   - an expired session restocks and cancels, and never touches a paid order
 *
 * Signatures are generated locally with the same secret the app verifies
 * against, so this exercises the real verification path in stripe-node rather
 * than a stub.
 *
 *   node scripts/verify-stripe-webhook.mjs
 *
 * Environment:
 *   APP_URL                default http://127.0.0.1:3000
 *   STRIPE_WEBHOOK_SECRET  must match the running app's secret
 *   DATABASE_URL           Postgres, for asserting the resulting state
 */

import { createHmac } from 'node:crypto'
import { Client } from 'pg'

const APP = process.env.APP_URL ?? 'http://127.0.0.1:3000'
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_localtestsecret'
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5433/amiriani_dev'

const db = new Client({ connectionString: DATABASE_URL })
await db.connect()

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures += 1
}

/** Builds the `Stripe-Signature` header exactly as Stripe does. */
function sign(payload, secret, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex')
  return `t=${timestamp},v1=${signature}`
}

async function post(event, { secret = SECRET, timestamp, header } = {}) {
  const payload = JSON.stringify(event)
  const res = await fetch(`${APP}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(header === null ? {} : { 'Stripe-Signature': header ?? sign(payload, secret, timestamp) }),
    },
    body: payload,
  })
  return { status: res.status, body: await res.text() }
}

function sessionEvent(id, orderId, orderNumber, type = 'checkout.session.completed') {
  return {
    id,
    object: 'event',
    type,
    api_version: '2026-08-26.dahlia',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_test_${orderId.slice(0, 8)}`,
        object: 'checkout.session',
        payment_status: type === 'checkout.session.completed' ? 'paid' : 'unpaid',
        payment_intent: `pi_test_${orderId.slice(0, 8)}`,
        client_reference_id: orderId,
        metadata: { order_id: orderId, order_number: orderNumber },
      },
    },
  }
}

/** Creates a real order through the database function, as checkout would. */
async function createOrder(email, key) {
  const { rows } = await db.query(
    `with c as (insert into carts default values returning id),
          i as (insert into cart_items (cart_id, variant_id, quantity)
                select c.id, v.id, 1 from c, product_variants v
                where v.sku = $1 returning cart_id)
     select id from c`,
    ['WEBHOOK-1'],
  )
  const cartId = rows[0].id

  const order = await db.query(
    `select * from create_order_from_cart($1::uuid, $2, $3::jsonb, null, 856, $4)`,
    [
      cartId,
      email,
      '{"address1":"1 A","city":"B","postcode":"1000","country_code":"BE"}',
      key,
    ],
  )
  return order.rows[0]
}

async function stockOf(sku) {
  const { rows } = await db.query(
    'select inventory_quantity from product_variants where sku = $1',
    [sku],
  )
  return rows[0]?.inventory_quantity ?? null
}

async function orderState(id) {
  const { rows } = await db.query(
    'select status, payment_status, paid_at, stripe_payment_intent from orders where id = $1',
    [id],
  )
  return rows[0]
}

async function main() {
  // ---------------------------------------------------------------- fixture
  await db.query(`
    delete from carts c where exists (
      select 1 from cart_items ci join product_variants v on v.id = ci.variant_id
      join products p on p.id = v.product_id
      where ci.cart_id = c.id and p.slug = 'webhook-fixture');
    delete from orders where email like 'webhook-%@example.com';
    delete from products where slug = 'webhook-fixture';
  `)
  await db.query(`
    with p as (
      insert into products (slug, title, status, currency)
      values ('webhook-fixture', 'Webhook Fixture', 'active', 'EUR') returning id)
    insert into product_variants (product_id, title, sku, price_cents, inventory_quantity)
    select id, 'ONE', 'WEBHOOK-1', 1000, 50 from p;
  `)

  console.log('\n== signature verification ==')

  const throwaway = await createOrder('webhook-sig@example.com', 'wh-sig')
  const event = sessionEvent('evt_sig', throwaway.id, throwaway.order_number)

  let r = await post(event, { header: null })
  check('missing signature is rejected', r.status === 400, `status ${r.status}`)

  r = await post(event, { secret: 'whsec_the_wrong_secret' })
  check('wrong signing secret is rejected', r.status === 400, `status ${r.status}`)

  r = await post(event, { header: 't=1,v1=deadbeef' })
  check('malformed signature is rejected', r.status === 400, `status ${r.status}`)

  // Stripe's tolerance is 5 minutes; an hour-old timestamp must fail.
  r = await post(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 })
  check('stale timestamp is rejected (replay)', r.status === 400, `status ${r.status}`)

  check(
    'no unsigned event changed the order',
    (await orderState(throwaway.id)).payment_status === 'unpaid',
  )

  console.log('\n== payment success ==')

  const paid = await createOrder('webhook-paid@example.com', 'wh-paid')
  const stockAfterOrder = await stockOf('WEBHOOK-1')

  r = await post(sessionEvent('evt_paid', paid.id, paid.order_number))
  check('valid event accepted', r.status === 200, `status ${r.status}`)

  let state = await orderState(paid.id)
  check('order marked paid', state.payment_status === 'paid', state.payment_status)
  check('order opened', state.status === 'open', state.status)
  check('paid_at set', state.paid_at !== null)
  check('payment intent recorded', Boolean(state.stripe_payment_intent))

  console.log('\n== duplicate delivery ==')

  r = await post(sessionEvent('evt_paid', paid.id, paid.order_number))
  check('duplicate accepted (Stripe expects 2xx)', r.status === 200, `status ${r.status}`)

  state = await orderState(paid.id)
  check('still exactly paid', state.payment_status === 'paid')
  check(
    'duplicate did not move stock',
    (await stockOf('WEBHOOK-1')) === stockAfterOrder,
    `stock ${await stockOf('WEBHOOK-1')}, expected ${stockAfterOrder}`,
  )

  console.log('\n== expired session restocks ==')

  const expired = await createOrder('webhook-expired@example.com', 'wh-expired')
  const beforeRestock = await stockOf('WEBHOOK-1')

  r = await post(
    sessionEvent('evt_exp', expired.id, expired.order_number, 'checkout.session.expired'),
  )
  check('expiry accepted', r.status === 200, `status ${r.status}`)

  state = await orderState(expired.id)
  check('order cancelled', state.status === 'cancelled', state.status)
  check('payment marked failed', state.payment_status === 'failed', state.payment_status)
  check(
    'stock returned',
    (await stockOf('WEBHOOK-1')) === beforeRestock + 1,
    `stock ${await stockOf('WEBHOOK-1')}, expected ${beforeRestock + 1}`,
  )

  // Repeating it must not restock twice.
  r = await post(
    sessionEvent('evt_exp', expired.id, expired.order_number, 'checkout.session.expired'),
  )
  check(
    'repeated expiry does not restock again',
    (await stockOf('WEBHOOK-1')) === beforeRestock + 1,
    `stock ${await stockOf('WEBHOOK-1')}`,
  )

  console.log('\n== a paid order is never restocked ==')

  const paidStock = await stockOf('WEBHOOK-1')
  await post(sessionEvent('evt_exp2', paid.id, paid.order_number, 'checkout.session.expired'))
  const after = await orderState(paid.id)
  check('paid order still paid', after.payment_status === 'paid', after.payment_status)
  check(
    'paid order stock untouched',
    (await stockOf('WEBHOOK-1')) === paidStock,
    `stock ${await stockOf('WEBHOOK-1')}, expected ${paidStock}`,
  )

  console.log('\n== refund ==')

  r = await post({
    id: 'evt_refund',
    object: 'event',
    type: 'charge.refunded',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: 'ch_test_1',
        object: 'charge',
        payment_intent: (await orderState(paid.id)).stripe_payment_intent,
        amount: paid.total_cents,
        amount_refunded: paid.total_cents,
      },
    },
  })
  check('refund accepted', r.status === 200, `status ${r.status}`)
  check(
    'order marked refunded',
    (await orderState(paid.id)).payment_status === 'refunded',
    (await orderState(paid.id)).payment_status,
  )

  // ---------------------------------------------------------------- cleanup
  await db.query(`
    delete from orders where email like 'webhook-%@example.com';
    delete from carts c where exists (
      select 1 from cart_items ci join product_variants v on v.id = ci.variant_id
      join products p on p.id = v.product_id
      where ci.cart_id = c.id and p.slug = 'webhook-fixture');
    delete from products where slug = 'webhook-fixture';
  `)

  console.log(
    `\n${failures === 0 ? '==> OK: webhook verification, idempotency and restock all correct' : `==> FAILED: ${failures} check(s)`}`,
  )
  await db.end()
  if (failures > 0) process.exit(1)
}

main().catch(async (error) => {
  console.error(error)
  await db.end().catch(() => {})
  process.exit(1)
})
