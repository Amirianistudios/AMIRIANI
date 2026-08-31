import { ContentForms } from '@/components/admin/ContentForms'
import { PageHeader } from '@/components/admin/ui'
import { createSupabaseAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminContentPage() {
  const supabase = createSupabaseAdminClient()

  const [pages, sections] = await Promise.all([
    supabase
      .from('content_pages')
      .select('*')
      .order('kind', { ascending: true })
      .order('position', { ascending: true }),
    supabase.from('homepage_sections').select('*').order('position', { ascending: true }),
  ])

  const banner = (sections.data ?? []).find((s) => s.kind === 'image_banner')
  const featured = (sections.data ?? []).find((s) => s.kind === 'featured_collection')

  return (
    <>
      <PageHeader
        title="Content"
        description="Homepage copy, pages and policies — editable without a deploy."
      />
      <ContentForms
        pages={pages.data ?? []}
        banner={(banner?.settings ?? {}) as Record<string, string>}
        featured={(featured?.settings ?? {}) as Record<string, string>}
      />
    </>
  )
}
