import { useState } from 'react'
import { AlertTriangle, Clock, RefreshCw, Search, Send, Wand2 } from 'lucide-react'
import { orders as ordersApi } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { SUBJECTS } from '@/lib/constants'
import { formatMoney, hoursToLabel, relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Misc'
import { OrderCard } from '@/components/orders/OrderCard'
import { PageIntro } from '@/pages/client/ClientDashboard'
import type { OrderListItem } from '@/api/types'

const DELIVERY_OPTIONS = [
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 48, label: '2 days' },
  { value: 72, label: '3 days' },
  { value: 120, label: '5 days' },
  { value: 168, label: '1 week' },
]

export default function BrowseOrders() {
  const { user } = useAuth()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [target, setTarget] = useState<OrderListItem | null>(null)

  const { data, loading, error, reload } = useAsync(
    () => ordersApi.list({ tab: 'open', search, subject, page_size: 30 }),
    [search, subject],
  )

  const suspended = user?.writer_profile?.is_suspended

  return (
    <div className="space-y-6">
      <PageIntro
        title="Browse orders"
        subtitle="Open briefs you can bid on right now."
      />

      {suspended && (
        <Alert tone="danger" icon={<AlertTriangle className="h-4 w-4" />} title="Bidding disabled">
          Your account is suspended, so you can't place new bids. Contact support to resolve it.
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          name="search"
          placeholder="Search open orders…"
          leading={<Search className="h-4 w-4" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          name="subject"
          options={SUBJECTS}
          placeholder="All subjects"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          wrapClassName="sm:w-56"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <Alert tone="danger" icon={<AlertTriangle className="h-4 w-4" />} title="Couldn't load open orders">
          <p>{error}</p>
          <button
            type="button"
            onClick={reload}
            className="mt-2 inline-flex items-center gap-1.5 font-medium underline underline-offset-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </Alert>
      ) : data?.results.length ? (
        <>
          <p className="text-sm text-ink-500">
            {data.count} open order{data.count === 1 ? '' : 's'}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {data.results.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                showClient
                footer={
                  order.has_bid ? (
                    <p className="text-sm font-medium text-teal-700">
                      You've already bid on this order
                    </p>
                  ) : (
                    <Button
                      size="sm"
                      variant="accent"
                      icon={<Send className="h-3.5 w-3.5" />}
                      disabled={suspended}
                      onClick={() => setTarget(order)}
                    >
                      Place a bid
                    </Button>
                  )
                }
              />
            ))}
          </div>
        </>
      ) : (
        <div className="card">
          <EmptyState
            icon={<Search className="h-6 w-6" />}
            title="No open orders right now"
            description="New briefs land throughout the day — check back shortly, or widen your filters."
          />
        </div>
      )}

      <BidModal
        order={target}
        onClose={() => setTarget(null)}
        onPlaced={() => {
          toast.success('Bid placed', 'The client has been notified.')
          setTarget(null)
          reload()
        }}
      />
    </div>
  )
}

function BidModal({
  order,
  onClose,
  onPlaced,
}: {
  order: OrderListItem | null
  onClose: () => void
  onPlaced: () => void
}) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [hours, setHours] = useState(48)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const fixedPrice = order?.order_type === 'humanization'
  const effectiveAmount = fixedPrice ? (order?.budget ?? '0') : amount

  const submit = async () => {
    if (!order) return
    if (!fixedPrice && !(Number(amount) > 0)) {
      toast.error('Enter a bid amount above zero.')
      return
    }
    setBusy(true)
    try {
      await ordersApi.placeBid(order.id, {
        amount: String(effectiveAmount),
        delivery_time_hours: hours,
        message,
      })
      setAmount('')
      setMessage('')
      onPlaced()
    } catch (error) {
      toast.error('Bid failed', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title="Place your bid"
      description={order?.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={submit}>
            Submit bid
          </Button>
        </>
      }
    >
      {order && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-ink-50 p-4 text-sm">
            <div>
              <p className="text-xs text-ink-500">Client budget</p>
              <p className="mt-0.5 text-lg font-bold text-ink-900">{formatMoney(order.budget)}</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Client deadline</p>
              <p className="mt-0.5 flex items-center gap-1.5 font-medium text-ink-800">
                <Clock className="h-3.5 w-3.5" />
                {relativeTime(order.deadline)}
              </p>
            </div>
          </div>

          {fixedPrice ? (
            <Alert tone="warning" icon={<Wand2 className="h-4 w-4" />} title="Fixed-price job">
              Humanization jobs are priced at KES 50 per 250 words, so you're not bidding on
              price — you're offering to take it at {formatMoney(order.budget)}. Compete on
              delivery time and your track record.
            </Alert>
          ) : (
            <Input
              name="amount"
              type="number"
              min={1}
              label="Your bid (KES)"
              hint="Bidding lower doesn't guarantee the job — clients weigh rating and on-time rate too."
              placeholder={String(Math.round(Number(order.budget) * 0.9))}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          )}

          <Select
            name="hours"
            label="Delivery time"
            hint="Be realistic — late delivery triggers automatic fines."
            options={DELIVERY_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            value={hours}
            onChange={(event) => setHours(Number(event.target.value))}
          />

          <Textarea
            name="message"
            label="Message to the client"
            rows={5}
            hint="Say why you're a good fit. Don't include contact details — messages are screened."
            placeholder="I've written several literature reviews in this area and can deliver a fully referenced draft with an outline shared upfront."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />

          <div className="rounded-xl bg-brand-50 p-4 text-sm ring-1 ring-inset ring-brand-200">
            <p className="font-semibold text-brand-900">If your bid is accepted</p>
            <p className="mt-1 text-xs leading-relaxed text-brand-800">
              The client funds escrow before you start. You deliver in{' '}
              {hoursToLabel(hours)}, and payment releases on approval — or automatically if the
              client doesn't respond within 72 hours.
            </p>
          </div>
        </div>
      )}
    </Modal>
  )
}
