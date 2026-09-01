'use client'

import { ActionForm, Field, inputClass } from '@/components/admin/ActionForm'
import {
  createVariant,
  setInventory,
  setProductCollections,
  updateProduct,
  updateVariantPrice,
  uploadProductImage,
} from '@/app/admin/actions'
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

interface ImageSummary {
  id: string
  url: string
  alt: string | null
  is_primary: boolean
}

interface CollectionSummary {
  id: string
  title: string
  member: boolean
}

/** Prices are edited in major units and converted at the boundary. */
function toMajor(cents: number | null): string {
  return cents === null ? '' : (cents / 100).toFixed(2)
}

export function ProductEditor({
  product,
  variants,
  images,
  collections,
}: {
  product: ProductRow
  variants: VariantSummary[]
  images: ImageSummary[]
  collections: CollectionSummary[]
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

      <Card>
        <h2 className="tw:mb-4 tw:font-medium">Collections</h2>

        {collections.length === 0 ? (
          <p className="tw:text-sm tw:text-zinc-500">No collections exist yet.</p>
        ) : (
          <ActionForm action={setProductCollections} submitLabel="Save collections">
            <input type="hidden" name="productId" value={product.id} />
            {collections.map((collection) => (
              <label key={collection.id} className="tw:mb-2 tw:flex tw:items-center tw:gap-2 tw:text-sm">
                <input
                  type="checkbox"
                  name="collectionId"
                  value={collection.id}
                  defaultChecked={collection.member}
                />
                {collection.title}
              </label>
            ))}
            <p className="tw:mt-2 tw:text-xs tw:text-zinc-500">
              Saving replaces the product&rsquo;s membership with exactly what is
              ticked here, so unticking removes it from that collection.
            </p>
          </ActionForm>
        )}
      </Card>

      <Card>
        <h2 className="tw:mb-4 tw:font-medium">Images</h2>

        {images.length > 0 && (
          <ul className="tw:mb-4 tw:grid tw:grid-cols-4 tw:gap-2">
            {images.map((image) => (
              <li key={image.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- an
                    admin thumbnail of an already-stored file; the optimiser
                    adds a round trip and nothing else here. */}
                <img
                  src={image.url}
                  alt={image.alt ?? ''}
                  className="tw:aspect-square tw:w-full tw:rounded tw:object-cover"
                />
                {image.is_primary && (
                  <span className="tw:mt-1 tw:block tw:text-center tw:text-[10px] tw:text-zinc-500">
                    primary
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        <ActionForm action={uploadProductImage} submitLabel="Upload image">
          <input type="hidden" name="productId" value={product.id} />
          <Field label="File">
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              className={inputClass}
              required
            />
            <span className="tw:mt-1 tw:block tw:text-xs tw:text-zinc-500">
              JPEG, PNG, WebP, AVIF or GIF, up to 20 MB. Goes into Supabase
              Storage; the first image uploaded becomes the one shown in grids.
            </span>
          </Field>
          <Field label="Alt text">
            <input name="alt" className={inputClass} maxLength={300} />
          </Field>
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

        <Card>
          <h3 className="tw:mb-3 tw:font-medium">Add a variant</h3>
          <ActionForm action={createVariant} submitLabel="Add variant">
            <input type="hidden" name="productId" value={product.id} />
            <div className="tw:grid tw:gap-4 tw:sm:grid-cols-2">
              <Field label="Title">
                <input name="title" className={inputClass} required maxLength={200} placeholder="M" />
              </Field>
              <Field label="SKU (optional)">
                <input name="sku" className={inputClass} maxLength={100} />
              </Field>
              <Field label="Price (cents)">
                <input
                  name="priceCents"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={variants[0]?.price_cents ?? 0}
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Opening stock">
                <input
                  name="quantity"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={0}
                  className={inputClass}
                />
                <span className="tw:mt-1 tw:block tw:text-xs tw:text-zinc-500">
                  Recorded in the inventory journal, not written directly.
                </span>
              </Field>
            </div>
          </ActionForm>
        </Card>
      </div>
    </div>
  )
}
