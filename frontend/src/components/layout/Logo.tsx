import { cn } from '@/lib/utils'

export function Logo({
  className,
  variant = 'dark',
  showWordmark = true,
}: {
  className?: string
  variant?: 'dark' | 'light'
  showWordmark?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span className="theme-fixed relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-teal-500 shadow-sm">
        <svg viewBox="0 0 64 64" className="h-5 w-5" aria-hidden>
          <path d="M14 22h6l4 14 4-14h6l4 14 4-14h6l-7 22h-7l-3-11-3 11h-7z" fill="#fff" />
        </svg>
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-gold-400 ring-2 ring-white" />
      </span>
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'font-display text-[15px] font-extrabold tracking-tight',
              variant === 'light' ? 'text-white' : 'text-ink-900',
            )}
          >
            Write Chap Chap
          </span>
          <span
            className={cn(
              'mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]',
              variant === 'light' ? 'text-white/60' : 'text-ink-400',
            )}
          >
            Fast. Fair. Escrowed.
          </span>
        </span>
      )}
    </span>
  )
}
