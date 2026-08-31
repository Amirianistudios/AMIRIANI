/**
 * Grants admin access to a Supabase Auth user.
 *
 *   npx tsx scripts/grant-admin.ts you@example.com
 *
 * Admin status lives in the private `admin_users` table, which nothing in the
 * browser can write, so this is the only way to create the first admin. The
 * user must already have signed up (via /account/register or the Supabase
 * dashboard) before being granted.
 */

import { createClient } from '@supabase/supabase-js'

const email = process.argv[2]
if (!email) {
  console.error('Usage: npx tsx scripts/grant-admin.ts <email>')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })

async function main() {
  // listUsers is paginated; walk until the address is found.
  let page = 1
  let userId: string | undefined

  while (!userId) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    if (data.users.length === 0) break

    userId = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    )?.id
    page += 1
  }

  if (!userId) {
    console.error(
      `No user with email ${email}. Have them sign up at /account/register first.`,
    )
    process.exit(1)
  }

  const { error } = await supabase
    .from('admin_users')
    .upsert({ user_id: userId, email, role: 'admin' }, { onConflict: 'user_id' })

  if (error) throw new Error(error.message)
  console.log(`${email} can now sign in at /admin`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
