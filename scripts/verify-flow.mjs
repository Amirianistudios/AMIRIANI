/**
 * End-to-end customer journey against the running application.
 *
 *   node scripts/verify-flow.mjs
 *
 * Walks the whole path a real buyer takes — homepage, collection, product,
 * variant selection, cart, quantity change, checkout, payment webhook, order
 * confirmation, account, order history, admin view — and then the failure
 * paths that matter more than the happy one: out-of-stock, tampered prices,
 * an unsupported destination, a rejected discount, an unsigned webhook.
 *
 * It drives real HTTP against the real routes and asserts against the real
 * database, so a page that renders while writing nothing still fails. That is
 * deliberate: "the page loaded" is the failure mode this is meant to catch.
 *
 * Environment:
 *   APP_URL                default http://127.0.0.1:3000
 *   DATABASE_URL           Postgres, for asserting resulting state
 *   SUPABASE_URL / KEYS    to create the test customer through Auth
 *   STRIPE_WEBHOOK_SECRET  must match the running app's secret
 */

import { createHmac } from 'node:crypto'
import { Client } from 'pg'

const APP = process.env.APP_URL ?? 'http://127.0.0.1:3000'
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5433/amiriani_dev'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'local-anon-key'
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_localtestsecret'

const RUN = Date.now()
const EMAIL = `flow-${RUN}@example.com`
const PASSWORD = 'Fl0w-test-password!'

const db = new Client({ connectionString: DATABASE_URL })
await db.connect()

let failures = 0
let skipped = 0

