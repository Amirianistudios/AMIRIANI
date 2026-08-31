import { NextResponse } from 'next/server'
import { z } from 'zod'

import { rateLimit } from '@/lib/rate-limit'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  comment: z.string().trim().max(5000).optional(),
})

/**
 * Contact form submissions.
 *
 * Stored in site_settings under a `contact_submissions` key rather than a
 * dedicated table: the volume is low and this keeps the schema focused. Move it
 * to its own table if it ever needs searching or status tracking.
 */
export async function POST(request: Request) {
  const limited = await rateLimit(request, 'contact', { limit: 5, windowMs: 60_000 })
  if (limited) return limited

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please provide a valid email address.' },
      { status: 400 },
    )
  }

  const supabase = createSupabaseAdminClient()

  const { data: existing } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'contact_submissions')
    .maybeSingle()

  const submissions = Array.isArray((existing?.value as { items?: unknown[] })?.items)
    ? ((existing!.value as { items: unknown[] }).items as unknown[])
    : []

  // Keep the most recent 500 so the row cannot grow without bound.
  const next = [
    { ...parsed.data, received_at: new Date().toISOString() },
    ...submissions,
  ].slice(0, 500)

  const { error } = await supabase
    .from('site_settings')
    .upsert({ key: 'contact_submissions', value: { items: next } }, { onConflict: 'key' })

  if (error) {
    console.error('contact: store failed', error)
    return NextResponse.json({ error: 'Could not send your message.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
