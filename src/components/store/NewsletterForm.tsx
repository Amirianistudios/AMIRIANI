'use client'

import { useState } from 'react'

import { IconArrow } from '@/components/store/Icons'

/**
 * Footer newsletter signup.
 *
 * Same markup as Dawn's `newsletter-form` so the floating label, the inline
 * arrow button and the success message all sit where they do on the reference
 * store. Submissions go to /api/newsletter, which writes to Supabase.
 */
export function NewsletterForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (state === 'sending') return

    setState('sending')
    setMessage(null)

    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const payload = (await res.json()) as { error?: string }

      if (!res.ok) {
        setState('error')
        setMessage(payload.error ?? 'Something went wrong.')
        return
      }

      setState('done')
      setMessage('Thanks for subscribing.')
      setEmail('')
    } catch {
      setState('error')
      setMessage('Network error. Please try again.')
    }
  }

  return (
    <form className="footer__newsletter newsletter-form" onSubmit={onSubmit} noValidate>
      <div className="newsletter-form__field-wrapper">
        <div className="field">
          <input
            id="NewsletterForm--footer"
            type="email"
            name="email"
            className="field__input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-required="true"
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="email"
            placeholder="Email"
            required
          />
          <label className="field__label" htmlFor="NewsletterForm--footer">
            Email
          </label>
          <button
            type="submit"
            className="newsletter-form__button field__button"
            name="commit"
            aria-label="Subscribe"
            disabled={state === 'sending'}
          >
            <span className="svg-wrapper">
              <IconArrow className="icon icon-arrow" />
            </span>
          </button>
        </div>

        {message && (
          <div
            className={
              state === 'error'
                ? 'form__message form__message--error'
                : 'newsletter-form__message form__message'
            }
            role="status"
          >
            {message}
          </div>
        )}
      </div>
    </form>
  )
}
