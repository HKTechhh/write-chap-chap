import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import type { ThemePreference } from '@/context/ThemeContext'
import { cn } from '@/lib/utils'

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/**
 * Compact icon button for the app header. One tap flips light ⇄ dark; the
 * three-way choice lives in Account settings, where there is room to explain
 * what "System" means.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const nextLabel = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      title={`Switch to ${nextLabel} mode`}
      aria-label={`Switch to ${nextLabel} mode`}
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-xl text-ink-500',
        'transition-colors hover:bg-ink-100 hover:text-ink-900',
        className,
      )}
    >
      {/* Both icons stay mounted and cross-fade, so the button never reflows. */}
      <Sun
        className={cn(
          'absolute h-5 w-5 transition-all duration-300',
          theme === 'dark' ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
        )}
        aria-hidden
      />
      <Moon
        className={cn(
          'absolute h-5 w-5 transition-all duration-300',
          theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
        )}
        aria-hidden
      />
    </button>
  )
}

/**
 * Explicit three-way picker, including `System`. Rendered as a radiogroup
 * rather than a select so the current choice is visible without opening it.
 */
export function ThemePicker({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme()

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn('inline-flex gap-1 rounded-xl bg-ink-100 p-1', className)}
    >
      {OPTIONS.map((option) => {
        const active = preference === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(option.value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
              active
                ? 'bg-surface text-ink-900 shadow-sm ring-1 ring-ink-200'
                : 'text-ink-500 hover:text-ink-800',
            )}
          >
            <option.icon className="h-4 w-4" aria-hidden />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
