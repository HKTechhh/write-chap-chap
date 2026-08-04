import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Clock, ListChecks, Search } from 'lucide-react'
import { bids as bidsApi } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useToast } from '@/context/ToastContext'
import { formatMoney, hoursToLabel, relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, Skeleton, Tabs } from '@/components/ui/Misc'
import { PageIntro } from '@/pages/client/ClientDashboard'
import type { BidStatus } from '@/api/types'

const TABS = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Won' },
  { value: 'rejected', label: 'Not chosen' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

const TONE: Record<BidStatus, 'warning' | 'success' | 'neutral' | 'danger'> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'neutral',
  withdrawn: 'neutral',
}

const LABEL: Record<BidStatus, string> = {
  pending: 'Awaiting decision',
  accepted: 'Won',
  rejected: 'Not chosen',
  withdrawn: 'Withdrawn',
}

export default function MyBids() {
  const toast = useToast()
  const [status, setStatus] = useState('')
  const { data, loading, reload } = useAsync(
    () => bidsApi.mine({ status, page_size: 40 }),
    [status],
  )

  const withdraw = async (id: number) => {
    try {
      await bidsApi.withdraw(id)
      toast.success('Bid withdrawn')
      reload()
    } catch (error) {
      toast.error('Could not withdraw', error instanceof Error ? error.message : undefined)
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="My bids"
        subtitle="Every bid you've placed and where it stands."
        action={
          <Link to="/browse">
            <Button variant="accent" icon={<Search className="h-4 w-4" />}>
              Find more work
            </Button>
          </Link>
        }
      />

      <Tabs tabs={TABS} value={status} onChange={setStatus} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : data?.results.length ? (
        <div className="space-y-3">
          {data.results.map((bid) => (
            <div key={bid.id} className="card card-hover p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONE[bid.status]}>{LABEL[bid.status]}</Badge>
                    <span className="text-xs text-ink-400">
                      placed {relativeTime(bid.created_at)}
                    </span>
                  </div>
                  <Link
                    to={`/orders/${bid.order}`}
                    className="mt-2.5 block text-base font-semibold text-ink-900 hover:text-brand-700"
                  >
                    Order #{bid.order}
                  </Link>
                  {bid.message && (
                    <p className="mt-2 line-clamp-2 text-sm text-ink-600">{bid.message}</p>
                  )}
                  <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-500">
                    <Clock className="h-3.5 w-3.5" />
                    Offered delivery in {hoursToLabel(bid.delivery_time_hours)}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-ink-900">{formatMoney(bid.amount)}</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Link to={`/orders/${bid.order}`}>
                      <Button size="sm" variant="secondary" fullWidth>
                        View order
                      </Button>
                    </Link>
                    {bid.status === 'pending' && (
                      <Button size="sm" variant="ghost" onClick={() => withdraw(bid.id)}>
                        Withdraw
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={<ListChecks className="h-6 w-6" />}
            title="No bids yet"
            description="Browse the open feed and bid on briefs that match your subjects."
            action={
              <Link to="/browse">
                <Button variant="accent">Browse orders</Button>
              </Link>
            }
          />
        </div>
      )}
    </div>
  )
}
