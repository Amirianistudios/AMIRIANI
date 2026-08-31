import Link from 'next/link'

import { Badge, Card, PageHeader, Stat, Table, Td, paymentTone } from '@/components/admin/ui'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'

export const dynamic = 'force-dynamic'

const LOW_STOCK_THRESHOLD = 5

export default async function AdminDashboard() {
  const supabase = createSupabaseAdminClient()

  const [orders, customers, variants] = await Promise.all([
    supabase
      .from('orders')
      .select('id, order_number, email, created_at, total_cents, currency, payment_status, fulfilment_status')
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('customers').select('id', { count: 'exact', head: true }),
    supabase
      .from('product_variants')
      .select('id, title, inventory_quantity, inventory_tracked, products(title, slug)')
      .eq('inventory_tracked', true)
      .lte('inventory_quantity', LOW_STOCK_THRESHOLD)
      .order('inventory_quantity', { ascending: true })
      .limit(20),
  ])

  const all = orders.data ?? []
  // Revenue counts paid orders only — pending and failed ones are not money.
  const paid = all.filter((o) => o.payment_status === 'paid')
  const revenue = paid.reduce((sum, o) => sum + o.total_cents, 0)
  const unfulfilled = all.filter(
    (o) => o.payment_status === 'paid' && o.fulfilment_status === 'unfulfilled',
  )

  type LowStock = {
    id: string
    title: string
    inventory_quantity: number
    products: { title: string; slug: string } | null
  }
  const lowStock = (variants.data ?? []) as unknown as LowStock[]

  return (
    <>
      <PageHeader title="Dashboard" description="Store activity at a glance." />

      <div className="tw:mb-8 tw:grid tw:gap-4 tw:sm:grid-cols-2 tw:lg:grid-cols-4">
        <Stat label="Revenue" value={formatMoney(revenue)} hint={`${paid.length} paid orders`} />
        <Stat label="Orders" value={String(all.length)} hint="most recent 200" />
        <Stat label="Awaiting fulfilment" value={String(unfulfilled.length)} />
        <Stat label="Customers" value={String(customers.count ?? 0)} />
      </div>

      <h2 className="tw:mb-3 tw:text-lg tw:font-semibold">Recent orders</h2>
      <div className="tw:mb-8">
        <Table head={['Order', 'Email', 'Date', 'Payment', 'Total']} empty="No orders yet.">
          {all.slice(0, 10).map((order) => (
            <tr key={order.id}>
              <Td>
                <Link href={`/admin/orders/${order.id}`} className="tw:underline">
                  {order.order_number}
                </Link>
              </Td>
              <Td>{order.email}</Td>
              <Td>{new Date(order.created_at).toLocaleDateString('en-GB')}</Td>
              <Td>
                <Badge tone={paymentTone(order.payment_status)}>{order.payment_status}</Badge>
              </Td>
              <Td>{formatMoney(order.total_cents, order.currency)}</Td>
            </tr>
          ))}
        </Table>
      </div>

      <h2 className="tw:mb-3 tw:text-lg tw:font-semibold">Inventory warnings</h2>
      {lowStock.length === 0 ? (
        <Card>
          <p className="tw:text-sm tw:text-zinc-600">
            Every tracked variant has more than {LOW_STOCK_THRESHOLD} in stock.
          </p>
        </Card>
      ) : (
        <Table head={['Product', 'Variant', 'In stock']}>
          {lowStock.map((variant) => (
            <tr key={variant.id}>
              <Td>{variant.products?.title ?? '—'}</Td>
              <Td>{variant.title}</Td>
              <Td>
                <Badge tone={variant.inventory_quantity === 0 ? 'red' : 'amber'}>
                  {variant.inventory_quantity}
                </Badge>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}
