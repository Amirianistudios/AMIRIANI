'use client'

import { createBrowserClient } from '@supabase/ssr'

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env'
import type { Database } from '@/types/database'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

/** Browser client, used only for auth flows (sign in, sign up, reset). */
export function createSupabaseBrowserClient() {
  client ??= createBrowserClient<Database>(SUPABASE_URL(), SUPABASE_ANON_KEY())
  return client
}
