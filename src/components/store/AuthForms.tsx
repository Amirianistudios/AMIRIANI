'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Customer auth forms.
 *
 * Supabase Auth handles credentials; this file only collects input and renders
 * results. Error messages are deliberately generic on sign-in and sign-up so
 * the forms cannot be used to discover which addresses have accounts.
 */

function useAuthState() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  return { busy, setBusy, message, setMessage }
}

function Message({ message }: { message: { text: string; error: boolean } | null }) {
  if (!message) return null
  return (
    <div
      className={message.error ? 'form__message form__message--error' : 'form__message'}
      role={message.error ? 'alert' : 'status'}
    >
      {message.text}
    </div>
  )
}

export function LoginForm() {
  const { busy, setBusy, message, setMessage } = useAuthState()
  const router = useRouter()

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const form = new FormData(event.currentTarget)
    setBusy(true)
    setMessage(null)

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    })

    if (error) {
      setMessage({ text: 'Incorrect email or password.', error: true })
      setBusy(false)
      return
    }

    router.push('/account')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Message message={message} />
      <div className="field">
        <input
          className="field__input"
          type="email"
          id="login-email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          required
        />
        <label className="field__label" htmlFor="login-email">Email</label>
      </div>
      <div className="field">
        <input
          className="field__input"
          type="password"
          id="login-password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          required
        />
        <label className="field__label" htmlFor="login-password">Password</label>
      </div>
      <button type="submit" className="button button--full-width" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

export function RegisterForm() {
  const { busy, setBusy, message, setMessage } = useAuthState()

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const form = new FormData(event.currentTarget)
    const password = String(form.get('password') ?? '')

    if (password.length < 8) {
      setMessage({ text: 'Please use at least 8 characters.', error: true })
      return
    }

    setBusy(true)
    setMessage(null)

    const supabase = createSupabaseBrowserClient()
    const { error } = await supabase.auth.signUp({
      email: String(form.get('email') ?? ''),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          first_name: String(form.get('first_name') ?? ''),
          last_name: String(form.get('last_name') ?? ''),
        },
      },
    })

    setBusy(false)

    if (error) {
      setMessage({ text: 'Could not create the account. Please try again.', error: true })
      return
    }

    // Same message whether or not the address was already registered.
    setMessage({
      text: 'Check your inbox to confirm your email address.',
      error: false,
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Message message={message} />
      <div className="contact__fields">
        <div className="field">
          <input
            className="field__input"
            type="text"
            id="register-first"
            name="first_name"
            placeholder="First name"
            autoComplete="given-name"
          />
          <label className="field__label" htmlFor="register-first">First name</label>
        </div>
        <div className="field">
          <input
            className="field__input"
            type="text"
            id="register-last"
            name="last_name"
            placeholder="Last name"
            autoComplete="family-name"
          />
          <label className="field__label" htmlFor="register-last">Last name</label>
        </div>
      </div>
      <div className="field">
        <input
          className="field__input"
          type="email"
          id="register-email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          required
        />
        <label className="field__label" htmlFor="register-email">Email</label>
      </div>
      <div className="field">
        <input
          className="field__input"
          type="password"
          id="register-password"
          name="password"
          placeholder="Password"
          autoComplete="new-password"
          minLength={8}
          required
        />
        <label className="field__label" htmlFor="register-password">
          Password (8 characters or more)
        </label>
      </div>
      <button type="submit" className="button button--full-width" disabled={busy}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
    </form>
  )
}

export function ResetForm() {
  const { busy, setBusy, message, setMessage } = useAuthState()

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const form = new FormData(event.currentTarget)
    setBusy(true)
    setMessage(null)

    const supabase = createSupabaseBrowserClient()
    await supabase.auth.resetPasswordForEmail(String(form.get('email') ?? ''), {
      redirectTo: `${window.location.origin}/auth/callback?next=/account`,
    })

    setBusy(false)
    // Reported identically whether or not the address exists.
    setMessage({
      text: 'If that address has an account, a reset link is on its way.',
      error: false,
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Message message={message} />
      <div className="field">
        <input
          className="field__input"
          type="email"
          id="reset-email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          required
        />
        <label className="field__label" htmlFor="reset-email">Email</label>
      </div>
      <button type="submit" className="button button--full-width" disabled={busy}>
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  )
}

export function SignOutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      className="underlined-link"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        await createSupabaseBrowserClient().auth.signOut()
        router.push('/')
        router.refresh()
      }}
    >
      Sign out
    </button>
  )
}
