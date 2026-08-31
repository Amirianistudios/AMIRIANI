import { PageHeader, Table, Td } from '@/components/admin/ui'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function AdminCustomersPage() {
  const supabase = createSupabaseAdminClient()

  const { data: customers } = await supabase
    .from('customers')
    .select('id, email, first_name, last_name, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  // One query for spend across all listed customers, rather than one per row.
  const ids = (customers ?? []).map((c) => c.id)
  const spendByCustomer = new Map<string, { count: number; total: number }>()

  if (ids.length > 0) {
    const { data: orders } = await supabase
      .from('orders')
      .select('customer_id, total_cents')
      .in('customer_id', ids)
      .eq('payment_status', 'paid')

    for (const order of orders ?? []) {
      if (!order.customer_id) continue
      const entry = spendByCustomer.get(order.customer_id) ?? { count: 0, total: 0 }
      entry.count += 1
      entry.total += order.total_cents
      spendByCustomer.set(order.customer_id, entry)
    }
  }

  return (
    <>
      <PageHeader title="Customers" description="Accounts and their paid orders." />
      <Table head={['Email', 'Name', 'Orders', 'Spent', 'Joined']} empty="No customers yet.">
        {(customers ?? []).map((customer) => {
          const spend = spendByCustomer.get(customer.id) ?? { count: 0, total: 0 }
          return (
            <tr key={customer.id}>
              <Td>{customer.email}</Td>
              <Td>{[customer.first_name, customer.last_name].filter(Boolean).join(' ') || '—'}</Td>
              <Td>{spend.count}</Td>
              <Td>{formatMoney(spend.total)}</Td>
              <Td>{new Date(customer.created_at).toLocaleDateString('en-GB')}</Td>
            </tr>
          )
        })}
      </Table>
    </>
  )
}
