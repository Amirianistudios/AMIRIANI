import 'server-only'

import { cache } from 'react'

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server'
import type { CustomerRow } from '@/types/database'

/** The signed-in Supabase auth user, or null. */
export const getUser = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * The customer record for the signed-in user, creating it on first sign-in.
 *
 * Supabase Auth owns identity; `customers` owns the commerce profile. They are
 * linked by user_id, and the row is created lazily so a customer exists the
 * first time someone signs in without needing a database trigger on auth.users.
 */
export const getCurrentCustomer = cache(async (): Promise<CustomerRow | null> => {
  const user = await getUser()
  if (!user) return null

  const supabase = await createSupabaseServerClient()
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) return existing

  // Creating the row needs to bypass RLS, since no customer row exists yet for
  // this user to be matched against.
  const admin = createSupabaseAdminClient()

  // An account may already exist from a guest order placed with this address;
  // claim it rather than creating a duplicate.
  const { data: byEmail } = await admin
    .from('customers')
    .select('*')
    .eq('email', user.email ?? '')
    .maybeSingle()

  if (byEmail) {
    const { data: claimed } = await admin
      .from('customers')
      .update({ user_id: user.id })
      .eq('id', byEmail.id)
      .select('*')
      .single()
    return claimed ?? byEmail
  }

  const metadata = user.user_metadata as { first_name?: string; last_name?: string }
  const { data: created, error } = await admin
    .from('customers')
    .insert({
      user_id: user.id,
      email: user.email ?? '',
      first_name: metadata?.first_name ?? null,
      last_name: metadata?.last_name ?? null,
    })
    .select('*')
    .single()

  if (error) {
    console.error('getCurrentCustomer: could not create customer', error)
    return null
  }
  return created
})

/** True when the signed-in user is an admin. Reads the private admin_users table. */
export const isAdmin = cache(async (): Promise<boolean> => {
  const user = await getUser()
  if (!user) return false

  // Checked with the service role against admin_users, so admin status can
  // never be spoofed by a JWT claim the client controls.
  const admin = createSupabaseAdminClient()
  const { data } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return Boolean(data)
})
