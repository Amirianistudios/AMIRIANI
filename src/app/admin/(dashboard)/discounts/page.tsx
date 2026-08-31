import { DiscountForms } from '@/components/admin/DiscountForms'
import { PageHeader } from '@/components/admin/ui'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminDiscountsPage() {
  const supabase = createSupabaseAdminClient()
  const { data: discounts } = await supabase
    .from('discount_codes')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <>
      <PageHeader title="Discounts" description="Codes customers can apply at checkout." />
      <DiscountForms discounts={discounts ?? []} />
    </>
  )
}