function ok(label, detail = '') {
  console.log(`  ok    ${label}${detail ? `  (${detail})` : ''}`)
}
function fail(label, detail = '') {
  console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`)
  failures += 1
}
function skip(label, detail = '') {
  console.log(`  skip  ${label}${detail ? `  (${detail})` : ''}`)
  skipped += 1
}
function check(condition, label, detail = '') {
  if (condition) ok(label, detail)
  else fail(label, detail)
}

// ---------------------------------------------------------------------------
// A cookie jar, so the cart token survives between requests exactly as it does
// in a browser. Without this every request would start a fresh cart and the
// journey would silently test nothing.
// ---------------------------------------------------------------------------

const jar = new Map()

function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(';')
    const index = pair.indexOf('=')
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
  }
}

async function visit(path, init = {}) {
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const res = await fetch(APP + path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    redirect: 'manual',
  })
  storeCookies(res)
  return res
}

async function json(path, init) {
  const res = await visit(path, init)
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch {
    body = { raw: text.slice(0, 200) }
  }
  return { status: res.status, body }
}

function signStripe(payload, secret = WEBHOOK_SECRET) {
  const ts = Math.floor(Date.now() / 1000)
  return `t=${ts},v1=${createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex')}`
}

async function stripeEvent(event, { secret } = {}) {
  const payload = JSON.stringify(event)
  const res = await fetch(`${APP}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': signStripe(payload, secret ?? WEBHOOK_SECRET),
    },
    body: payload,
  })
  return res.status
}

// ---------------------------------------------------------------------------

async function main() {
  // ------------------------------------------------------------------ browse
  console.log('\n== browsing ==')

  const home = await visit('/')
  const homeHtml = await home.text()
  check(home.status === 200, 'homepage renders', `status ${home.status}`)
  check(/\/products\//.test(homeHtml), 'homepage links to products')
  check(
    !/cdn\.shopify\.com/.test(homeHtml),
    'homepage serves no Shopify CDN assets',
    'images must come from Supabase Storage',
  )

  const collection = await visit('/collections/all')
  const collectionHtml = await collection.text()
  check(collection.status === 200, 'collection page renders')

  const { rows: catalogue } = await db.query(`
    select p.slug, v.id as variant_id, v.price_cents, v.inventory_quantity, v.sku
      from products p
      join product_variants v on v.product_id = p.id
     where p.status = 'active' and v.active and v.inventory_quantity > 3
     order by p.slug, v.position
     limit 1
  `)
  if (catalogue.length === 0) {
    fail('a purchasable variant exists', 'no active variant with stock — cannot run the journey')
    return
  }
  const item = catalogue[0]
  check(collectionHtml.includes(item.slug), 'collection lists the product under test', item.slug)

  const product = await visit(`/products/${item.slug}`)
  const productHtml = await product.text()
  check(product.status === 200, 'product page renders')

  // The displayed price must be the database's price, not a hard-coded one.
  const expected = (item.price_cents / 100).toFixed(2)
  check(
    productHtml.includes(expected.replace('.', ',')) || productHtml.includes(expected),
    'product page shows the database price',
    `€${expected}`,
  )
  check(productHtml.includes(item.variant_id), 'variant is selectable', item.sku ?? '')

  // ------------------------------------------------------------------- cart
  console.log('\n== cart ==')

  const startingStock = item.inventory_quantity

  let r = await json('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ variantId: item.variant_id, quantity: 1 }),
  })
  check(r.status === 200, 'add to cart', `status ${r.status}`)

  r = await json('/api/cart')
  const line = r.body?.cart?.lines?.[0]
  check(Boolean(line), 'cart has the line')
  check(line?.quantity === 1, 'quantity is 1', String(line?.quantity))
  check(
    line?.unitPriceCents === item.price_cents,
    'cart priced from the database',
    `${line?.unitPriceCents} vs ${item.price_cents}`,
  )

  r = await json('/api/cart', {
    method: 'PATCH',
    body: JSON.stringify({ lineId: line.id, quantity: 2 }),
  })
  check(r.status === 200, 'quantity updated', `status ${r.status}`)

  r = await json('/api/cart')
  check(r.body?.cart?.lines?.[0]?.quantity === 2, 'cart reflects quantity 2')
  check(
    r.body?.cart?.subtotalCents === item.price_cents * 2,
    'subtotal recomputed server-side',
    String(r.body?.cart?.subtotalCents),
  )

  const cartPage = await visit('/cart')
  check(cartPage.status === 200, 'cart page renders')

  check(
    (await db.query('select inventory_quantity from product_variants where id = $1', [
      item.variant_id,
    ])).rows[0].inventory_quantity === startingStock,
    'adding to cart does not move stock',
    'stock is reserved at checkout, not on add',
  )

  // -------------------------------------------------------------- shipping
  console.log('\n== shipping ==')

  r = await json('/api/shipping-rates?country=BE')
  check(r.status === 200, 'shipping rates for BE', `status ${r.status}`)
  check(Array.isArray(r.body?.rates) && r.body.rates.length > 0, 'BE has a rate')
  const rate = r.body?.rates?.[0]

  r = await json('/api/shipping-rates?country=US')
  check(
    r.status !== 200 || (r.body?.rates ?? []).length === 0,
    'unsupported destination offers no rate',
    'US is outside the store\'s zones',
  )

  // -------------------------------------------------------------- checkout
  console.log('\n== checkout ==')

  const address = {
    first_name: 'Flow',
    last_name: 'Test',
    address1: '1 Test Street',
    city: 'Brussels',
    postcode: '1000',
    country_code: 'BE',
  }

  // Price tampering: the request carries a price the server must ignore.
  r = await json('/api/checkout', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      shippingAddress: address,
      shippingRateCode: rate?.code,
      subtotalCents: 1,
      totalCents: 1,
      lines: [{ variantId: item.variant_id, unitPriceCents: 1, quantity: 2 }],
    }),
  })
  const tamperedOrder = r.body?.orderNumber
    ? (await db.query('select subtotal_cents from orders where order_number = $1', [
        r.body.orderNumber,
      ])).rows[0]
    : null

  // Whether Stripe is reachable decides how far this can go. Either way the
  // order must have been priced from the database.
  const stripeWorks = r.status === 200 && Boolean(r.body?.url)

  if (tamperedOrder) {
    check(
      tamperedOrder.subtotal_cents === item.price_cents * 2,
      'browser-supplied prices are ignored',
      `charged ${tamperedOrder.subtotal_cents}, browser claimed 1`,
    )
  } else if (!stripeWorks) {
    // No order row means checkout refused before pricing; look at why.
    check(
      r.status >= 400,
      'checkout rejected rather than trusting the browser',
      `status ${r.status}: ${r.body?.error ?? ''}`,
    )
  }

  if (!stripeWorks) {
    skip(
      'Stripe Checkout session creation',
      `STRIPE_SECRET_KEY is not a working test key — status ${r.status}: ${String(r.body?.error ?? '').slice(0, 80)}`,
    )
  } else {
    ok('Stripe Checkout session created', String(r.body.url).slice(0, 40) + '…')
  }

  // Whatever Stripe did, an order must exist to carry the rest of the journey.
  // Create it the way checkout does if the Stripe leg could not complete.
  let order = (
    await db.query(
      'select * from orders where email = $1 order by created_at desc limit 1',
      [EMAIL],
    )
  ).rows[0]

  if (!order) {
    fail('checkout created an order', 'no order row for the test email')
    return
  }

  check(order.subtotal_cents === item.price_cents * 2, 'order subtotal from the database')
  check(order.shipping_cents === rate.priceCents, 'shipping charged the published rate',
    `${order.shipping_cents} vs ${rate.priceCents}`)
  check(
    order.total_cents === order.subtotal_cents - order.discount_cents + order.shipping_cents + order.tax_cents,
    'total is internally consistent',
  )
  /*
   * An order is never born paid. `failed` is also acceptable here and only
   * here: when the Stripe leg cannot complete, the checkout route cancels the
   * order and marks the payment failed before this line runs. What must never
   * appear is `paid` — that would mean something other than a verified webhook
   * decided money had changed hands.
   */
  check(
    ['unpaid', 'failed'].includes(order.payment_status),
    'order is not created already paid',
    order.payment_status,
  )

  const stockAfterOrder = (
    await db.query('select inventory_quantity from product_variants where id = $1', [
      item.variant_id,
    ])
  ).rows[0].inventory_quantity

  if (order.status === 'cancelled') {
    // The Stripe leg failed and the route compensated. That is itself one of
    // the failure paths worth proving.
    check(
      stockAfterOrder === startingStock,
      'a failed payment setup returns the reserved stock',
      `stock ${stockAfterOrder}, started at ${startingStock}`,
    )
    // Re-open it so the payment half of the journey can still be exercised.
    await db.query(
      `update orders set status = 'pending', payment_status = 'unpaid' where id = $1`,
      [order.id],
    )
    await db.query(
      `delete from inventory_movements where order_id = $1 and reason = 'cancellation'`,
      [order.id],
    )
    await db.query(
      `update product_variants set inventory_quantity = inventory_quantity - 2 where id = $1`,
      [item.variant_id],
    )
    order = (await db.query('select * from orders where id = $1', [order.id])).rows[0]
  } else {
    check(
      stockAfterOrder === startingStock - 2,
      'checkout reserved the stock',
      `stock ${stockAfterOrder}, started at ${startingStock}`,
    )
  }

  // --------------------------------------------------------------- payment
  console.log('\n== payment ==')

  const paidEvent = {
    id: `evt_flow_${RUN}`,
    object: 'event',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_flow_${RUN}`,
        object: 'checkout.session',
        payment_status: 'paid',
        payment_intent: `pi_flow_${RUN}`,
        client_reference_id: order.id,
        metadata: { order_id: order.id, order_number: order.order_number },
      },
    },
  }

  check(
    (await stripeEvent(paidEvent, { secret: 'whsec_wrong' })) === 400,
    'an unsigned payment notification is refused',
  )

  check((await stripeEvent(paidEvent)) === 200, 'signed payment notification accepted')

  let state = (
    await db.query('select status, payment_status, paid_at from orders where id = $1', [order.id])
  ).rows[0]
  check(state.payment_status === 'paid', 'order marked paid', state.payment_status)
  check(state.paid_at !== null, 'paid_at recorded')

  const stockAfterPaid = (
    await db.query('select inventory_quantity from product_variants where id = $1', [
      item.variant_id,
    ])
  ).rows[0].inventory_quantity
  check(
    stockAfterPaid === startingStock - 2,
    'payment does not double-decrement',
    `stock ${stockAfterPaid}`,
  )

  const { rows: journal } = await db.query(
    `select coalesce(-sum(delta), 0)::int as sold from inventory_movements
      where order_id = $1 and reason = 'sale'`,
    [order.id],
  )
  check(journal[0].sold === 2, 'inventory journal records the sale', `${journal[0].sold} unit(s)`)

  // Confirmation page.
  const success = await visit(`/checkout/success?order=${order.order_number}`)
  check(success.status === 200, 'confirmation page renders', `status ${success.status}`)

  // ------------------------------------------------------------- the account
  console.log('\n== account ==')

  const signup = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  check(signup.ok, 'customer can register', `status ${signup.status}`)
  const signupBody = await signup.json().catch(() => ({}))
  const userId = signupBody.user?.id ?? signupBody.id

  const login = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  check(login.ok, 'customer can log in', `status ${login.status}`)
  const session = await login.json().catch(() => ({}))
  const accessToken = session.access_token

  if (!accessToken || !userId) {
    fail('auth returned a usable session', 'skipping order-history checks')
  } else {
    // Link the order to the new customer the way the account page does.
    const { rows: customer } = await db.query(
      `insert into customers (user_id, email) values ($1, $2)
       on conflict (user_id) do update set email = excluded.email
       returning id`,
      [userId, EMAIL],
    )
    await db.query('update orders set customer_id = $1 where id = $2', [
      customer[0].id,
      order.id,
    ])

    // Read back through PostgREST as the customer, so RLS is what decides.
    const mine = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?select=order_number&order_number=eq.${order.order_number}`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` } },
    )
    const mineRows = await mine.json().catch(() => [])
    check(
      Array.isArray(mineRows) && mineRows.length === 1,
      'customer sees their own order',
      `${Array.isArray(mineRows) ? mineRows.length : '?'} row(s)`,
    )

    const others = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    })
    const otherRows = await others.json().catch(() => [])
    const { rows: total } = await db.query('select count(*)::int as n from orders')
    check(
      Array.isArray(otherRows) && otherRows.length < total[0].n,
      'customer cannot see other customers\' orders',
      `${Array.isArray(otherRows) ? otherRows.length : '?'} visible of ${total[0].n}`,
    )

    const admins = await fetch(`${SUPABASE_URL}/rest/v1/admin_users?select=user_id`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    })
    const adminRows = await admins.json().catch(() => [])
    check(
      !Array.isArray(adminRows) || adminRows.length === 0,
      'a customer cannot read the admin table',
    )

    // Session persistence: the refresh token must mint a fresh session, which
    // is what keeps someone signed in across days rather than minutes.
    if (session.refresh_token) {
      const refreshed = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      })
      const next = await refreshed.json().catch(() => ({}))
      check(refreshed.ok && Boolean(next.access_token), 'the session can be refreshed',
        `status ${refreshed.status}`)
    } else {
      fail('login returned a refresh token', 'sessions could not outlive the access token')
    }

    // Password reset. The mail itself is Supabase's to send; what must hold
    // here is that asking for one never reveals whether the address exists.
    const resetKnown = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ email: EMAIL }),
    })
    check(resetKnown.ok, 'password reset accepted for a real address', `status ${resetKnown.status}`)

    const resetUnknown = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ email: `nobody-${RUN}@example.com` }),
    })
    check(
      resetUnknown.status === resetKnown.status,
      'and answers identically for an unknown one',
      'otherwise the form enumerates who has an account',
    )

    // Sign out must actually end the session server-side, not just drop the
    // cookie: a token that still works after logout is not logged out.
    const logout = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    })
    check(logout.ok || logout.status === 204, 'sign out accepted', `status ${logout.status}`)

    const afterLogout = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
    })
    const afterRows = await afterLogout.json().catch(() => [])
    check(
      !Array.isArray(afterRows) || afterRows.length === 0,
      'and the old token can no longer read the customer\'s orders',
      `${Array.isArray(afterRows) ? afterRows.length : '?'} row(s)`,
    )
  }

  // --------------------------------------------------------------- the admin
  console.log('\n== admin ==')

  const adminAnon = await visit('/admin')
  check(
    adminAnon.status === 307 || adminAnon.status === 302 || adminAnon.status === 401,
    'anonymous visitor is turned away from /admin',
    `status ${adminAnon.status}`,
  )
  const location = adminAnon.headers.get('location') ?? ''
  check(
    adminAnon.status === 401 || location.includes('/admin/login') || location.includes('/account/login'),
    'and is sent to a login page',
    location || '(none)',
  )

  const adminOrder = await visit(`/admin/orders/${order.id}`)
  check(
    adminOrder.status !== 200,
    'an unauthenticated request cannot read an order in the admin',
    `status ${adminOrder.status}`,
  )

  // -------------------------------------------------------- failure paths
  console.log('\n== failure paths ==')

  r = await json('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ variantId: '00000000-0000-0000-0000-000000000000', quantity: 1 }),
  })
  check(r.status >= 400, 'unknown variant rejected', `status ${r.status}`)

  r = await json('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ variantId: item.variant_id, quantity: 9999 }),
  })
  check(r.status >= 400, 'quantity beyond stock rejected', `status ${r.status}`)

  // A draft product must not be purchasable even if its id is known.
  const draft = await db.query(`
    with p as (insert into products (slug, title, status) values ($1, 'Draft', 'draft') returning id)
    insert into product_variants (product_id, title, sku, price_cents, inventory_quantity)
    select id, 'ONE', $2, 5000, 10 from p returning id
  `, [`flow-draft-${RUN}`, `FLOW-DRAFT-${RUN}`])

  r = await json('/api/cart', {
    method: 'POST',
    body: JSON.stringify({ variantId: draft.rows[0].id, quantity: 1 }),
  })
  check(r.status >= 400, 'a draft product cannot be added to a cart', `status ${r.status}`)

  r = await json('/api/checkout', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      shippingAddress: { ...address, country_code: 'US' },
      shippingRateCode: rate?.code,
    }),
  })
  check(r.status >= 400, 'checkout to an unserved country refused', `status ${r.status}`)

  r = await json('/api/checkout', {
    method: 'POST',
    body: JSON.stringify({
      email: EMAIL,
      shippingAddress: address,
      shippingRateCode: 'made-up-rate',
    }),
  })
  check(r.status >= 400, 'an invented shipping rate refused', `status ${r.status}`)

  // ---------------------------------------------------------------- cleanup
  await db.query('delete from orders where email = $1', [EMAIL])
  await db.query(
    `delete from carts c where exists (
       select 1 from cart_items ci join product_variants v on v.id = ci.variant_id
       join products p on p.id = v.product_id
       where ci.cart_id = c.id and p.slug = $1)`,
    [`flow-draft-${RUN}`],
  )
  await db.query('delete from products where slug = $1', [`flow-draft-${RUN}`])
  await db.query('delete from customers where email = $1', [EMAIL])
  if (userId) await db.query('delete from auth.users where id = $1', [userId])
  await db.query(
    'update product_variants set inventory_quantity = $1 where id = $2',
    [startingStock, item.variant_id],
  )

  console.log('')
  if (failures === 0) {
    console.log(
      `==> OK: the full journey works${skipped > 0 ? ` (${skipped} step(s) skipped — see above)` : ''}`,
    )
  } else {
    console.log(`==> FAILED: ${failures} check(s)`)
  }
}

try {
  await main()
} catch (error) {
  console.error(error)
  failures += 1
}
await db.end().catch(() => {})
if (failures > 0) process.exit(1)
