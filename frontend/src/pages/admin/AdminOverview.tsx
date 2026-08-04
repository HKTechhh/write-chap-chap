import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Banknote,
  Briefcase,
  FileCheck2,
  Gavel,
  Lock,
  MessageSquareWarning,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react'
import { admin } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { ORDER_STATUS } from '@/lib/constants'
import { cn, formatMoney, formatNumber } from '@/lib/utils'
import { Card, CardHeader } from '@/components/ui/Card'
import { Skeleton, StatCard } from '@/components/ui/Misc'
import { PageIntro } from '@/pages/client/ClientDashboard'

export default function AdminOverview() {
  const { data, loading } = useAsync(() => admin.stats(), [])

  const queues = [
    {
      to: '/admin/disputes',
      icon: <Gavel className="h-5 w-5" />,
      label: 'Open disputes',
      count: data?.open_disputes ?? 0,
      tone: 'red',
    },
    {
      to: '/admin/moderation',
      icon: <MessageSquareWarning className="h-5 w-5" />,
      label: 'Contact leaks to review',
      count: data?.open_contact_leaks ?? 0,
      tone: 'amber',
    },
    {
      to: '/admin/flagged',
      icon: <AlertTriangle className="h-5 w-5" />,
      label: 'Flagged deliverables',
      count: data?.flagged_deliverables ?? 0,
      tone: 'violet',
    },
    {
      to: '/admin/checks',
      icon: <FileCheck2 className="h-5 w-5" />,
      label: 'Check requests pending',
      count: data?.pending_check_requests ?? 0,
      tone: 'brand',
    },
    {
      to: '/admin/users',
      icon: <ShieldCheck className="h-5 w-5" />,
      label: 'KYC awaiting approval',
      count: data?.pending_kyc ?? 0,
      tone: 'teal',
    },
  ] as const

  const totalOrders = data?.orders_total || 1

  return (
    <div className="space-y-7">
      <PageIntro
        title="Platform overview"
        subtitle="Money held, work in flight, and everything waiting on you."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Held in escrow"
              value={formatMoney(data?.escrow_held)}
              icon={<Lock className="h-4 w-4" />}
              hint="Client money awaiting release"
              accent="violet"
            />
            <StatCard
              label="Platform revenue"
              value={formatMoney(data?.platform_revenue)}
              icon={<TrendingUp className="h-4 w-4" />}
              hint="Fees collected on released orders"
              accent="emerald"
            />
            <StatCard
              label="Active orders"
              value={formatNumber(data?.orders_active)}
              icon={<Briefcase className="h-4 w-4" />}
              hint={`${formatNumber(data?.orders_total)} all time`}
              accent="brand"
            />
            <StatCard
              label="Users"
              value={formatNumber(data?.users)}
              icon={<Users className="h-4 w-4" />}
              hint={`${data?.writers ?? 0} writers · ${data?.clients ?? 0} clients`}
              accent="gold"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Queues */}
        <Card>
          <CardHeader title="Work queues" description="Anything with a number needs a human." />
          <div className="p-2">
            {queues.map((queue) => (
              <Link
                key={queue.to}
                to={queue.to}
                className="flex items-center gap-3.5 rounded-xl px-3 py-3.5 transition-colors hover:bg-ink-50"
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    queue.tone === 'red'
                      ? 'bg-red-50 text-red-600'
                      : queue.tone === 'amber'
                        ? 'bg-amber-50 text-amber-600'
                        : queue.tone === 'violet'
                          ? 'bg-violet-50 text-violet-600'
                          : queue.tone === 'teal'
                            ? 'bg-teal-50 text-teal-600'
                            : 'bg-brand-50 text-brand-600',
                  )}
                >
                  {queue.icon}
                </span>
                <span className="flex-1 text-sm font-medium text-ink-800">{queue.label}</span>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-sm font-bold',
                    queue.count > 0 ? 'bg-red-100 text-red-700' : 'bg-ink-100 text-ink-500',
                  )}
                >
                  {queue.count}
                </span>
              </Link>
            ))}
          </div>
        </Card>

        {/* Order mix */}
        <Card>
          <CardHeader title="Orders by status" description="Where the pipeline is sitting." />
          <div className="space-y-3.5 p-5">
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-8" />
              ))
            ) : data?.orders_by_status.length ? (
              data.orders_by_status.map((row) => {
                const meta = ORDER_STATUS[row.status] ?? ORDER_STATUS.draft
                const percent = (row.count / totalOrders) * 100
                return (
                  <div key={row.status}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-ink-700">{meta.label}</span>
                      <span className="font-bold text-ink-900">{row.count}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={cn('h-full rounded-full', meta.dot)}
                        style={{ width: `${Math.max(percent, 2)}%` }}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="py-6 text-center text-sm text-ink-500">No orders yet.</p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Payouts" icon={<Banknote className="h-4 w-4" />} />
        <div className="p-5">
          <Link to="/admin/payouts" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            Review and settle withdrawal requests →
          </Link>
        </div>
      </Card>
    </div>
  )
}
