'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export function AdminLoginForm() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError(null)

    const supabase = createSupabaseBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    })

    if (authError) {
      setError('Incorrect email or password.')
      setBusy(false)
      return
    }

    // The layout re-checks admin status server-side and bounces back here if
    // this account is not an admin.
    router.push('/admin')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="tw:flex tw:flex-col tw:gap-3">
      {error && (
        <p className="tw:rounded tw:bg-red-50 tw:px-3 tw:py-2 tw:text-sm tw:text-red-800" role="alert">
          {error}
        </p>
      )}
      <input
        className="tw:rounded tw:border tw:border-zinc-300 tw:px-3 tw:py-2 tw:text-sm"
        type="email"
        name="email"
        placeholder="Email"
        autoComplete="email"
        required
      />
      <input
        className="tw:rounded tw:border tw:border-zinc-300 tw:px-3 tw:py-2 tw:text-sm"
        type="password"
        name="password"
        placeholder="Password"
        autoComplete="current-password"
        required
      />
      <button
        type="submit"
        disabled={busy}
        className="tw:rounded tw:bg-zinc-900 tw:px-4 tw:py-2 tw:text-sm tw:text-white tw:hover:bg-zinc-700 tw:disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}
