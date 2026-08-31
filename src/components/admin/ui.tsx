import Link from 'next/link'

/** Small shared building blocks for the admin screens. */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <header className="tw:mb-6 tw:flex tw:items-start tw:justify-between tw:gap-4">
      <div>
        <h1 className="tw:text-2xl tw:font-semibold">{title}</h1>
        {description && <p className="tw:mt-1 tw:text-sm tw:text-zinc-600">{description}</p>}
      </div>
      {action}
    </header>
  )
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="tw:rounded-lg tw:border tw:border-zinc-200 tw:bg-white tw:p-5">
      {children}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="tw:text-xs tw:uppercase tw:tracking-wide tw:text-zinc-500">{label}</p>
      <p className="tw:mt-2 tw:text-2xl tw:font-semibold">{value}</p>
      {hint && <p className="tw:mt-1 tw:text-xs tw:text-zinc-500">{hint}</p>}
    </Card>
  )
}

export function Table({
  head,
  children,
  empty,
}: {
  head: string[]
  children: React.ReactNode
  empty?: string
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children)

  if (!hasRows) {
    return (
      <Card>
        <p className="tw:text-sm tw:text-zinc-600">{empty ?? 'Nothing here yet.'}</p>
      </Card>
    )
  }

  return (
    <div className="tw:overflow-x-auto tw:rounded-lg tw:border tw:border-zinc-200 tw:bg-white">
      <table className="tw:w-full tw:text-left tw:text-sm">
        <thead className="tw:border-b tw:border-zinc-200 tw:bg-zinc-50">
          <tr>
            {head.map((h) => (
              <th key={h} className="tw:px-4 tw:py-3 tw:font-medium tw:text-zinc-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tw:divide-y tw:divide-zinc-100">{children}</tbody>
      </table>
    </div>
  )
}

export function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`tw:px-4 tw:py-3 ${className}`}>{children}</td>
}

export function Badge({ children, tone = 'zinc' }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    zinc: 'tw:bg-zinc-100 tw:text-zinc-700',
    green: 'tw:bg-green-100 tw:text-green-800',
    amber: 'tw:bg-amber-100 tw:text-amber-800',
    red: 'tw:bg-red-100 tw:text-red-800',
  }
  return (
    <span className={`tw:rounded tw:px-2 tw:py-0.5 tw:text-xs ${tones[tone] ?? tones.zinc}`}>
      {children}
    </span>
  )
}

export function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="tw:rounded tw:bg-zinc-900 tw:px-4 tw:py-2 tw:text-sm tw:text-white tw:hover:bg-zinc-700"
    >
      {children}
    </Link>
  )
}

export function paymentTone(status: string): string {
  if (status === 'paid') return 'green'
  if (status === 'failed') return 'red'
  if (status === 'refunded' || status === 'partially_refunded') return 'amber'
  return 'zinc'
}
