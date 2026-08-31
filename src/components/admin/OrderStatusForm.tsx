'use client'

import { ActionForm, Field, inputClass } from '@/components/admin/ActionForm'
import { updateOrderStatus } from '@/app/admin/actions'

export function OrderStatusForm({
  orderId,
  fulfilmentStatus,
  status,
}: {
  orderId: string
  fulfilmentStatus: string
  status: string
}) {
  return (
    <ActionForm action={updateOrderStatus}>
      <input type="hidden" name="orderId" value={orderId} />

      <Field label="Fulfilment status">
        <select name="fulfilmentStatus" defaultValue={fulfilmentStatus} className={inputClass}>
          <option value="unfulfilled">Unfulfilled</option>
          <option value="partially_fulfilled">Partially fulfilled</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="delivered">Delivered</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </Field>

      <Field label="Order status">
        <select name="status" defaultValue={status} className={inputClass}>
          <option value="pending">Pending</option>
          <option value="open">Open</option>
          <option value="cancelled">Cancelled</option>
          <option value="archived">Archived</option>
        </select>
      </Field>

      <p className="tw:text-xs tw:text-zinc-500">
        Setting the order to cancelled returns its items to stock.
      </p>
    </ActionForm>
  )
}
