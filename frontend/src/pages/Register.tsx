import type * as React from 'react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, PenLine, Wallet } from 'lucide-react'
import { AuthLayout } from './Login'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Misc'
import { homeFor, useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ApiError } from '@/api/client'
import { cn } from '@/lib/utils'
import type { Role } from '@/api/types'

export default function Register() {
  const [params] = useSearchParams()
  const initialRole = params.get('role') === 'writer' ? 'writer' : 'client'

  const { register } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()

  const [role, setRole] = useState<Exclude<Role, 'admin'>>(initialRole)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    password_confirm: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }))
    setErrors((current) => ({ ...current, [key]: '' }))
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrors({})
    setGeneral('')

    if (form.password !== form.password_confirm) {
      setErrors({ password_confirm: 'Passwords do not match.' })
      return
    }

    setLoading(true)
    try {
      const user = await register({ ...form, role, country: 'Kenya' })
      toast.success('Account created', `You're signed in as a ${role}.`)
      navigate(homeFor(user.role), { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrors = err.fieldErrors
        setErrors(fieldErrors)
        if (Object.keys(fieldErrors).length === 0) setGeneral(err.message)
      } else {
        setGeneral(err instanceof Error ? err.message : 'Registration failed.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      wide
      title="Create your account"
      subtitle="Your role is set now and shapes everything you see next — choose carefully."
      footer={
        <>
          Already registered?{' '}
          <Link to="/login" className="link">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5">
        {general && <Alert tone="danger">{general}</Alert>}

        <div>
          <p className="label">I want to…</p>
          <div className="grid grid-cols-2 gap-3">
            <RoleCard
              active={role === 'client'}
              onClick={() => setRole('client')}
              icon={<Wallet className="h-5 w-5" />}
              title="Hire a writer"
              body="Post orders, compare bids, pay through escrow."
              tone="brand"
            />
            <RoleCard
              active={role === 'writer'}
              onClick={() => setRole('writer')}
              icon={<PenLine className="h-5 w-5" />}
              title="Write & earn"
              body="Bid on orders, deliver work, withdraw earnings."
              tone="gold"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="first_name"
            label="First name"
            value={form.first_name}
            onChange={set('first_name')}
            error={errors.first_name}
            autoComplete="given-name"
            required
          />
          <Input
            name="last_name"
            label="Last name"
            value={form.last_name}
            onChange={set('last_name')}
            error={errors.last_name}
            autoComplete="family-name"
            required
          />
        </div>

        <Input
          name="username"
          label="Username"
          hint="This is how you'll sign in. Letters, numbers, dots and underscores."
          value={form.username}
          onChange={set('username')}
          error={errors.username}
          autoComplete="username"
          required
        />

        <Input
          name="email"
          type="email"
          label="Email"
          value={form.email}
          onChange={set('email')}
          error={errors.email}
          autoComplete="email"
          required
        />

        <Input
          name="phone"
          label="Phone (M-Pesa)"
          placeholder="0712 345 678"
          hint={
            role === 'writer'
              ? 'Used for payouts. You can add it later, but withdrawals need it.'
              : 'Used for M-Pesa top-ups.'
          }
          value={form.phone}
          onChange={set('phone')}
          error={errors.phone}
          autoComplete="tel"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            name="password"
            type="password"
            label="Password"
            hint="At least 8 characters."
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            autoComplete="new-password"
            required
          />
          <Input
            name="password_confirm"
            type="password"
            label="Confirm password"
            value={form.password_confirm}
            onChange={set('password_confirm')}
            error={errors.password_confirm}
            autoComplete="new-password"
            required
          />
        </div>

        <Button
          type="submit"
          size="lg"
          fullWidth
          variant={role === 'writer' ? 'accent' : 'primary'}
          loading={loading}
          iconRight={!loading ? <ArrowRight className="h-4 w-4" /> : undefined}
        >
          Create {role} account
        </Button>

        <p className="text-center text-xs leading-relaxed text-ink-500">
          By creating an account you agree to keep all communication and payment on the platform.
          Sharing contact details in order chat is blocked and counts as a strike.
        </p>
      </form>
    </AuthLayout>
  )
}

function RoleCard({
  active,
  onClick,
  icon,
  title,
  body,
  tone,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  body: string
  tone: 'brand' | 'gold'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border-2 p-4 text-left transition-all',
        active
          ? tone === 'brand'
            ? 'border-brand-500 bg-brand-50 shadow-sm'
            : 'border-gold-500 bg-gold-50 shadow-sm'
          : 'border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50',
      )}
    >
      <span
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-xl',
          active
            ? tone === 'brand'
              ? 'bg-brand-600 text-white'
              : 'bg-gold-500 text-white'
            : 'bg-ink-100 text-ink-500',
        )}
      >
        {icon}
      </span>
      <span className="mt-3 block text-sm font-semibold text-ink-900">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-ink-500">{body}</span>
    </button>
  )
}
