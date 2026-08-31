import { notFound } from 'next/navigation'

import { ProductEditor } from '@/components/admin/ProductEditor'
import { PageHeader } from '@/components/admin/ui'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminProductPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createSupabaseAdminClient()

  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!product) notFound()

  const { data: variants } = await supabase
    .from('product_variants')
    .select('id, title, sku, price_cents, compare_at_cents, inventory_quantity')
    .eq('product_id', id)
    .order('position', { ascending: true })

  return (
    <>
      <PageHeader title={product.title} description={`/products/${product.slug}`} />
      <ProductEditor product={product} variants={variants ?? []} />
    </>
  )
}
