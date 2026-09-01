/**
 * Applies supabase/migrations to a hosted Supabase project, in order, once.
 *
 *   DATABASE_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
 *     npx tsx scripts/supabase-apply.ts
 *
 * Get that string from the Supabase dashboard: Project Settings → Database →
 * Connection string → URI. Use the **session** pooler on port 5432 or the direct
 * connection; the transaction pooler on 6543 cannot run DDL reliably.
 *
 * Each migration runs inside its own transaction, so a failure leaves the
 * schema untouched rather than half-built. Applied migrations are recorded in
 * `schema_migrations`, so re-running only applies what is new — which is what
 * makes this safe to run against a project that already has some of the schema.
 *
 * Options:
 *   --dry-run   list what would be applied and exit
 */

import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { Client } from 'pg'

const DRY_RUN = process.argv.includes('--dry-run')
const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations')

function connectionString(): string {
  const url = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL
  if (!url) {
    console.error(
      'Set DATABASE_URL to the project\'s Postgres connection string.\n' +
        'Supabase dashboard → Project Settings → Database → Connection string → URI.\n' +
        'Use port 5432 (session pooler or direct); 6543 is the transaction pooler\n' +
        'and cannot run migrations.',
    )
    process.exit(1)
  }
  return url
}

async function main() {
  const url = connectionString()
  const client = new Client({
    connectionString: url,
    // Supabase terminates TLS with its own chain; verify-full would need the
    // bundled root, and this is a one-shot admin task over an encrypted link.
    // A local Postgres serves no TLS at all and would refuse the handshake.
    ssl: /@(127\.0\.0\.1|localhost|\[::1\])[:/]|[?&]host=/.test(url)
      ? false
      : { rejectUnauthorized: false },
    // A long migration should not be cut off mid-way.
    statement_timeout: 120_000,
  })

  await client.connect()

  const { rows: version } = await client.query('select version()')
  console.log(`Connected: ${String(version[0].version).split(' ').slice(0, 2).join(' ')}`)

  // Ledger of what has been applied. Mirrors the Supabase CLI's own table so a
  // project managed with either tool stays consistent.
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version     text primary key,
      name        text,
      applied_at  timestamptz not null default now()
    );
  `)

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort()

  const { rows: applied } = await client.query<{ version: string }>(
    'select version from supabase_migrations.schema_migrations',
  )
  const done = new Set(applied.map((row) => row.version))

  const pending = files.filter((file) => !done.has(file.split('_')[0]!))

  if (pending.length === 0) {
    console.log(`Nothing to apply — all ${files.length} migrations are already recorded.`)
    await client.end()
    return
  }

  console.log(`\n${pending.length} migration(s) to apply:`)
  for (const file of pending) console.log(`  ${file}`)

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing was applied.')
    await client.end()
    return
  }

  console.log('')
  for (const file of pending) {
    const version = file.split('_')[0]!
    const sql = await readFile(resolve(MIGRATIONS_DIR, file), 'utf8')

    process.stdout.write(`  applying ${file} ... `)
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query(
        `insert into supabase_migrations.schema_migrations (version, name)
         values ($1, $2) on conflict (version) do nothing`,
        [version, file],
      )
      await client.query('commit')
      console.log('ok')
    } catch (error) {
      await client.query('rollback')
      console.log('FAILED')
      console.error(`\n${file} failed and was rolled back:\n`)
      console.error(error instanceof Error ? error.message : error)
      console.error('\nThe schema is unchanged by this migration. Fix it and re-run.')
      await client.end()
      process.exit(1)
    }
  }

  console.log('\nAll migrations applied. Run `npm run supabase:verify` next.')
  await client.end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
