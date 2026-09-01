/**
 * Verifies a hosted Supabase project is correctly set up.
 *
 *   DATABASE_URL='postgresql://postgres.<ref>:<pw>@...pooler.supabase.com:5432/postgres' \
 *   NEXT_PUBLIC_SUPABASE_URL='https://<ref>.supabase.co' \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY='...' \
 *   SUPABASE_SERVICE_ROLE_KEY='...' \
 *     npx tsx scripts/verify-supabase.ts
 *
 * Checks structure (tables, foreign keys, indexes, constraints, functions),
 * security (RLS enabled and actually enforced for the anon key), and storage
 * (buckets exist, are public for reads, and reject anonymous writes).
 *
 * Read-only apart from one temporary draft product used to prove RLS hides it,
 * which is removed again.
 */

import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'

const EXPECTED_TABLES = [
  'admin_users',
  'cart_items',
  'carts',
  'collection_products',
  'collections',
  'content_pages',
  'customer_addresses',
  'customers',
  'discount_codes',
  'homepage_sections',
  'inventory_movements',
  'navigation_items',
  'newsletter_subscribers',
  'order_items',
  'orders',
  'product_images',
  'product_variants',
  'products',
  'redirects',
  'site_settings',
]

const EXPECTED_FUNCTIONS = [
  'adjust_inventory',
  'create_order_from_cart',
  'is_admin',
  'restock_order',
  'set_updated_at',
  'slugify',
]

const EXPECTED_BUCKETS = ['product-media', 'collection-media', 'site-media']

let failures = 0
let warnings = 0

function ok(label: string, detail = '') {
  console.log(`  ok    ${label}${detail ? `  (${detail})` : ''}`)
}
function fail(label: string, detail = '') {
  console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`)
  failures += 1
}
function warn(label: string, detail = '') {
  console.log(`  warn  ${label}${detail ? `  (${detail})` : ''}`)
  warnings += 1
}
function check(condition: boolean, label: string, detail = '') {
  if (condition) ok(label, detail)
  else fail(label, detail)
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name}`)
    process.exit(1)
  }
  return value
}

/**
 * Supabase terminates TLS with its own chain, so we encrypt without pinning a
 * root. A local Postgres has no TLS at all and would refuse the handshake, so
 * detect that rather than making the caller pass a flag.
 */
function sslFor(connectionString: string) {
  const local = /@(127\.0\.0\.1|localhost|\[::1\])[:/]|[?&]host=/.test(connectionString)
  return local ? false : ({ rejectUnauthorized: false } as const)
}

