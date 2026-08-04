import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Briefcase,
  ChevronDown,
  FileCheck2,
  Gavel,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquareWarning,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Users,
  Wallet as WalletIcon,
  X,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { cn, formatMoney } from '@/lib/utils'
import { Logo } from './Logo'
import { NotificationBell } from './NotificationBell'
import { WhatsAppButton } from './WhatsAppButton'
import { Avatar } from '@/components/ui/Misc'
import { Button } from '@/components/ui/Button'
import type { Role } from '@/api/types'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

/**
 * Two lean nav sets instead of one generic 20-item sidebar. A writer never
 * sees "Post Order"; a client never sees "Browse Orders".
 */
const NAV: Record<Role, NavItem[]> = {
  client: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/orders', label: 'My Orders', icon: Briefcase },
    { to: '/writers', label: 'Find Writers', icon: Search },
    { to: '/wallet', label: 'Wallet', icon: WalletIcon },
    { to: '/reviews', label: 'Reviews', icon: Star },
    { to: '/account', label: 'Account', icon: Settings },
  ],
  writer: [
    { to: '/writer', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/browse', label: 'Browse Orders', icon: Search },
    { to: '/my-bids', label: 'My Bids', icon: ListChecks },
    { to: '/orders', label: 'My Jobs', icon: Briefcase },
    { to: '/earnings', label: 'Earnings', icon: Banknote },
    { to: '/reviews', label: 'Reviews', icon: Star },
    { to: '/account', label: 'Account', icon: Settings },
  ],
  admin: [
    { to: '/admin', label: 'Overview', icon: BarChart3, end: true },
    { to: '/admin/disputes', label: 'Disputes', icon: Gavel },
    { to: '/admin/moderation', label: 'Moderation', icon: MessageSquareWarning },
    { to: '/admin/flagged', label: 'Flagged work', icon: AlertTriangle },
    { to: '/admin/checks', label: 'Check requests', icon: FileCheck2 },
    { to: '/admin/users', label: 'Users & KYC', icon: Users },
    { to: '/admin/payouts', label: 'Payouts', icon: WalletIcon },
  ],
}

export function AppShell() {
  const { user, logout, isWriter, isAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  if (!user) return null

  const role: Role = isAdmin ? 'admin' : user.role
  const items = NAV[role] ?? NAV.client
  const accent = isWriter ? 'gold' : 'brand'

  const primaryAction = isAdmin ? null : isWriter ? (
    <Button
      variant="accent"
      size="sm"
      icon={<Search className="h-4 w-4" />}
      onClick={() => navigate('/browse')}
      fullWidth
    >
      Browse orders
    </Button>
  ) : (
    <Button
      size="sm"
      icon={<Plus className="h-4 w-4" />}
      onClick={() => navigate('/orders/new')}
      fullWidth
    >
      Post a new order
    </Button>
  )

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-ink-200 px-5">
        <Link to={isAdmin ? '/admin' : isWriter ? '/writer' : '/dashboard'}>
          <Logo />
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {primaryAction && <div className="px-4 pt-4">{primaryAction}</div>}

      <nav className="scroll-slim flex-1 space-y-1 overflow-y-auto p-4">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                isActive
                  ? accent === 'gold'
                    ? 'bg-gold-50 text-gold-800 ring-1 ring-inset ring-gold-200'
                    : 'bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0',
                    isActive && (accent === 'gold' ? 'text-gold-600' : 'text-brand-600'),
                  )}
                />
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {!isAdmin && (
        <div className="border-t border-ink-200 p-4">
          <Link
            to={isWriter ? '/earnings' : '/wallet'}
            className={cn(
              'block rounded-xl p-4 transition-colors',
              isWriter
                ? 'bg-gradient-to-br from-gold-50 to-gold-100/60 hover:from-gold-100 hover:to-gold-100'
                : 'bg-gradient-to-br from-brand-50 to-teal-50 hover:from-brand-100 hover:to-teal-100',
            )}
          >
            <p className="text-xs font-medium text-ink-500">
              {isWriter ? 'Available to withdraw' : 'Wallet balance'}
            </p>
            <p className="mt-1 text-lg font-bold text-ink-900">
              {formatMoney(user.wallet_balance)}
            </p>
            <p
              className={cn(
                'mt-1 text-xs font-semibold',
                isWriter ? 'text-gold-700' : 'text-brand-700',
              )}
            >
              {isWriter ? 'View earnings →' : 'Top up →'}
            </p>
          </Link>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-ink-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-ink-200 bg-white lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-72 max-w-[85vw] bg-white shadow-2xl animate-fade-in">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-xl p-2.5 text-ink-500 hover:bg-ink-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink-500">
                {greeting()}, <span className="font-semibold text-ink-900">{user.first_name || user.username}</span>
              </p>
            </div>

            {isAdmin && (
              <span className="hidden items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200 sm:inline-flex">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </span>
            )}

            <NotificationBell />

            <div className="relative">
              <button
                onClick={() => setMenuOpen((value) => !value)}
                className="flex items-center gap-2 rounded-xl p-1.5 pr-2 transition-colors hover:bg-ink-100"
              >
                <Avatar name={user.display_name} src={user.avatar} size="sm" />
                <ChevronDown className="h-4 w-4 text-ink-400" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card-hover animate-scale-in">
                    <div className="border-b border-ink-200 px-4 py-3">
                      <p className="truncate text-sm font-semibold text-ink-900">
                        {user.display_name}
                      </p>
                      <p className="truncate text-xs text-ink-500">{user.email}</p>
                      <span className="mt-2 inline-flex rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-600">
                        {role}
                      </span>
                    </div>
                    <Link
                      to="/account"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 hover:bg-ink-50"
                    >
                      <Settings className="h-4 w-4 text-ink-400" />
                      Account settings
                    </Link>
                    <button
                      onClick={() => {
                        logout()
                        navigate('/')
                      }}
                      className="flex w-full items-center gap-2.5 border-t border-ink-200 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>

      <WhatsAppButton />
    </div>
  )
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
