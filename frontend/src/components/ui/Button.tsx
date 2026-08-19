import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
type Size = 'sm' | 'md' | 'lg'

/**
 * Filled variants use the `solid-*` palette rather than the themed ramps.
 * `bg-brand-600` flips to a light lavender in dark mode — correct for text,
 * ruinous for a button wearing `text-white`. `solid-*` never moves.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-solid-brand text-white shadow-sm hover:bg-solid-brand-hover active:bg-solid-brand-active disabled:bg-solid-brand-disabled',
  accent:
    'bg-solid-gold text-white shadow-sm hover:bg-solid-gold-hover active:bg-solid-gold-active disabled:bg-solid-gold-disabled',
  secondary:
    'bg-surface text-ink-800 ring-1 ring-inset ring-ink-300 shadow-sm hover:bg-ink-100 active:bg-ink-200',
  outline:
    'bg-transparent text-brand-700 ring-1 ring-inset ring-brand-300 hover:bg-brand-50 active:bg-brand-100',
  ghost: 'bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900 active:bg-ink-200',
  danger:
    'bg-solid-red text-white shadow-sm hover:bg-solid-red-hover active:bg-solid-red-active disabled:bg-solid-red-disabled',
  success:
    'bg-solid-emerald text-white shadow-sm hover:bg-solid-emerald-hover active:bg-solid-emerald-active disabled:bg-solid-emerald-disabled',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconRight,
    fullWidth,
    className,
    children,
    disabled,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-70',
        'focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  )
})
