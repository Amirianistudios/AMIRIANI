import { notFound } from 'next/navigation'

import { OrderStatusForm } from '@/components/admin/OrderStatusForm'
import { Badge, Card, PageHeader, Table, Td, paymentTone } from '@/components/admin/ui'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'
import type { Address } from '@/types/database'

export const dynamic = 'force-dynamic'

function AddressBlock({ address }: { address: Address | null }) {
  if (!address) return <p className="tw:text-sm tw:text-zinc-500">Not provided</p>
  return (
    <address className="tw:text-sm tw:not-italic tw:leading-6">
      {[address.first_name, address.last_name].filter(Boolean).join(' ')}
      <br />
      {address.address1}
      {address.address2 && (<><br />{address.address2}</>)}
      <br />
      {address.postcode} {address.city}
      <br />
      {address.country_code}
      {address.phone && (<><br />{address.phone}</>)}
    </address>
  )
}

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createSupabaseAdminClient()

  const { data: order } = await supabase.from('orders').select('*').eq('id', id).maybeSingle()
  if (!order) notFound()

  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', id)
    .order('created_at', { ascending: true })

  return (
    <>
      <PageHeader
        title={order.order_number}
        description={`${order.email} · ${new Date(order.created_at).toLocaleString('en-GB')}`}
      />

      <div className="tw:mb-6 tw:flex tw:gap-2">
        <Badge tone={paymentTone(order.payment_status)}>payment: {order.payment_status}</Badge>
        <Badge>fulfilment: {order.fulfilment_status}</Badge>
        <Badge>status: {order.status}</Badge>
      </div>

      <div className="tw:mb-6">
        <Table head={['Product', 'Variant', 'SKU', 'Qty', 'Unit', 'Total']}>
          {(items ?? []).map((item) => (
            <tr key={item.id}>
              {/* Rendered from the frozen snapshot, so a later catalogue edit
                  cannot rewrite what this customer actually bought. */}
              <Td>{item.product_title}</Td>
              <Td>{item.variant_title}</Td>
              <Td>{item.sku ?? '—'}</Td>
              <Td>{item.quantity}</Td>
              <Td>{formatMoney(item.unit_price_cents, order.currency)}</Td>
              <Td>{formatMoney(item.subtotal_cents, order.currency)}</Td>
            </tr>
          ))}
        </Table>
      </div>

      <div className="tw:grid tw:gap-4 tw:lg:grid-cols-3">
        <Card>
          <h2 className="tw:mb-3 tw:font-medium">Totals</h2>
          <dl className="tw:space-y-1 tw:text-sm">
            <div className="tw:flex tw:justify-between"><dt>Subtotal</dt><dd>{formatMoney(order.subtotal_cents, order.currency)}</dd></div>
            <div className="tw:flex tw:justify-between"><dt>Discount</dt><dd>-{formatMoney(order.discount_cents, order.currency)}</dd></div>
            <div className="tw:flex tw:justify-between"><dt>Shipping</dt><dd>{formatMoney(order.shipping_cents, order.currency)}</dd></div>
            <div className="tw:flex tw:justify-between"><dt>Tax</dt><dd>{formatMoney(order.tax_cents, order.currency)}</dd></div>
            <div className="tw:flex tw:justify-between tw:border-t tw:border-zinc-200 tw:pt-2 tw:font-medium">
              <dt>Total</dt><dd>{formatMoney(order.total_cents, order.currency)}</dd>
            </div>
          </dl>
          {order.stripe_payment_intent && (
            <p className="tw:mt-3 tw:break-all tw:text-xs tw:text-zinc-500">
              Stripe: {order.stripe_payment_intent}
            </p>
          )}
        </Card>

        <Card>
          <h2 className="tw:mb-3 tw:font-medium">Shipping address</h2>
          <AddressBlock address={order.shipping_address} />
        </Card>

        <Card>
          <h2 className="tw:mb-3 tw:font-medium">Update</h2>
          <OrderStatusForm
            orderId={order.id}
            fulfilmentStatus={order.fulfilment_status}
            status={order.status}
          />
        </Card>
      </div>
    </>
  )
}
