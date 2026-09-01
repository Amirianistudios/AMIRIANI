import { notFound } from 'next/navigation'

import { ProductEditor } from '@/components/admin/ProductEditor'
import { PageHeader } from '@/components/admin/ui'
import { imageUrl } from '@/lib/catalog'
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

  const { data: imageRows } = await supabase
    .from('product_images')
    .select('id, storage_path, external_url, alt, is_primary')
    .eq('product_id', id)
    .order('position', { ascending: true })

  // The editor shows thumbnails, so resolve each row to something a browser
  // can load — a stored file or, for a not-yet-migrated image, its source URL.
  const images = (imageRows ?? []).map((row) => ({
    id: row.id,
    url: imageUrl(row),
    alt: row.alt,
    is_primary: row.is_primary,
  }))

  const [{ data: collections }, { data: memberships }] = await Promise.all([
    supabase.from('collections').select('id, title').order('title', { ascending: true }),
    supabase.from('collection_products').select('collection_id').eq('product_id', id),
  ])

  const member = new Set((memberships ?? []).map((row) => row.collection_id))

  return (
    <>
      <PageHeader title={product.title} description={`/products/${product.slug}`} />
      <ProductEditor
        product={product}
        variants={variants ?? []}
        images={images}
        collections={(collections ?? []).map((collection) => ({
          ...collection,
          member: member.has(collection.id),
        }))}
      />
    </>
  )
}
