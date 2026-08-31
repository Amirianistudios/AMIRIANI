/**
 * Environment access.
 *
 * Public values are read through `process.env.NEXT_PUBLIC_*` so Next can
 * statically inline them. Secrets are read lazily and only ever from server
 * code — `requireServerEnv` throws if it is somehow reached in the browser,
 * which turns a leak into a crash rather than a silent exposure.
 */

function readPublic(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    )
  }
  return value
}

export const SUPABASE_URL = () =>
  readPublic('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)

export const SUPABASE_ANON_KEY = () =>
  readPublic(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )

export const SITE_URL = () =>
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? 'http://localhost:3000'

function requireServerEnv(name: string): string {
  if (typeof window !== 'undefined') {
    throw new Error(`${name} must never be read in the browser`)
  }
  const value = process.env[name]
  if (!value) throw new Error(`Missing server environment variable ${name}`)
  return value
}

export const SUPABASE_SERVICE_ROLE_KEY = () =>
  requireServerEnv('SUPABASE_SERVICE_ROLE_KEY')

export const STRIPE_SECRET_KEY = () => requireServerEnv('STRIPE_SECRET_KEY')

export const STRIPE_WEBHOOK_SECRET = () =>
  requireServerEnv('STRIPE_WEBHOOK_SECRET')

/** Flat shipping rate in minor units, configurable without a code change. */
export const SHIPPING_FLAT_RATE_CENTS = () =>
  Number(process.env.SHIPPING_FLAT_RATE_CENTS ?? '495')

/** Order subtotal at or above which shipping is free. */
export const FREE_SHIPPING_THRESHOLD_CENTS = () =>
  Number(process.env.FREE_SHIPPING_THRESHOLD_CENTS ?? '10000')
