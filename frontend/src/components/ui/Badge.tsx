import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ORDER_STATUS, TIER } from '@/lib/constants'
import type { OrderStatus, WriterTier } from '@/api/types'

type Tone = 'neutral' | 'brand' | 'teal' | 'gold' | 'success' | 'warning' | 'danger' | 'violet'

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  gold: 'bg-gold-50 text-gold-700 ring-gold-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
}

interface BadgeProps {
  children: ReactNode
  tone?: Tone
  className?: string
  icon?: ReactNode
  dot?: boolean
}

export function Badge({ children, tone = 'neutral', className, icon, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {icon}
      {children}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const meta = ORDER_STATUS[status] ?? ORDER_STATUS.draft
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        meta.className,
        className,
      )}
      title={meta.description}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function TierBadge({ tier, className }: { tier: WriterTier; className?: string }) {
  const meta = TIER[tier] ?? TIER.new
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset',
        meta.className,
        className,
      )}
      title={meta.blurb}
    >
      {meta.label}
    </span>
  )
}
