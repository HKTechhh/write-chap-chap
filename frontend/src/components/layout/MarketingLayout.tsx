import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from './Logo'
import { WhatsAppButton } from './WhatsAppButton'
import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { useAuth, homeFor } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/#how', label: 'How it works' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/check-my-paper', label: 'Check my paper' },
]

export function MarketingLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-40 border-b border-ink-200/70 bg-surface/85 backdrop-blur-md">
        <div className="container-page flex h-[68px] items-center justify-between gap-4">
          <Link to="/" aria-label="Write Chap Chap home">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                    isActive && link.to !== '/#how'
                      ? 'text-brand-700'
                      : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* The toggle stays outside the md:flex group so it survives on
              phones, where everything else collapses into the burger menu. */}
          <div className="ml-auto flex items-center gap-2.5 md:ml-0">
            <ThemeToggle />
            <div className="hidden items-center gap-2.5 md:flex">
              {user ? (
                <Link to={homeFor(user.role)}>
                  <Button size="sm">Go to dashboard</Button>
                </Link>
              ) : (
                <>
                  <Link to="/login">
                    <Button variant="ghost" size="sm">
                      Sign in
                    </Button>
                  </Link>
                  <Link to="/register?role=client">
                    <Button size="sm">Get started</Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          <button
            className="rounded-xl p-2.5 text-ink-600 hover:bg-ink-100 md:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="border-t border-ink-200 bg-surface px-4 py-4 md:hidden">
            <div className="flex flex-col gap-1">
              {LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex flex-col gap-2 border-t border-ink-200 pt-4">
              {user ? (
                <Link to={homeFor(user.role)}>
                  <Button fullWidth>Go to dashboard</Button>
                </Link>
              ) : (
                <>
                  <Link to="/login">
                    <Button variant="secondary" fullWidth>
                      Sign in
                    </Button>
                  </Link>
                  <Link to="/register?role=client">
                    <Button fullWidth>Get started</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main>{children}</main>

      <footer className="border-t border-ink-200 theme-fixed bg-ink-900 text-ink-300">
        <div className="container-page py-14">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-1">
              <Logo variant="light" />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-400">
                A writing marketplace where the money is held in escrow, every delivery is
                screened, and deadlines actually mean something.
              </p>
            </div>

            <FooterColumn
              title="For clients"
              links={[
                { to: '/register?role=client', label: 'Hire a writer' },
                { to: '/check-my-paper', label: 'Check my paper' },
                { to: '/pricing', label: 'Pricing' },
              ]}
            />
            <FooterColumn
              title="For writers"
              links={[
                { to: '/register?role=writer', label: 'Become a writer' },
                { to: '/pricing', label: 'Fees & payouts' },
                { to: '/login', label: 'Sign in' },
              ]}
            />
            <FooterColumn
              title="Platform"
              links={[
                { to: '/#how', label: 'How it works' },
                { to: '/#trust', label: 'Trust & safety' },
                { to: '/#faq', label: 'FAQ' },
              ]}
            />
          </div>

          <div className="mt-12 flex flex-col gap-3 border-t border-ink-800 pt-6 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Write Chap Chap. All rights reserved.</p>
            <p>Payments in KES via M-Pesa and card. Nairobi, Kenya.</p>
          </div>
        </div>
      </footer>

      <WhatsAppButton />
    </div>
  )
}

function FooterColumn({
  title,
  links,
}: {
  title: string
  links: { to: string; label: string }[]
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <ul className="mt-4 space-y-2.5">
        {links.map((link) => (
          <li key={link.to + link.label}>
            <Link to={link.to} className="text-sm text-ink-400 transition-colors hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
