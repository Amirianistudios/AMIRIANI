import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Refreshes the Supabase session cookie on navigation.
 *
 * Next 16 renamed the `middleware` file convention to `proxy`; the behaviour
 * and the `config.matcher` shape are unchanged.
 *
 * Server Components cannot write cookies, so without this an expired access
 * token would never be refreshed and signed-in visitors would be silently
 * logged out. Keep this thin: it runs on every matched request.
 */
export default async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // Touching the user is what performs the refresh.
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, the image optimiser, and the Stripe
     * webhook — which is authenticated by signature, not by cookie, and must
     * not have its raw body touched.
     */
    '/((?!_next/static|_next/image|favicon.ico|payment/|api/webhooks/).*)',
  ],
}
