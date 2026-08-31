'use client'

import { useState, useTransition } from 'react'

import type { ActionResult } from '@/app/admin/actions'

/**
 * Wraps a server action in a form that reports success or failure inline.
 *
 * Keeps the admin screens free of repeated pending/error plumbing; the action
 * itself re-checks authorisation server-side.
 */
export function ActionForm({
  action,
  children,
  submitLabel = 'Save',
  className = '',
}: {
  action: (formData: FormData) => Promise<ActionResult>
  children: React.ReactNode
  submitLabel?: string
  className?: string
}) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult | null>(null)

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        setResult(null)
        startTransition(async () => {
          try {
            setResult(await action(formData))
          } catch (error) {
            setResult({
              ok: false,
              error: error instanceof Error ? error.message : 'Something went wrong.',
            })
          }
        })
      }}
    >
      {children}

      <div className="tw:mt-3 tw:flex tw:items-center tw:gap-3">
        <button
          type="submit"
          disabled={pending}
          className="tw:rounded tw:bg-zinc-900 tw:px-4 tw:py-2 tw:text-sm tw:text-white tw:hover:bg-zinc-700 tw:disabled:opacity-60"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>
        {result?.ok && <span className="tw:text-sm tw:text-green-700">Saved.</span>}
        {result && !result.ok && (
          <span className="tw:text-sm tw:text-red-700" role="alert">
            {result.error}
          </span>
        )}
      </div>
    </form>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="tw:mb-3 tw:block">
      <span className="tw:mb-1 tw:block tw:text-xs tw:font-medium tw:text-zinc-600">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'tw:w-full tw:rounded tw:border tw:border-zinc-300 tw:px-3 tw:py-2 tw:text-sm'
