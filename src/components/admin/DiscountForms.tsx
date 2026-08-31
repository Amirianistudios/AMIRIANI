'use client'

import { ActionForm, Field, inputClass } from '@/components/admin/ActionForm'
import { createDiscount, toggleDiscount } from '@/app/admin/actions'
import { Badge, Card, Table, Td } from '@/components/admin/ui'
import { formatMoney } from '@/lib/money'
import type { DiscountCodeRow } from '@/types/database'

export function DiscountForms({ discounts }: { discounts: DiscountCodeRow[] }) {
  return (
    <div className="tw:grid tw:gap-6 tw:lg:grid-cols-[380px_1fr]">
      <Card>
        <h2 className="tw:mb-4 tw:font-medium">New discount</h2>
        <ActionForm action={createDiscount} submitLabel="Create">
          <Field label="Code">
            <input name="code" className={inputClass} placeholder="QUIET10" required />
          </Field>

          <Field label="Type">
            <select name="kind" className={inputClass} defaultValue="percentage">
              <option value="percentage">Percentage off</option>
              <option value="fixed_amount">Fixed amount off (cents)</option>
              <option value="free_shipping">Free shipping</option>
            </select>
          </Field>

          <Field label="Value">
            <input name="value" type="number" step="0.01" min="0" className={inputClass} required />
            <span className="tw:mt-1 tw:block tw:text-xs tw:text-zinc-500">
              1–100 for a percentage, or an amount in cents.
            </span>
          </Field>

          <Field label="Minimum subtotal (cents)">
            <input
              name="minimumSubtotalCents"
              type="number"
              step="1"
              min="0"
              defaultValue={0}
              className={inputClass}
            />
          </Field>

          <Field label="Usage limit (optional)">
            <input name="usageLimit" type="number" step="1" min="1" className={inputClass} />
          </Field>

          <Field label="Starts">
            <input name="startsAt" type="datetime-local" className={inputClass} />
          </Field>

          <Field label="Ends (optional)">
            <input name="endsAt" type="datetime-local" className={inputClass} />
          </Field>
        </ActionForm>
      </Card>

      <Table
        head={['Code', 'Type', 'Value', 'Used', 'Window', 'Active', '']}
        empty="No discount codes yet."
      >
        {discounts.map((discount) => (
          <tr key={discount.id}>
            <Td className="tw:font-mono">{discount.code}</Td>
            <Td>{discount.kind.replace('_', ' ')}</Td>
            <Td>
              {discount.kind === 'percentage'
                ? `${discount.value}%`
                : discount.kind === 'fixed_amount'
                  ? formatMoney(Number(discount.value))
                  : '—'}
            </Td>
            <Td>
              {discount.times_used}
              {discount.usage_limit ? ` / ${discount.usage_limit}` : ''}
            </Td>
            <Td className="tw:text-xs">
              {new Date(discount.starts_at).toLocaleDateString('en-GB')}
              {discount.ends_at
                ? ` – ${new Date(discount.ends_at).toLocaleDateString('en-GB')}`
                : ' – no end'}
            </Td>
            <Td>
              <Badge tone={discount.active ? 'green' : 'zinc'}>
                {discount.active ? 'active' : 'paused'}
              </Badge>
            </Td>
            <Td>
              <ActionForm action={toggleDiscount} submitLabel={discount.active ? 'Pause' : 'Resume'}>
                <input type="hidden" name="id" value={discount.id} />
              </ActionForm>
            </Td>
          </tr>
        ))}
      </Table>
    </div>
  )
}
