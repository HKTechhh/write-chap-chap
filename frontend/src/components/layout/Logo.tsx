import { cn } from '@/lib/utils'

// A simple pen nib, white on a blue rounded tile. Geometry matches public/brand/logo-mark.svg.
const NIB =
  'M27 23H37L41.5 36L32 53L22.5 36Z' +
  'M32 31.4a2.6 2.6 0 1 0 0.01 0Z' +
  'M31.15 35H32.85V48H31.15Z'

export function LogoMark({ className }: { className?: string; variant?: 'dark' | 'light' }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-9 w-9 shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="15" fill="#2563EB" />
      <path
        transform="translate(32 32) scale(1.12) translate(-32 -38)"
        d={NIB}
        fill="#FFFFFF"
        fillRule="evenodd"
      />
    </svg>
  )
}

export function Logo({
  className,
  variant = 'dark',
  showWordmark = true,
}: {
  className?: string
  /** `dark` = for light surfaces (flips with the theme); `light` = for always-dark surfaces. */
  variant?: 'dark' | 'light'
  showWordmark?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {showWordmark && (
        <span
          className={cn(
            'font-display text-[22px] font-extrabold leading-none tracking-tight',
            variant === 'light' ? 'text-white' : 'text-ink-900',
          )}
        >
          Penspan
        </span>
      )}
    </span>
  )
}
