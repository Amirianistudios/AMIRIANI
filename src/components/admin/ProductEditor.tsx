'use client'

import { ActionForm, Field, inputClass } from '@/components/admin/ActionForm'
import { setInventory, updateProduct, updateVariantPrice } from '@/app/admin/actions'
import { Card } from '@/components/admin/ui'
import type { ProductRow } from '@/types/database'

interface VariantSummary {
  id: string
  title: string
  sku: string | null
  price_cents: number
  compare_at_cents: number | null
  inventory_quantity: number
}

/** Prices are edited in major units and converted at the boundary. */
function toMajor(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2)
}

export function ProductEditor({
  product,
  variants,
}: {
  product: ProductRow
  variants: VariantSummary[]
}) {
  return (
    <div className="tw:grid tw:gap-6 tw:lg:grid-cols-2">
      <Card>
        <h2 className="tw:mb-4 tw:font-medium">Details</h2>
        <ActionForm action={updateProduct}>
          <input type="hidden" name="productId" value={product.id} />

          <Field label="Title">
            <input name="title" defaultValue={product.title} className={inputClass} required />
          </Field>

          <Field label="Status">
            <select name="status" defaultValue={product.status} className={inputClass}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </Field>

          <Field label="Description (HTML)">
            <textarea
              name="descriptionHtml"
              defaultValue={product.description_html ?? ''}
              rows={10}
              className={`${inputClass} tw:font-mono tw:text-xs`}
            />
          </Field>

          <Field label="SEO title">
            <input name="seoTitle" defaultValue={product.seo_title ?? ''} className={inputClass} />
          </Field>

          <Field label="SEO description">
            <textarea
              name="seoDescription"
              defaultValue={product.seo_description ?? ''}
              rows={3}
              className={inputClass}
            />
          </Field>

          <label className="tw:flex tw:items-center tw:gap-2 tw:text-sm">
            <input type="checkbox" name="featured" defaultChecked={product.featured} />
            Featured
          </label>
        </ActionForm>
      </Card>

      <div className="tw:flex tw:flex-col tw:gap-4">
        {variants.map((variant) => (
          <Card key={variant.id}>
            <h3 className="tw:mb-3 tw:font-medium">
              {variant.title}
              {variant.sku && (
                <span className="tw:ml-2 tw:text-xs tw:font-normal tw:text-zinc-500">
                  {variant.sku}
                </span>
              )}
            </h3>

            <div className="tw:grid tw:gap-4 tw:sm:grid-cols-2">
              <ActionForm action={updateVariantPrice} submitLabel="Save price">
                <input type="hidden" name="variantId" value={variant.id} />
                <Field label="Price (€)">
                  <input
                    name="priceCents"
                    type="number"
                    step="1"
                    min="0"
                    defaultValue={variant.price_cents}
                    className={inputClass}
                    required
                  />
                  <span className="tw:mt-1 tw:block tw:text-xs tw:text-zinc-500">
                    In cents — currently {toMajor(variant.price_cents)}
                  </span>
                </Field>
                <Field label="Compare-at (cents, optional)">
                  <input
                    name="compareAtCents"
                    type="number"
                    step="1"
                    min="0"
                    defaultValue={variant.compare_at_cents ?? ''}
                    className={inputClass}
                  />
                </Field>
              </ActionForm>

              <ActionForm action={setInventory} submitLabel="Save stock">
                <input type="hidden" name="variantId" value={variant.id} />
                <Field label="In stock">
                  <input
                    name="quantity"
                    type="number"
                    step="1"
                    min="0"
                    defaultValue={variant.inventory_quantity}
                    className={inputClass}
                    required
                  />
                  <span className="tw:mt-1 tw:block tw:text-xs tw:text-zinc-500">
                    Changes are recorded in the inventory journal.
                  </span>
                </Field>
              </ActionForm>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
