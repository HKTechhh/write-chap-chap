import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { tokens } from '@/api/client'
import { auth as authApi } from '@/api/endpoints'
import type { CurrentUser } from '@/api/types'

interface AuthContextValue {
  user: CurrentUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<CurrentUser>
  register: (payload: Record<string, any>) => Promise<CurrentUser>
  logout: () => void
  refresh: () => Promise<void>
  isClient: boolean
  isWriter: boolean
  isAdmin: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  const loadUser = useCallback(async () => {
    if (!tokens.access) {
      setUser(null)
      setLoading(false)
      return
    }
    try {
      setUser(await authApi.me())
    } catch {
      tokens.clear()
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUser()
  }, [loadUser])

  // The API client fires this when a refresh token finally fails.
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('wcc:session-expired', onExpired)
    return () => window.removeEventListener('wcc:session-expired', onExpired)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const data = await authApi.login(username, password)
    tokens.set(data.access, data.refresh)
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (payload: Record<string, any>) => {
    const data = await authApi.register(payload)
    tokens.set(data.access, data.refresh)
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    tokens.clear()
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!tokens.access) return
    try {
      setUser(await authApi.me())
    } catch {
      /* keep the current user rather than flickering to logged-out */
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      refresh,
      isClient: user?.role === 'client',
      isWriter: user?.role === 'writer',
      isAdmin: user?.role === 'admin' || Boolean(user?.is_staff),
    }),
    [user, loading, login, register, logout, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** Home route for a role — used after login and by the "/" redirect. */
export function homeFor(role: string | undefined): string {
  if (role === 'writer') return '/writer'
  if (role === 'admin') return '/admin'
  return '/dashboard'
}
