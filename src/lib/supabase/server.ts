import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import {
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Request-scoped client that carries the visitor's auth cookies.
 *
 * Everything it reads or writes is subject to Row Level Security, which is the
 * point: a bug in a page cannot read another customer's orders.
 */
export async function createSupabaseServerClient(): Promise<
  SupabaseClient<Database>
> {
  const cookieStore = await cookies()

  return createServerClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh is handled by middleware, so this is safe to skip.
        }
      },
    },
  })
}

/**
 * Read-only client for public catalogue data on cached pages.
 *
 * Uses the anon key with no cookie access, so it never varies per user and
 * pages built with it stay statically cacheable.
 */
export function createSupabasePublicClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only for trusted server paths that need it: the checkout route, the Stripe
 * webhook, cart mutations against anonymous token-addressed carts, and the
 * importer. Never import this into a Client Component.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
