import { cn } from '@/lib/utils'

// Pen nib inside a bridge arch. Geometry matches public/brand/logo-mark.svg.
const ARCH = 'M6 54V36A26 26 0 0 1 58 36V54H49V36A17 17 0 0 0 15 36V54Z'
const NIB =
  'M27 23H37L41.5 36L32 53L22.5 36Z' +
  'M32 31.4a2.6 2.6 0 1 0 0.01 0Z' +
  'M31.15 35H32.85V48H31.15Z'

export function LogoMark({
  className,
  variant = 'dark',
}: {
  className?: string
  /** `dark` = for light surfaces (flips with the theme); `light` = for always-dark surfaces. */
  variant?: 'dark' | 'light'
}) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-9 w-9 shrink-0', className)} aria-hidden>
      <path d={ARCH} className={variant === 'light' ? 'fill-teal-400' : 'fill-teal-700'} />
      <path d={NIB} fillRule="evenodd" className="fill-gold-500" />
    </svg>
  )
}

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
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark variant={variant} />
      {showWordmark && (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'font-display text-[19px] font-extrabold tracking-tight',
              variant === 'light' ? 'text-white' : 'text-teal-700',
            )}
          >
            PenSpan
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
