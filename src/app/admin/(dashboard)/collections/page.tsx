import { Badge, PageHeader, Table, Td } from '@/components/admin/ui'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminCollectionsPage() {
  const supabase = createSupabaseAdminClient()
  const { data: collections } = await supabase
    .from('collections')
    .select('id, title, slug, status, sort_order, collection_products(product_id)')
    .order('position', { ascending: true })

  type Row = {
    id: string
    title: string
    slug: string
    status: string
    sort_order: string
    collection_products: { product_id: string }[]
  }
  const rows = (collections ?? []) as unknown as Row[]

  return (
    <>
      <PageHeader
        title="Collections"
        description="Product groupings and the order they appear in."
      />
      <Table head={['Title', 'Slug', 'Status', 'Sort', 'Products']} empty="No collections yet.">
        {rows.map((collection) => (
          <tr key={collection.id}>
            <Td>{collection.title}</Td>
            <Td className="tw:text-zinc-500">/collections/{collection.slug}</Td>
            <Td>
              <Badge tone={collection.status === 'active' ? 'green' : 'zinc'}>
                {collection.status}
              </Badge>
            </Td>
            <Td>{collection.sort_order}</Td>
            <Td>{collection.collection_products.length}</Td>
          </tr>
        ))}
      </Table>
    </>
  )
}
