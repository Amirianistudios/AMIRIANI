import { NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit } from '@/lib/rate-limit'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: z.string().trim().email().max(200),
  source: z.string().trim().max(40).optional(),
})

export async function POST(request: Request) {
  const limited = await rateLimit(request, 'newsletter', { limit: 5, windowMs: 60_000 })
  if (limited) return limited

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from('newsletter_subscribers')
    .upsert(
      { email: parsed.data.email, source: parsed.data.source ?? 'footer' },
      { onConflict: 'email', ignoreDuplicates: true },
    )

  if (error) {
    console.error('newsletter: subscribe failed', error)
    return NextResponse.json({ error: 'Could not subscribe right now.' }, { status: 500 })
  }

  // Always the same response whether or not the address was already on the
  // list, so the endpoint cannot be used to test who is subscribed.
  return NextResponse.json({ ok: true })
}