async function main() {
  const connectionString = required('DATABASE_URL')
  const db = new Client({ connectionString, ssl: sslFor(connectionString) })
  await db.connect()

  // ------------------------------------------------------------------ schema
  console.log('\n== schema ==')

  const { rows: tables } = await db.query<{ tablename: string; rowsecurity: boolean }>(
    `select tablename, rowsecurity from pg_tables t
       join pg_class c on c.relname = t.tablename
      where schemaname = 'public' and c.relkind = 'r'`,
  )
  const tableNames = tables.map((t) => t.tablename).sort()

  const missing = EXPECTED_TABLES.filter((t) => !tableNames.includes(t))
  check(missing.length === 0, `all ${EXPECTED_TABLES.length} tables present`,
    missing.length ? `missing: ${missing.join(', ')}` : '')

  // ------------------------------------------------------------------ RLS
  console.log('\n== row level security ==')

  const withoutRls = tables.filter((t) => !t.rowsecurity).map((t) => t.tablename)
  check(withoutRls.length === 0, 'RLS enabled on every public table',
    withoutRls.length ? `missing on: ${withoutRls.join(', ')}` : '')

  const { rows: policies } = await db.query<{ tablename: string; count: string }>(
    `select tablename, count(*)::text from pg_policies
      where schemaname = 'public' group by tablename`,
  )
  const policyByTable = new Map(policies.map((p) => [p.tablename, Number(p.count)]))
  const noPolicy = EXPECTED_TABLES.filter((t) => !policyByTable.has(t))
  check(noPolicy.length === 0, `policies defined on every table`,
    noPolicy.length ? `none on: ${noPolicy.join(', ')}` : `${policies.length} tables`)

  // ------------------------------------------------------- keys and indexes
  console.log('\n== foreign keys, indexes, constraints ==')

  const { rows: fks } = await db.query<{ count: string }>(
    `select count(*)::text from pg_constraint c
       join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.contype = 'f'`,
  )
  check(Number(fks[0]!.count) >= 15, 'foreign keys present', `${fks[0]!.count} found`)

  // Every foreign key should have an index on its referencing columns,
  // otherwise deletes and joins on the parent do sequential scans.
  const { rows: unindexed } = await db.query<{ conname: string; tbl: string }>(`
    select c.conname, cl.relname as tbl
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and c.contype = 'f'
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid
            and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] @> c.conkey
       )
  `)
  if (unindexed.length === 0) {
    ok('every foreign key is covered by an index')
  } else {
    // Not fatal, but worth surfacing.
    warn('foreign keys without a covering index',
      unindexed.map((u) => `${u.tbl}.${u.conname}`).join(', '))
  }

  const { rows: checks } = await db.query<{ count: string }>(
    `select count(*)::text from pg_constraint c
       join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.contype = 'c'`,
  )
  check(Number(checks[0]!.count) >= 20, 'check constraints present', `${checks[0]!.count} found`)

  const { rows: uniques } = await db.query<{ count: string }>(
    `select count(*)::text from pg_constraint c
       join pg_namespace n on n.oid = c.connamespace
      where n.nspname = 'public' and c.contype = 'u'`,
  )
  check(Number(uniques[0]!.count) >= 8, 'unique constraints present', `${uniques[0]!.count} found`)

  // ---------------------------------------------------------------- functions
  console.log('\n== functions ==')

  const { rows: functions } = await db.query<{ proname: string; prosecdef: boolean }>(
    `select p.proname, p.prosecdef from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'`,
  )
  const functionNames = functions.map((f) => f.proname)
  for (const name of EXPECTED_FUNCTIONS) {
    check(functionNames.includes(name), `function ${name}`)
  }

  const definer = new Set(functions.filter((f) => f.prosecdef).map((f) => f.proname))
  for (const name of ['adjust_inventory', 'create_order_from_cart', 'is_admin', 'restock_order']) {
    check(definer.has(name), `${name} is SECURITY DEFINER`)
  }

  // The checkout function must not be callable by the browser roles.
  const { rows: grants } = await db.query<{ grantee: string }>(`
    select grantee from information_schema.role_routine_grants
     where specific_schema = 'public' and routine_name = 'create_order_from_cart'
       and grantee in ('anon', 'authenticated')
  `)
  check(grants.length === 0, 'create_order_from_cart not executable by anon/authenticated',
    grants.length ? `granted to ${grants.map((g) => g.grantee).join(', ')}` : '')

  // ------------------------------------------------------------------ storage
  console.log('\n== storage ==')

  const { rows: buckets } = await db.query<{ id: string; public: boolean }>(
    'select id, public from storage.buckets',
  )
  const bucketIds = buckets.map((b) => b.id)
  for (const bucket of EXPECTED_BUCKETS) {
    const found = buckets.find((b) => b.id === bucket)
    check(Boolean(found), `bucket ${bucket} exists`)
    if (found) check(found.public, `bucket ${bucket} is public for reads`)
  }
  if (bucketIds.length > EXPECTED_BUCKETS.length) {
    warn('extra buckets present', bucketIds.filter((b) => !EXPECTED_BUCKETS.includes(b)).join(', '))
  }

  // ------------------------------------------------------------------- data
  console.log('\n== catalogue ==')

  const { rows: counts } = await db.query<Record<string, string>>(`
    select
      (select count(*) from products where status = 'active')::text as products,
      (select count(*) from product_variants)::text                 as variants,
      (select count(*) from product_images)::text                   as images,
      (select count(*) from collections)::text                      as collections,
      (select count(*) from content_pages)::text                    as pages,
      (select count(*) from navigation_items)::text                 as nav,
      (select count(*) from homepage_sections)::text                as sections,
      (select count(*) from product_images where storage_path is not null)::text as in_storage
  `)
  const c = counts[0]!
  console.log(
    `  products ${c.products}  variants ${c.variants}  images ${c.images}` +
      `  collections ${c.collections}  pages ${c.pages}  nav ${c.nav}  sections ${c.sections}`,
  )
  check(Number(c.products) > 0, 'catalogue imported')
  if (Number(c.images) > 0 && Number(c.in_storage) === 0) {
    warn('all images are external URLs',
      'run the import with IMAGE_STRATEGY=storage to stop depending on the Shopify CDN')
  } else if (Number(c.in_storage) > 0) {
    ok('images live in Supabase Storage', `${c.in_storage}/${c.images}`)
  }

  // ------------------------------------------- RLS actually enforced for anon
  console.log('\n== RLS enforcement via the public API ==')

  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  const anonKey = required('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const anon = createClient(url, anonKey, { auth: { persistSession: false } })

  const probeSlug = `rls-probe-${Date.now()}`
  await db.query(
    `insert into products (slug, title, status) values ($1, 'RLS probe', 'draft')`,
    [probeSlug],
  )

  try {
    const { data: draft } = await anon.from('products').select('slug').eq('slug', probeSlug)
    check((draft ?? []).length === 0, 'anon cannot read draft products')

    const { data: activeRows, error: activeError } = await anon
      .from('products')
      .select('slug')
      .eq('status', 'active')
      .limit(1)
    check(!activeError && (activeRows ?? []).length > 0, 'anon can read active products')

    const { data: orders } = await anon.from('orders').select('id').limit(1)
    check((orders ?? []).length === 0, 'anon cannot read orders')

    const { data: customers } = await anon.from('customers').select('id').limit(1)
    check((customers ?? []).length === 0, 'anon cannot read customers')

    const { data: admins } = await anon.from('admin_users').select('user_id').limit(1)
    check((admins ?? []).length === 0, 'anon cannot read admin_users')

    const { error: writeError } = await anon
      .from('products')
      .insert({ slug: 'anon-write-probe', title: 'nope' })
    check(Boolean(writeError), 'anon cannot insert products', writeError?.code ?? '')

    // Anonymous storage upload must be refused.
    const { error: uploadError } = await anon.storage
      .from('product-media')
      .upload(`probe-${Date.now()}.txt`, new Blob(['nope']))
    check(Boolean(uploadError), 'anon cannot upload to storage', uploadError?.message ?? '')
  } finally {
    await db.query('delete from products where slug = $1', [probeSlug])
  }

  // ------------------------------------------------------------------- auth
  console.log('\n== auth ==')

  const { rows: users } = await db.query<{ count: string }>(
    'select count(*)::text from auth.users',
  )
  ok('auth schema reachable', `${users[0]!.count} user(s)`)

  const { rows: adminCount } = await db.query<{ count: string }>(
    'select count(*)::text from admin_users',
  )
  if (Number(adminCount[0]!.count) === 0) {
    warn('no admin user yet', 'sign up, then run: npm run admin:grant <email>')
  } else {
    ok('admin user configured', `${adminCount[0]!.count}`)
  }

  await db.end()

  console.log('')
  if (failures === 0) {
    console.log(
      `==> OK${warnings > 0 ? ` (${warnings} warning(s) above)` : ''}: the project is correctly configured`,
    )
  } else {
    console.log(`==> FAILED: ${failures} check(s)`)
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
