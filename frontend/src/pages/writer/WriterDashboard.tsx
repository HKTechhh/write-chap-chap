import type * as React from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Briefcase,
  Clock,
  ListChecks,
  Search,
  Star,
  TrendingUp,
} from 'lucide-react'
import { dashboard, orders as ordersApi } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/context/AuthContext'
import { cn, formatMoney } from '@/lib/utils'
import { TIER } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Alert, EmptyState, ProgressBar, Skeleton, StatCard } from '@/components/ui/Misc'
import { TierBadge } from '@/components/ui/Badge'
import { OrderCard, OrderRow } from '@/components/orders/OrderCard'
import { PageIntro } from '@/pages/client/ClientDashboard'
import type { WriterStats } from '@/api/types'

export default function WriterDashboard() {
  const { user } = useAuth()
  const stats = useAsync(() => dashboard.stats(), [])
  const myJobs = useAsync(() => ordersApi.list({ tab: 'active', page_size: 5 }), [])
  const openFeed = useAsync(() => ordersApi.list({ tab: 'open', page_size: 4 }), [])

  const data = stats.data as WriterStats | null
  const tier = data?.tier ?? user?.writer_profile?.tier ?? 'new'

  return (
    <div className="space-y-7">
      <PageIntro
        title="Dashboard"
        subtitle="Your jobs, your earnings, and what's available to bid on."
        action={
          <Link to="/browse">
            <Button variant="accent" icon={<Search className="h-4 w-4" />}>
              Browse orders
            </Button>
          </Link>
        }
      />

      {data?.is_suspended && (
        <Alert tone="danger" icon={<AlertTriangle className="h-4 w-4" />} title="Account suspended">
          You can't bid on new orders. Contact support to resolve this.
        </Alert>
      )}

      {!data?.is_suspended && (data?.strikes ?? 0) > 0 && (
        <Alert tone="warning" icon={<AlertTriangle className="h-4 w-4" />} title={`${data?.strikes} strike${data?.strikes === 1 ? '' : 's'} on your account`}>
          Strikes come from late deliveries, lost disputes, flagged submissions, or attempts to
          share contact details. Five strikes suspends the account.
        </Alert>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Active jobs"
              value={data?.active_jobs ?? 0}
              icon={<Briefcase className="h-4 w-4" />}
              hint={`${data?.awaiting_review ?? 0} awaiting client review`}
              accent="gold"
            />
            <StatCard
              label="Orders to bid on"
              value={data?.open_orders_available ?? 0}
              icon={<Search className="h-4 w-4" />}
              hint={`${data?.pending_bids ?? 0} bids pending`}
              accent="teal"
            />
            <StatCard
              label="Earned this month"
              value={formatMoney(data?.earnings_this_month)}
              icon={<Banknote className="h-4 w-4" />}
              hint="After platform fee"
              accent="emerald"
            />
            <StatCard
              label="Wallet balance"
              value={formatMoney(data?.wallet_balance ?? user?.wallet_balance)}
              icon={<TrendingUp className="h-4 w-4" />}
              hint="Available to withdraw"
              accent="brand"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Active jobs */}
          <Card>
            <CardHeader
              title="Your active jobs"
              description="Work you've been assigned."
              icon={<Briefcase className="h-4 w-4" />}
              action={
                <Link to="/orders">
                  <Button variant="ghost" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                    View all
                  </Button>
                </Link>
              }
            />
            {myJobs.loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-14" />
                ))}
              </div>
            ) : myJobs.data?.results.length ? (
              <div>
                {myJobs.data.results.map((order) => (
                  <OrderRow key={order.id} order={order} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Briefcase className="h-6 w-6" />}
                title="No active jobs yet"
                description="Win a bid and the job shows up here as soon as the client funds escrow."
                action={
                  <Link to="/browse">
                    <Button variant="accent" icon={<Search className="h-4 w-4" />}>
                      Find work
                    </Button>
                  </Link>
                }
                className="py-12"
              />
            )}
          </Card>

          {/* Open feed */}
          <Card>
            <CardHeader
              title="New orders you can bid on"
              description="Fresh briefs matching the open feed."
              icon={<Search className="h-4 w-4" />}
              action={
                <Link to="/browse">
                  <Button variant="ghost" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                    Browse all
                  </Button>
                </Link>
              }
            />
            <div className="space-y-3 p-5">
              {openFeed.loading ? (
                Array.from({ length: 2 }).map((_, index) => (
                  <Skeleton key={index} className="h-28 rounded-2xl" />
                ))
              ) : openFeed.data?.results.length ? (
                openFeed.data.results.map((order) => (
                  <OrderCard key={order.id} order={order} showClient />
                ))
              ) : (
                <EmptyState
                  icon={<Search className="h-6 w-6" />}
                  title="No open orders right now"
                  description="Check back shortly — new briefs land throughout the day."
                  className="py-8"
                />
              )}
            </div>
          </Card>
        </div>

        {/* Side rail */}
        <div className="space-y-6">
          <TierCard tier={tier} stats={data} />

          <Card>
            <CardHeader title="Quick links" />
            <div className="p-2">
              <Shortcut
                to="/my-bids"
                icon={<ListChecks className="h-4 w-4" />}
                title="My bids"
                body={`${data?.pending_bids ?? 0} awaiting a decision`}
              />
              <Shortcut
                to="/earnings"
                icon={<Banknote className="h-4 w-4" />}
                title="Earnings & payouts"
                body="Withdraw to M-Pesa"
              />
              <Shortcut
                to="/reviews"
                icon={<Star className="h-4 w-4" />}
                title="Reviews"
                body="What clients say about you"
              />
              <Shortcut
                to="/account"
                icon={<Clock className="h-4 w-4" />}
                title="Profile & KYC"
                body="Required before your first payout"
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function TierCard({ tier, stats }: { tier: string; stats: WriterStats | null }) {
  const meta = TIER[tier as keyof typeof TIER] ?? TIER.new
  const completed = stats?.completed_orders ?? 0

  const target = tier === 'new' ? 5 : tier === 'verified' ? 25 : completed
  const progress = tier === 'expert' ? 100 : Math.min(100, (completed / target) * 100)

  return (
    <div className="overflow-hidden rounded-2xl border border-gold-200 bg-gradient-to-br from-gold-50 via-surface to-orange-50 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-700">Your tier</h3>
        <TierBadge tier={(tier as any) ?? 'new'} />
      </div>

      <p className="mt-4 text-3xl font-bold tracking-tight text-ink-900">{meta.label}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{meta.blurb}</p>

      {tier !== 'expert' && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium text-ink-600">Completed orders</span>
            <span className="font-bold text-ink-900">
              {completed} / {target}
            </span>
          </div>
          <ProgressBar value={progress} tone="gold" className="mt-2" />
        </div>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-gold-200/70 pt-4">
        <MiniStat label="Rating" value={`${Number(stats?.rating_avg ?? 0).toFixed(1)}★`} />
        <MiniStat
          label="On-time"
          value={`${Number(stats?.on_time_rate ?? 100).toFixed(0)}%`}
          tone={Number(stats?.on_time_rate ?? 100) < 85 ? 'bad' : 'good'}
        />
      </dl>
    </div>
  )
}

function MiniStat({
  label,
  value,
  tone = 'good',
}: {
  label: string
  value: string
  tone?: 'good' | 'bad'
}) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className={cn('mt-0.5 text-lg font-bold', tone === 'bad' ? 'text-red-600' : 'text-ink-900')}>
        {value}
      </dd>
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
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-600">
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
