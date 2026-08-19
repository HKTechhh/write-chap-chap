import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * `system` is a real state, not a synonym for whichever theme is active. A user
 * who picks it in the morning should still flip to dark when their OS does at
 * dusk, so we keep the preference and resolve it on every change.
 */
export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** Shared with the inline boot script in index.html — keep the two in step. */
export const THEME_STORAGE_KEY = 'wcc.theme'

interface ThemeContextValue {
  /** What the user chose. */
  preference: ThemePreference
  /** What is actually on screen once `system` is resolved. */
  theme: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
  /** Light ⇄ dark. From `system`, flips away from whatever is showing. */
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Private mode / blocked storage — fall through to the OS setting.
  }
  return 'system'
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return prefersDark() ? 'dark' : 'light'
  return preference
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [theme, setTheme] = useState<ResolvedTheme>(() => resolve(readStoredPreference()))

  // Apply to <html>, not the app root: modals and toasts portal to document.body
  // and would otherwise render outside the themed subtree.
  useEffect(() => {
    const resolved = resolve(preference)
    setTheme(resolved)

    const root = document.documentElement
    root.classList.toggle('dark', resolved === 'dark')
    // Drives native form controls, scrollbars and the browser's own painting.
    root.style.colorScheme = resolved

    // Keeps the mobile browser chrome from staying light over a dark page.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#0b1120' : '#4f46e5')

    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference)
    } catch {
      // Not being able to persist is not a reason to fail the render.
    }
  }, [preference])

  // Only meaningful while the preference is `system`.
  useEffect(() => {
    if (preference !== 'system') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const resolved: ResolvedTheme = query.matches ? 'dark' : 'light'
      setTheme(resolved)
      document.documentElement.classList.toggle('dark', resolved === 'dark')
      document.documentElement.style.colorScheme = resolved
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => setPreferenceState(next), [])

  // Resolve inside the updater so the flip is based on what is on screen right
  // now, including when the preference is still `system`.
  const toggle = useCallback(
    () => setPreferenceState((current) => (resolve(current) === 'dark' ? 'light' : 'dark')),
    [],
  )

  const value = useMemo(
    () => ({ preference, theme, setPreference, toggle }),
    [preference, theme, setPreference, toggle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}
