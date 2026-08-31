'use client'

import { useState } from 'react'

/**
 * Contact form.
 *
 * Same field structure and Dawn classes as the reference store. Submissions go
 * to /api/contact, which validates and stores them; on the reference store the
 * equivalent went to Shopify's inbox.
 */
export function ContactForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state === 'sending') return

    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))

    setState('sending')
    setMessage(null)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const payload = (await res.json()) as { error?: string }

      if (!res.ok) {
        setState('error')
        setMessage(payload.error ?? 'Something went wrong. Please try again.')
        return
      }

      setState('done')
      setMessage('Thanks — we will be in touch.')
      form.reset()
    } catch {
      setState('error')
      setMessage('Network error. Please try again.')
    }
  }

  return (
    <form className="isolate scroll-trigger animate--slide-in" onSubmit={onSubmit} noValidate>
      {message && (
        <div
          className={
            state === 'error'
              ? 'form__message form__message--error'
              : 'form-status form__message'
          }
          role="status"
        >
          {message}
        </div>
      )}

      <div className="contact__fields">
        <div className="field">
          <input
            className="field__input"
            autoComplete="name"
            type="text"
            id="ContactForm-name"
            name="name"
            placeholder="Name"
          />
          <label className="field__label" htmlFor="ContactForm-name">
            Name
          </label>
        </div>

        <div className="field">
          <input
            autoComplete="email"
            type="email"
            id="ContactForm-email"
            className="field__input"
            name="email"
            spellCheck={false}
            autoCapitalize="off"
            aria-required="true"
            placeholder="Email"
            required
          />
          <label className="field__label" htmlFor="ContactForm-email">
            Email <span aria-hidden="true">*</span>
          </label>
        </div>
      </div>

      <div className="field">
        <input
          type="tel"
          id="ContactForm-phone"
          className="field__input"
          autoComplete="tel"
          name="phone"
          pattern="[0-9\-]*"
          placeholder="Phone number"
        />
        <label className="field__label" htmlFor="ContactForm-phone">
          Phone number
        </label>
      </div>

      <div className="field">
        <textarea
          rows={10}
          id="ContactForm-body"
          className="text-area field__input"
          name="comment"
          placeholder="Comment"
        />
        <label className="form__label field__label" htmlFor="ContactForm-body">
          Comment
        </label>
      </div>

      <div className="contact__button">
        <button type="submit" className="button" disabled={state === 'sending'}>
          Send
        </button>
      </div>
    </form>
  )
}
