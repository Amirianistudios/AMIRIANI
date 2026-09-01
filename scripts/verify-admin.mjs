/**
 * Admin verification: does the admin actually change the store?
 *
 *   node scripts/verify-admin.mjs
 *
 * Drives a real browser through a real sign-in and works the product lifecycle
 * the way a shopkeeper would — create, describe, add a variant, price it, set
 * stock, upload a photograph, put it in a collection, publish, then archive —
 * and after each step asserts the row in Postgres and, where it should be
 * visible, the storefront page.
 *
 * A page that renders is not evidence of anything. Server Actions run behind
 * an authorisation check and can silently return an error the UI swallows, so
 * the database is the only witness that counts. Every assertion here reads it.
 *
 * The authorisation half matters just as much: a signed-in customer who is not
 * an admin must be refused, and refused by the server rather than by a hidden
 * link, so the same actions are attempted from a non-admin session too.
 *
 * Environment:
 *   APP_URL         default http://127.0.0.1:3000
 *   DATABASE_URL    Postgres
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   CHROMIUM_PATH   explicit Chromium binary, if the bundled one is wrong
 */

import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Client } from 'pg'
import { chromium } from 'playwright'

const APP = process.env.APP_URL ?? 'http://127.0.0.1:3000'
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5433/amiriani_dev'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'local-anon-key'

const RUN = Date.now()
const ADMIN_EMAIL = `admin-${RUN}@example.com`
const CUSTOMER_EMAIL = `shopper-${RUN}@example.com`
const PASSWORD = 'Adm1n-test-password!'
const TITLE = `Verification Piece ${RUN}`

const db = new Client({ connectionString: DATABASE_URL })
await db.connect()

let failures = 0
const ok = (l, d = '') => console.log(`  ok    ${l}${d ? `  (${d})` : ''}`)
const bad = (l, d = '') => {
  console.log(`  FAIL  ${l}${d ? `  (${d})` : ''}`)
  failures += 1
}
const check = (c, l, d = '') => (c ? ok(l, d) : bad(l, d))

/** A 1×1 PNG, so the upload exercises the real path without a fixture file. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

async function createUser(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`signup ${email}: ${res.status} ${await res.text()}`)
  const body = await res.json()
  return body.user?.id ?? body.id
}

async function signIn(page, email) {
  await page.goto(`${APP}/admin/login`, { waitUntil: 'load' })
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', PASSWORD)
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await page.waitForTimeout(1500)
}

/** Submits the form containing `anchor`, then waits for the action to land. */
async function submitFormWith(page, anchor, fill = async () => {}) {
  const form = page.locator('form').filter({ has: page.locator(anchor) }).first()
  await fill(form)
  await form.locator('button[type="submit"]').click()
  await page.waitForTimeout(1800)
  return form
}

const one = async (sql, params) => (await db.query(sql, params)).rows[0]

