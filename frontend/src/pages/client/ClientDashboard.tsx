import type * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileSearch,
  Plus,
  Search,
  TrendingDown,
  Users,
  Wallet as WalletIcon,
} from 'lucide-react'
import { dashboard, orders as ordersApi } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/context/AuthContext'
import { formatMoney } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState, Skeleton, StatCard } from '@/components/ui/Misc'
import { OrderRow } from '@/components/orders/OrderCard'
import type { ClientStats } from '@/api/types'

export default function ClientDashboard() {
  const { user } = useAuth()
  const stats = useAsync(() => dashboard.stats(), [])
  const needsAction = useAsync(() => ordersApi.list({ tab: 'in_review', page_size: 5 }), [])
  const active = useAsync(() => ordersApi.list({ tab: 'active', page_size: 6 }), [])

  const data = stats.data as ClientStats | null

  return (
    <div className="space-y-7">
      <PageIntro
        title="Dashboard"
        subtitle="Everything that needs your attention, in one place."
        action={
          <Link to="/orders/new">
            <Button icon={<Plus className="h-4 w-4" />}>Post a new order</Button>
          </Link>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Active orders"
              value={data?.active_orders ?? 0}
              icon={<Briefcase className="h-4 w-4" />}
              hint={`${data?.open_for_bids ?? 0} still open for bids`}
              accent="brand"
            />
            <StatCard
              label="Needs your action"
              value={data?.needs_action ?? 0}
              icon={<CheckCircle2 className="h-4 w-4" />}
              hint="Awaiting approval or funding"
              accent={data?.needs_action ? 'red' : 'emerald'}
            />
            <StatCard
              label="Wallet balance"
              value={formatMoney(data?.wallet_balance ?? user?.wallet_balance)}
              icon={<WalletIcon className="h-4 w-4" />}
              hint="Available to fund orders"
              accent="teal"
            />
            <StatCard
              label="Spent this month"
              value={formatMoney(data?.spent_this_month)}
              icon={<TrendingDown className="h-4 w-4" />}
              hint={`${data?.completed_orders ?? 0} orders completed all-time`}
              accent="violet"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Needs action */}
          <Card>
            <CardHeader
              title="Waiting on you"
              description="Approve, request a revision, or fund an order."
              icon={<CheckCircle2 className="h-4 w-4" />}
              action={
                <Link to="/orders?tab=in_review">
                  <Button variant="ghost" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                    View all
                  </Button>
                </Link>
              }
            />
            {needsAction.loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-14" />
                ))}
              </div>
            ) : needsAction.data?.results.length ? (
              <div>
                {needsAction.data.results.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<CheckCircle2 className="h-6 w-6" />}
                title="Nothing waiting"
                description="You're all caught up. Deliveries that need review will appear here."
                className="py-12"
              />
            )}
          </Card>

          {/* Active */}
          <Card>
            <CardHeader
              title="Active orders"
              description="Work currently in progress."
              icon={<Briefcase className="h-4 w-4" />}
              action={
                <Link to="/orders">
                  <Button variant="ghost" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                    All orders
                  </Button>
                </Link>
              }
            />
            {active.loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-14" />
                ))}
              </div>
            ) : active.data?.results.length ? (
              <div>
                {active.data.results.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Briefcase className="h-6 w-6" />}
                title="No active orders"
                description="Post an order and writers will start bidding within minutes."
                action={
                  <Link to="/orders/new">
                    <Button icon={<Plus className="h-4 w-4" />}>Post an order</Button>
                  </Link>
                }
                className="py-12"
              />
            )}
          </Card>
        </div>

        {/* Side rail */}
        <div className="space-y-6">
          <div className="theme-fixed overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-600 to-teal-600 p-6 text-white">
            <h3 className="text-lg font-bold">Ready to get something written?</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/80">
              Post the brief and compare real bids. Your money stays in escrow until you approve
              the work.
            </p>
            <Link to="/orders/new" className="mt-5 inline-block">
              <Button variant="secondary" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                Post an order
              </Button>
            </Link>
          </div>

          <Card>
            <CardHeader title="Shortcuts" />
            <div className="p-2">
              <Shortcut
                to="/writers"
                icon={<Search className="h-4 w-4" />}
                title="Find writers"
                body="Browse by subject, rating and tier"
              />
              <Shortcut
                to="/wallet"
                icon={<WalletIcon className="h-4 w-4" />}
                title="Top up wallet"
                body="M-Pesa or card"
              />
              <Shortcut
                to="/check-my-paper"
                icon={<FileSearch className="h-4 w-4" />}
                title="Check a document"
                body="KES 150 per report"
              />
              <Shortcut
                to="/reviews"
                icon={<Users className="h-4 w-4" />}
                title="Your reviews"
                body="Rate writers you've worked with"
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Shortcut({
  to,
  icon,
  title,
  body,
}: {
  to: string
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-ink-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-900">{title}</span>
        <span className="block text-xs text-ink-500">{body}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-ink-300" />
    </Link>
  )
}

export function PageIntro({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
