'use client'

import { useState } from 'react'

import { ActionForm, Field, inputClass } from '@/components/admin/ActionForm'
import { createProduct } from '@/app/admin/actions'
import { Card } from '@/components/admin/ui'

/**
 * Adds a product to the catalogue.
 *
 * Collapsed by default so it does not compete with the list for attention —
 * reading the catalogue is the common case, adding to it is not.
 *
 * New products are created as drafts. A product needs a price, a photograph
 * and probably a collection before it should be public, and none of those can
 * be supplied here; publishing is a deliberate second step on the product's
 * own page.
 */
export function NewProductForm() {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="tw:mb-4 tw:rounded tw:bg-zinc-900 tw:px-4 tw:py-2 tw:text-sm tw:text-white tw:hover:bg-zinc-700"
      >
        New product
      </button>
    )
  }

  return (
    <div className="tw:mb-6">
      <Card>
        <div className="tw:mb-4 tw:flex tw:items-center tw:justify-between">
          <h2 className="tw:font-medium">New product</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="tw:text-sm tw:text-zinc-500 tw:underline"
          >
            Cancel
          </button>
        </div>

        <ActionForm action={createProduct} submitLabel="Create draft">
          <Field label="Title">
            <input name="title" className={inputClass} required maxLength={300} />
          </Field>

          <Field label="URL handle (optional)">
            <input name="slug" className={inputClass} maxLength={200} placeholder="derived from the title" />
            <span className="tw:mt-1 tw:block tw:text-xs tw:text-zinc-500">
              Becomes /products/&lt;handle&gt;. Leave blank to derive it.
            </span>
          </Field>

          <Field label="Description (HTML)">
            <textarea
              name="descriptionHtml"
              rows={5}
              className={`${inputClass} tw:font-mono tw:text-xs`}
            />
          </Field>

          <p className="tw:text-xs tw:text-zinc-500">
            Created as a draft with one €0.00 variant. Set the price, add images
            and publish on the product page.
          </p>
        </ActionForm>
      </Card>
    </div>
  )
}
