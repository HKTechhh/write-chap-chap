import type * as React from 'react'
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Lock, User } from 'lucide-react'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Misc'
import { homeFor, useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/api/client'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: string } | null)?.from

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await login(username.trim(), password)
      toast.success(`Welcome back, ${user.first_name || user.username}`)
      navigate(from ?? homeFor(user.role), { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'That username and password combination is not recognised.'
          : err instanceof Error
            ? err.message
            : 'Sign in failed.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where you left off."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="link">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Input
          name="username"
          label="Username"
          placeholder="your.username"
          autoComplete="username"
          leading={<User className="h-4 w-4" />}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
          autoFocus
        />

        <Input
          name="password"
          type="password"
          label="Password"
          placeholder="••••••••"
          autoComplete="current-password"
          leading={<Lock className="h-4 w-4" />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={loading}
          iconRight={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}
        >
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-[44%] overflow-hidden bg-ink-950 lg:block">
        <div className="absolute inset-0 bg-mesh-brand" aria-hidden />
        <div className="absolute inset-0 bg-grid-faint [background-size:48px_48px]" aria-hidden />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link to="/">
            <Logo variant="light" />
          </Link>
          <div>
            <h2 className="max-w-sm text-balance text-3xl font-bold leading-tight text-white">
              Money in escrow. Deadlines enforced. Every delivery screened.
            </h2>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-ink-400">
              Write Chap Chap exists so good writers get paid reliably and clients never pay for
              work they haven't seen.
            </p>
            <div className="mt-10 flex gap-8">
              <MiniStat label="Platform fee" value="12%" hint="5% on Pro" />
              <MiniStat label="Review window" value="72h" hint="then auto-approve" />
              <MiniStat label="Late fine" value="5%/day" hint="capped at 25%" />
            </div>
          </div>
          <p className="text-xs text-ink-600">© {new Date().getFullYear()} Write Chap Chap</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center bg-ink-50 px-4 py-10 sm:px-8">
        <div className={wide ? 'w-full max-w-lg' : 'w-full max-w-md'}>
          <div className="mb-8 lg:hidden">
            <Link to="/">
              <Logo />
            </Link>
          </div>

          <div className="card p-7 sm:p-8">
            <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
            <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
            <div className="mt-7">{children}</div>
          </div>

          {footer && <p className="mt-6 text-center text-sm text-ink-600">{footer}</p>}
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-ink-400">{label}</p>
      <p className="text-[11px] text-ink-600">{hint}</p>
    </div>
  )
}
