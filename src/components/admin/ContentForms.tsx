'use client'

import { useState } from 'react'

import { ActionForm, Field, inputClass } from '@/components/admin/ActionForm'
import { updateContentPage, updateHomepage } from '@/app/admin/actions'
import { Card } from '@/components/admin/ui'
import type { ContentPageRow } from '@/types/database'

export function ContentForms({
  pages,
  banner,
  featured,
}: {
  pages: ContentPageRow[]
  banner: Record<string, string>
  featured: Record<string, string>
}) {
  const [selected, setSelected] = useState(pages[0]?.id ?? '')
  const page = pages.find((p) => p.id === selected) ?? pages[0]

  return (
    <div className="tw:grid tw:gap-6 tw:lg:grid-cols-2">
      <Card>
        <h2 className="tw:mb-4 tw:font-medium">Homepage</h2>
        <ActionForm action={updateHomepage}>
          <Field label="Hero heading">
            <input name="bannerHeading" defaultValue={banner.heading ?? ''} className={inputClass} />
          </Field>
          <Field label="Hero button label">
            <input name="bannerCtaLabel" defaultValue={banner.cta_label ?? ''} className={inputClass} />
          </Field>
          <Field label="Hero button link">
            <input name="bannerCtaHref" defaultValue={banner.cta_href ?? '/collections/all'} className={inputClass} />
          </Field>
          <Field label="Featured section title">
            <input name="featuredTitle" defaultValue={featured.title ?? ''} className={inputClass} />
          </Field>
          <Field label="Featured section description">
            <textarea
              name="featuredDescription"
              defaultValue={featured.description ?? ''}
              rows={3}
              className={inputClass}
            />
          </Field>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="tw:mb-4 tw:font-medium">Pages and policies</h2>

        <label className="tw:mb-4 tw:block">
          <span className="tw:mb-1 tw:block tw:text-xs tw:font-medium tw:text-zinc-600">Page</span>
          <select
            className={inputClass}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.kind === 'policy' ? 'Policy' : 'Page'} — {p.title}
              </option>
            ))}
          </select>
        </label>

        {page && (
          // Remount on selection so the uncontrolled fields pick up new values.
          <ActionForm key={page.id} action={updateContentPage}>
            <input type="hidden" name="id" value={page.id} />
            <Field label="Title">
              <input name="title" defaultValue={page.title} className={inputClass} required />
            </Field>
            <Field label="Body (HTML)">
              <textarea
                name="bodyHtml"
                defaultValue={page.body_html ?? ''}
                rows={16}
                className={`${inputClass} tw:font-mono tw:text-xs`}
              />
            </Field>
            <label className="tw:flex tw:items-center tw:gap-2 tw:text-sm">
              <input type="checkbox" name="published" defaultChecked={page.published} />
              Published
            </label>
          </ActionForm>
        )}
      </Card>
    </div>
  )
}
