import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Auth callback.
 *
 * Supabase redirects here after email confirmation or a password reset with a
 * one-time code, which is exchanged for a session cookie.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/account'

  // Only same-origin relative paths, so the callback cannot be used as an open
  // redirect to an attacker's site.
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/account'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.redirect(new URL('/account/login?error=link', url.origin))
    }
  }

  return NextResponse.redirect(new URL(destination, url.origin))
}
