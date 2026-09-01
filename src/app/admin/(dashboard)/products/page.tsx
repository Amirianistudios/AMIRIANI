import Link from 'next/link'

import { NewProductForm } from '@/components/admin/NewProductForm'
import { Badge, PageHeader, Table, Td } from '@/components/admin/ui'
import { createSupabaseAdminClient } from '@/lib/supabase/server'
import { formatMoney } from '@/lib/money'

export const dynamic = 'force-dynamic'

export default async function AdminProductsPage() {
  const supabase = createSupabaseAdminClient()
  const { data: products } = await supabase
    .from('products')
    .select('id, title, slug, status, base_price_cents, currency, featured, product_variants(id, inventory_quantity)')
    .order('title', { ascending: true })

  type Row = {
    id: string
    title: string
    slug: string
    status: string
    base_price_cents: number | null
    currency: string
    featured: boolean
    product_variants: { id: string; inventory_quantity: number }[]
  }

  const rows = (products ?? []) as unknown as Row[]

  return (
    <>
      <PageHeader title="Products" description="Prices, inventory and visibility." />

      <NewProductForm />

      <Table head={['Title', 'Status', 'From', 'Variants', 'In stock', '']} empty="No products yet.">
        {rows.map((product) => {
          const stock = product.product_variants.reduce((s, v) => s + v.inventory_quantity, 0)
          return (
            <tr key={product.id}>
              <Td>
                <Link href={`/admin/products/${product.id}`} className="tw:underline">
                  {product.title}
                </Link>
                {product.featured && <span className="tw:ml-2"><Badge tone="amber">featured</Badge></span>}
              </Td>
              <Td>
                <Badge tone={product.status === 'active' ? 'green' : 'zinc'}>{product.status}</Badge>
              </Td>
              <Td>
                {product.base_price_cents === null
                  ? '—'
                  : formatMoney(product.base_price_cents, product.currency)}
              </Td>
              <Td>{product.product_variants.length}</Td>
              <Td>
                <Badge tone={stock === 0 ? 'red' : stock < 10 ? 'amber' : 'zinc'}>{stock}</Badge>
              </Td>
              <Td>
                <Link href={`/products/${product.slug}`} className="tw:text-xs tw:underline">
                  View
                </Link>
              </Td>
            </tr>
          )
        })}
      </Table>
    </>
  )
}
