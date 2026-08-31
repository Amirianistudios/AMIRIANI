import Link from 'next/link'

import { Badge, PageHeader, Table, Td, paymentTone } from '@/components/admin/ui'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'
import type { PaymentStatus } from '@/types/database'

const PAYMENT_STATUSES: PaymentStatus[] = [
  'unpaid',
  'authorized',
  'paid',
  'partially_refunded',
  'refunded',
  'failed',
]

export const dynamic = 'force-dynamic'

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const { q, status } = await searchParams
  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from('orders')
    .select('id, order_number, email, created_at, total_cents, currency, payment_status, fulfilment_status')
    .order('created_at', { ascending: false })
    .limit(100)

  // Only accept a value the enum actually has, so a crafted query string
  // cannot reach the database as an unexpected filter.
  const statusFilter = PAYMENT_STATUSES.find((s) => s === status)
  if (statusFilter) query = query.eq('payment_status', statusFilter)
  if (q) {
    // Escape the LIKE wildcards so a search term cannot broaden the match.
    const term = q.trim().replace(/[%_]/g, (m) => `\\${m}`)
    query = query.or(`order_number.ilike.%${term}%,email.ilike.%${term}%`)
  }

  const { data: orders } = await query

  return (
    <>
      <PageHeader title="Orders" description="Search by order number or customer email." />

      <form className="tw:mb-4 tw:flex tw:gap-2" action="/admin/orders">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search orders"
          className="tw:w-64 tw:rounded tw:border tw:border-zinc-300 tw:px-3 tw:py-2 tw:text-sm"
        />
        <select
          name="status"
          defaultValue={status ?? ''}
          className="tw:rounded tw:border tw:border-zinc-300 tw:px-3 tw:py-2 tw:text-sm"
        >
          <option value="">Any payment status</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
          <option value="refunded">Refunded</option>
          <option value="failed">Failed</option>
        </select>
        <button className="tw:rounded tw:bg-zinc-900 tw:px-4 tw:py-2 tw:text-sm tw:text-white">
          Search
        </button>
      </form>

      <Table
        head={['Order', 'Email', 'Date', 'Payment', 'Fulfilment', 'Total']}
        empty="No orders match."
      >
        {(orders ?? []).map((order) => (
          <tr key={order.id}>
            <Td>
              <Link href={`/admin/orders/${order.id}`} className="tw:underline">
                {order.order_number}
              </Link>
            </Td>
            <Td>{order.email}</Td>
            <Td>{new Date(order.created_at).toLocaleString('en-GB')}</Td>
            <Td><Badge tone={paymentTone(order.payment_status)}>{order.payment_status}</Badge></Td>
            <Td><Badge>{order.fulfilment_status}</Badge></Td>
            <Td>{formatMoney(order.total_cents, order.currency)}</Td>
          </tr>
        ))}
      </Table>
    </>
  )
}
