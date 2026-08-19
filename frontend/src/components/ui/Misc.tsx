import type { ReactNode } from 'react'
import { Loader2, Star } from 'lucide-react'
import { cn, avatarColor, initials } from '@/lib/utils'
import { mediaUrl } from '@/api/client'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} />
}

export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-ink-500">
      <Spinner className="h-7 w-7" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-ink-200/70', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-surface/60 to-transparent" />
    </div>
  )
}

interface AvatarProps {
  name: string
  src?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  ring?: boolean
}

const AVATAR_SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
}

export function Avatar({ name, src, size = 'md', className, ring }: AvatarProps) {
  const resolved = mediaUrl(src)
  return resolved ? (
    <img
      src={resolved}
      alt={name}
      className={cn(
        'shrink-0 rounded-full object-cover',
        AVATAR_SIZES[size],
        ring && 'ring-2 ring-surface',
        className,
      )}
    />
  ) : (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold text-white',
        avatarColor(name || '?'),
        AVATAR_SIZES[size],
        ring && 'ring-2 ring-surface',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

interface StatCardProps {
  label: string
  value: ReactNode
  icon?: ReactNode
  hint?: ReactNode
  accent?: 'brand' | 'gold' | 'teal' | 'emerald' | 'red' | 'violet'
  className?: string
}

const ACCENTS = {
  brand: 'bg-brand-50 text-brand-600',
  gold: 'bg-gold-50 text-gold-600',
  teal: 'bg-teal-50 text-teal-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  red: 'bg-red-50 text-red-600',
  violet: 'bg-violet-50 text-violet-600',
}

export function StatCard({ label, value, icon, hint, accent = 'brand', className }: StatCardProps) {
  return (
    <div className={cn('card card-hover p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-500">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              ACCENTS[accent],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  )
}

export function Rating({
  value,
  count,
  size = 'sm',
  className,
}: {
  value: number | string
  count?: number
  size?: 'sm' | 'md'
  className?: string
}) {
  const numeric = Number(value) || 0
  const star = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((index) => (
          <Star
            key={index}
            className={cn(
              star,
              index <= Math.round(numeric)
                ? 'fill-gold-400 text-gold-400'
                : 'fill-ink-200 text-ink-200',
            )}
          />
        ))}
      </span>
      <span className={cn('font-semibold text-ink-700', size === 'sm' ? 'text-xs' : 'text-sm')}>
        {numeric.toFixed(1)}
      </span>
      {count !== undefined && (
        <span className={cn('text-ink-400', size === 'sm' ? 'text-xs' : 'text-sm')}>({count})</span>
      )}
    </span>
  )
}

interface TabsProps {
  tabs: { value: string; label: string; count?: number }[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export function Tabs({ tabs, value, onChange, className }: TabsProps) {
  return (
    <div
      className={cn(
        'scroll-slim flex gap-1 overflow-x-auto rounded-xl bg-ink-100 p-1',
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-all',
            value === tab.value
              ? 'bg-surface text-ink-900 shadow-sm'
              : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className={cn(
                'ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold',
                value === tab.value ? 'bg-brand-100 text-brand-700' : 'bg-ink-200 text-ink-600',
              )}
            >
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function ProgressBar({
  value,
  tone = 'brand',
  className,
}: {
  value: number
  tone?: 'brand' | 'gold' | 'emerald' | 'red'
  className?: string
}) {
  const tones = {
    brand: 'bg-brand-500',
    gold: 'bg-gold-500',
    emerald: 'bg-emerald-500',
    red: 'bg-red-500',
  }
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-ink-200', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', tones[tone])}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  )
}

export function Alert({
  tone = 'info',
  title,
  children,
  icon,
  className,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger'
  title?: ReactNode
  children?: ReactNode
  icon?: ReactNode
  className?: string
}) {
  const tones = {
    info: 'bg-brand-50 text-brand-900 ring-brand-200',
    success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    danger: 'bg-red-50 text-red-900 ring-red-200',
  }
  return (
    <div className={cn('rounded-xl px-4 py-3 text-sm ring-1 ring-inset', tones[tone], className)}>
      <div className="flex gap-3">
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title && 'mt-1', 'opacity-90')}>{children}</div>}
        </div>
      </div>
    </div>
  )
}