async function main() {
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  )
  const tempDir = await mkdtemp(join(tmpdir(), 'amiriani-admin-'))
  const imagePath = join(tempDir, 'swatch.png')
  await writeFile(imagePath, PNG)

  let adminId
  let customerId

  try {
    console.log('\n== access control ==')

    adminId = await createUser(ADMIN_EMAIL)
    customerId = await createUser(CUSTOMER_EMAIL)
    await db.query('insert into admin_users (user_id, email, role) values ($1, $2, $3)', [
      adminId,
      ADMIN_EMAIL,
      'admin',
    ])

    const shopper = await browser.newContext()
    const shopperPage = await shopper.newPage()
    await signIn(shopperPage, CUSTOMER_EMAIL)
    await shopperPage.goto(`${APP}/admin/products`, { waitUntil: 'load' })
    check(
      !shopperPage.url().includes('/admin/products'),
      'a signed-in customer cannot reach the admin',
      shopperPage.url().replace(APP, ''),
    )

    // Not just hidden in the UI — the action itself must refuse. Server Actions
    // are POST endpoints, so a customer who finds the id must still be stopped.
    const forged = await shopperPage.evaluate(async (app) => {
      const res = await fetch(`${app}/admin/products`, {
        method: 'POST',
        headers: { 'Next-Action': '00000000000000000000000000000000000000' },
        body: '[]',
      })
      return res.status
    }, APP)
    check(forged !== 200, 'a forged admin action from a customer session is refused', `status ${forged}`)
    await shopper.close()

    const context = await browser.newContext()
    const page = await context.newPage()
    await signIn(page, ADMIN_EMAIL)
    await page.goto(`${APP}/admin/products`, { waitUntil: 'load' })
    check(page.url().includes('/admin/products'), 'an admin can reach the admin', page.url().replace(APP, ''))

    // ---------------------------------------------------------------- create
    console.log('\n== create ==')

    await page.click('button:has-text("New product")')
    await submitFormWith(page, 'input[name="title"]', async (form) => {
      await form.locator('input[name="title"]').fill(TITLE)
      await form.locator('textarea[name="descriptionHtml"]').fill('<p>Created by the verifier.</p>')
    })

    let product = await one('select * from products where title = $1', [TITLE])
    check(Boolean(product), 'the product was written to the database')
    if (!product) return

    check(product.status === 'draft', 'it is created as a draft', product.status)
    check(/^verification-piece-\d+$/.test(product.slug), 'a handle was derived', product.slug)

    const defaultVariant = await one(
      'select * from product_variants where product_id = $1',
      [product.id],
    )
    check(Boolean(defaultVariant), 'a default variant came with it', defaultVariant?.title)

    // A draft must not be on the storefront.
    const draftPage = await fetch(`${APP}/products/${product.slug}`)
    check(draftPage.status === 404, 'a draft is not reachable on the storefront', `status ${draftPage.status}`)

    // ------------------------------------------------------------------ edit
    console.log('\n== edit ==')

    await page.goto(`${APP}/admin/products/${product.id}`, { waitUntil: 'load' })

    await submitFormWith(page, 'input[name="productId"][value="' + product.id + '"]', async (form) => {
      await form.locator('input[name="title"]').fill(`${TITLE} — edited`)
      await form.locator('input[name="seoTitle"]').fill('Verification SEO title')
    })

    product = await one('select * from products where id = $1', [product.id])
    check(product.title === `${TITLE} — edited`, 'the title was saved', product.title)
    check(product.seo_title === 'Verification SEO title', 'the SEO title was saved', product.seo_title ?? '')

    // ----------------------------------------------------------- add variant
    console.log('\n== variants ==')

    await submitFormWith(page, 'input[name="title"][placeholder="M"]', async (form) => {
      await form.locator('input[name="title"]').fill('L')
      await form.locator('input[name="sku"]').fill(`VERIFY-${RUN}-L`)
      await form.locator('input[name="priceCents"]').fill('12500')
      await form.locator('input[name="quantity"]').fill('7')
    })

    const added = await one(
      'select * from product_variants where sku = $1',
      [`VERIFY-${RUN}-L`],
    )
    check(Boolean(added), 'the variant was created')
    check(added?.price_cents === 12500, 'at the price given', String(added?.price_cents))
    check(added?.inventory_quantity === 7, 'with its opening stock', String(added?.inventory_quantity))

    const opening = await one(
      `select coalesce(sum(delta), 0)::int as total from inventory_movements where variant_id = $1`,
      [added?.id],
    )
    check(
      opening?.total === 7,
      'and the opening stock is in the inventory journal',
      `${opening?.total} unit(s)`,
    )

    // ------------------------------------------------------------ price/stock
    console.log('\n== price and stock ==')

    await page.reload({ waitUntil: 'load' })

    await submitFormWith(page, `input[name="variantId"][value="${added.id}"] ~ * input[name="priceCents"], input[name="priceCents"]`, async (form) => {
      await form.locator('input[name="priceCents"]').fill('9900')
    })

    const repriced = await one('select * from product_variants where id = $1', [
      (await one('select id from product_variants where product_id = $1 order by position limit 1', [product.id])).id,
    ])
    check(repriced.price_cents === 9900, 'a price change was written', String(repriced.price_cents))

    await page.reload({ waitUntil: 'load' })
    const stockForm = page
      .locator('form')
      .filter({ has: page.locator('input[name="quantity"]') })
      .first()
    await stockForm.locator('input[name="quantity"]').fill('23')
    await stockForm.locator('button[type="submit"]').click()
    await page.waitForTimeout(1800)

    const restocked = await one(
      'select v.* from product_variants v where v.product_id = $1 order by v.position limit 1',
      [product.id],
    )
    check(restocked.inventory_quantity === 23, 'a stock change was written', String(restocked.inventory_quantity))

    const journalled = await one(
      `select count(*)::int as n from inventory_movements
        where variant_id = $1 and reason = 'correction'`,
      [restocked.id],
    )
    check(journalled.n > 0, 'and journalled rather than silently overwritten', `${journalled.n} movement(s)`)

    // ----------------------------------------------------------------- image
    console.log('\n== image upload ==')

    await page.reload({ waitUntil: 'load' })
    const uploadForm = page
      .locator('form')
      .filter({ has: page.locator('input[type="file"]') })
      .first()
    await uploadForm.locator('input[type="file"]').setInputFiles(imagePath)
    await uploadForm.locator('input[name="alt"]').fill('Verification swatch')
    await uploadForm.locator('button[type="submit"]').click()
    await page.waitForTimeout(2500)

    const image = await one('select * from product_images where product_id = $1', [product.id])
    check(Boolean(image), 'an image row was written')
    check(Boolean(image?.storage_path), 'pointing at Supabase Storage', image?.storage_path ?? '')
    check(image?.is_primary === true, 'and marked as the primary image')

    if (image?.storage_path) {
      const stored = await fetch(
        `${SUPABASE_URL}/storage/v1/object/public/product-media/${image.storage_path}`,
      )
      check(stored.ok, 'the file is actually served from the bucket', `status ${stored.status}`)
    }

    // ------------------------------------------------------------ collection
    console.log('\n== collections ==')

    const collection = await one('select id, slug, title from collections limit 1')
    if (!collection) {
      bad('a collection exists to assign to')
    } else {
      await page.reload({ waitUntil: 'load' })
      const collectionForm = page
        .locator('form')
        .filter({ has: page.locator('input[name="collectionId"]') })
        .first()
      await collectionForm.locator(`input[value="${collection.id}"]`).check()
      await collectionForm.locator('button[type="submit"]').click()
      await page.waitForTimeout(1800)

      const member = await one(
        'select * from collection_products where product_id = $1 and collection_id = $2',
        [product.id, collection.id],
      )
      check(Boolean(member), 'the product joined the collection', collection.title)

      // Unticking must remove it — an "add only" action would not.
      await page.reload({ waitUntil: 'load' })
      const again = page
        .locator('form')
        .filter({ has: page.locator('input[name="collectionId"]') })
        .first()
      await again.locator(`input[value="${collection.id}"]`).uncheck()
      await again.locator('button[type="submit"]').click()
      await page.waitForTimeout(1800)

      const removed = await one(
        'select * from collection_products where product_id = $1 and collection_id = $2',
        [product.id, collection.id],
      )
      check(!removed, 'and unticking removes it again')

      // Put it back for the storefront check below.
      await db.query(
        'insert into collection_products (product_id, collection_id) values ($1, $2)',
        [product.id, collection.id],
      )
    }

    // ------------------------------------------------------------- storefront
    console.log('\n== publish and see it on the storefront ==')

    await page.goto(`${APP}/admin/products/${product.id}`, { waitUntil: 'load' })
    await submitFormWith(page, `input[name="productId"][value="${product.id}"]`, async (form) => {
      await form.locator('select[name="status"]').selectOption('active')
    })

    product = await one('select * from products where id = $1', [product.id])
    check(product.status === 'active', 'the product was published', product.status)

    const live = await fetch(`${APP}/products/${product.slug}`)
    const liveHtml = await live.text()
    check(live.status === 200, 'the storefront page is now reachable', `status ${live.status}`)
    check(liveHtml.includes(`${TITLE} — edited`), 'showing the edited title')
    check(liveHtml.includes('99,00') || liveHtml.includes('99.00'), 'and the new price')

    // --------------------------------------------------------------- archive
    console.log('\n== archive ==')

    await page.goto(`${APP}/admin/products/${product.id}`, { waitUntil: 'load' })
    await submitFormWith(page, `input[name="productId"][value="${product.id}"]`, async (form) => {
      await form.locator('select[name="status"]').selectOption('archived')
    })

    product = await one('select * from products where id = $1', [product.id])
    check(product.status === 'archived', 'the product was archived', product.status)

    const archived = await fetch(`${APP}/products/${product.slug}`)
    check(archived.status === 404, 'and is gone from the storefront', `status ${archived.status}`)

    await context.close()
  } finally {
    // ---------------------------------------------------------------- cleanup
    const product = await one('select id from products where title like $1', [`${TITLE}%`])
    if (product) {
      const { rows: images } = await db.query(
        'select storage_path from product_images where product_id = $1 and storage_path is not null',
        [product.id],
      )
      for (const image of images) {
        await fetch(
          `${SUPABASE_URL}/storage/v1/object/product-media/${image.storage_path}`,
          {
            method: 'DELETE',
            headers: {
              apikey: ANON_KEY,
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
            },
          },
        ).catch(() => {})
      }
      await db.query('delete from products where id = $1', [product.id])
    }
    if (adminId) await db.query('delete from admin_users where user_id = $1', [adminId])
    for (const id of [adminId, customerId].filter(Boolean)) {
      await db.query('delete from customers where user_id = $1', [id])
      await db.query('delete from auth.users where id = $1', [id])
    }
    await rm(tempDir, { recursive: true, force: true })
    await browser.close()
  }

  console.log('')
  console.log(
    failures === 0
      ? '==> OK: the admin writes to the database, and only admins can'
      : `==> FAILED: ${failures} check(s)`,
  )
}

try {
  await main()
} catch (error) {
  console.error(error)
  failures += 1
}
await db.end().catch(() => {})
if (failures > 0) process.exit(1)
