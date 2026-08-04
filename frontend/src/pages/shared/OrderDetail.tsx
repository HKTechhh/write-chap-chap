import type * as React from 'react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Gavel,
  Lock,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Send,
  Star,
  Upload,
  Wallet as WalletIcon,
} from 'lucide-react'
import { bids as bidsApi, orders as ordersApi, reviews as reviewsApi } from '@/api/endpoints'
import { ApiError, mediaUrl } from '@/api/client'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { ORDER_STATUS } from '@/lib/constants'
import {
  cn,
  deadlineTone,
  formatBytes,
  formatDateTime,
  formatMoney,
  hoursToLabel,
  relativeTime,
} from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Alert, Avatar, EmptyState, PageLoader, Rating } from '@/components/ui/Misc'
import { StatusBadge, TierBadge } from '@/components/ui/Badge'
import { ScanReport } from '@/components/orders/ScanReport'
import { OrderChat } from '@/components/chat/OrderChat'
import type { Bid, Order, PublicWriter, WriterTier } from '@/api/types'

type ModalKind = 'revision' | 'dispute' | 'submit' | 'review' | 'cancel' | null

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, isClient, isWriter, isAdmin } = useAuth()

  const { data: order, loading, error, reload } = useAsync<Order>(
    () => ordersApi.get(id!),
    [id],
  )

  const [modal, setModal] = useState<ModalKind>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <PageLoader label="Loading order…" />
  if (error || !order) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-6 w-6" />}
        title="Order not available"
        description={error ?? "This order doesn't exist, or you don't have access to it."}
        action={
          <Button variant="secondary" onClick={() => navigate('/orders')}>
            Back to orders
          </Button>
        }
      />
    )
  }

  const isOwner = user?.id === order.client
  const isAssigned = user?.id === order.writer
  const latest = order.deliverables[0]
  const myReview = order.reviews.find((review) => review.reviewer === user?.id)

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    try {
      await action()
      toast.success(success)
      setModal(null)
      reload()
    } catch (err) {
      toast.error(
        'Action failed',
        err instanceof ApiError && err.status === 402
          ? 'Not enough wallet balance — top up first.'
          : err instanceof Error
            ? err.message
            : undefined,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <div className="card overflow-hidden">
        <div className="p-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={order.status} />
            {order.order_type === 'humanization' && (
              <span className="rounded-full bg-gold-50 px-2.5 py-1 text-xs font-semibold text-gold-700 ring-1 ring-inset ring-gold-200">
                Humanization · fixed price
              </span>
            )}
            {order.is_overdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                <AlertTriangle className="h-3 w-3" />
                Past deadline
              </span>
            )}
            <span className="text-xs text-ink-400">#{order.id}</span>
          </div>

          <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-ink-900">
            {order.title}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              {order.subject_display}
            </span>
            <span
              className={cn(
                'inline-flex items-center gap-1.5 font-medium',
                deadlineTone(order.deadline) === 'overdue'
                  ? 'text-red-600'
                  : deadlineTone(order.deadline) === 'urgent'
                    ? 'text-amber-600'
                    : 'text-ink-600',
              )}
            >
              <Clock className="h-4 w-4" />
              Due {formatDateTime(order.deadline)} ({relativeTime(order.deadline)})
            </span>
            <span className="text-lg font-bold text-ink-900">{formatMoney(order.budget)}</span>
          </div>

          <p className="mt-2 text-xs text-ink-400">{ORDER_STATUS[order.status].description}</p>
        </div>

        {/* Action bar */}
        <ActionBar
          order={order}
          isOwner={isOwner}
          isAssigned={isAssigned}
          isAdmin={isAdmin}
          busy={busy}
          onFund={() => run(() => ordersApi.fund(order.id), 'Escrow funded — the writer can start.')}
          onPublish={() => run(() => ordersApi.publish(order.id), 'Order is now open for bids.')}
          onApprove={() =>
            run(() => ordersApi.approve(order.id), 'Approved — payment released to the writer.')
          }
          onOpen={setModal}
          hasReview={Boolean(myReview)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Brief */}
          <Card>
            <CardHeader title="The brief" icon={<FileText className="h-4 w-4" />} />
            <div className="p-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                {order.description}
              </p>

              {order.order_type === 'humanization' && order.word_count && (
                <div className="mt-5 grid grid-cols-3 gap-4 rounded-xl bg-gold-50 p-4 ring-1 ring-inset ring-gold-200">
                  <Stat label="Words" value={order.word_count.toLocaleString()} />
                  <Stat label="Pages" value={String(order.pages ?? 0)} />
                  <Stat label="Fixed price" value={formatMoney(order.budget)} />
                </div>
              )}

              {order.attachments.length > 0 && (
                <div className="mt-5">
                  <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                    Attachments
                  </p>
                  <ul className="space-y-2">
                    {order.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        <a
                          href={mediaUrl(attachment.file)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 rounded-xl border border-ink-200 px-3.5 py-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50/50"
                        >
                          <Paperclip className="h-4 w-4 shrink-0 text-ink-400" />
                          <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                            {attachment.original_name || 'Attachment'}
                          </span>
                          <span className="shrink-0 text-xs text-ink-500">
                            {formatBytes(attachment.size_bytes)}
                          </span>
                          <Download className="h-4 w-4 shrink-0 text-ink-400" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          {/* Deliverables */}
          {order.deliverables.length > 0 && (
            <Card>
              <CardHeader
                title="Submitted work"
                description={`${order.deliverables.length} version${order.deliverables.length === 1 ? '' : 's'} submitted`}
                icon={<Upload className="h-4 w-4" />}
              />
              <div className="space-y-5 p-5">
                {order.deliverables.map((deliverable) => (
                  <div key={deliverable.id} className="rounded-2xl border border-ink-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-ink-900">
                          Version {deliverable.version_number}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          by {deliverable.writer_name} · {formatDateTime(deliverable.submitted_at)}
                          {deliverable.word_count
                            ? ` · ${deliverable.word_count.toLocaleString()} words`
                            : ''}
                        </p>
                      </div>
                      <a
                        href={mediaUrl(deliverable.file)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />}>
                          Download
                        </Button>
                      </a>
                    </div>

                    {deliverable.note && (
                      <p className="mt-3 rounded-lg bg-ink-50 p-3 text-sm text-ink-700">
                        {deliverable.note}
                      </p>
                    )}

                    <div className="mt-4">
                      <ScanReport deliverable={deliverable} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Bids */}
          {order.bids.length > 0 && order.status === 'open_for_bids' && (
            <Card>
              <CardHeader
                title={isOwner ? `${order.bids.length} bid${order.bids.length === 1 ? '' : 's'} received` : 'Your bid'}
                description={
                  isOwner
                    ? 'Compare price, delivery time and track record before you choose.'
                    : undefined
                }
                icon={<Send className="h-4 w-4" />}
              />
              <div className="space-y-3 p-5">
                {order.bids.map((bid) => (
                  <BidRow
                    key={bid.id}
                    bid={bid}
                    canAccept={isOwner}
                    fixedPrice={order.order_type === 'humanization'}
                    busy={busy}
                    onAccept={() =>
                      run(
                        () => bidsApi.accept(bid.id),
                        'Bid accepted — fund escrow to start the work.',
                      )
                    }
                    onReject={() => run(() => bidsApi.reject(bid.id), 'Bid rejected.')}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* Chat */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Order chat"
              description="Screened for contact details — keeping it here is what keeps escrow protecting you."
              icon={<MessageSquare className="h-4 w-4" />}
            />
            <OrderChat orderId={order.id} canPost={Boolean(order.writer)} />
          </Card>

          {/* Reviews */}
          {order.reviews.length > 0 && (
            <Card>
              <CardHeader title="Reviews" icon={<Star className="h-4 w-4" />} />
              <div className="space-y-4 p-5">
                {order.reviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-ink-200 p-4">
                    <div className="flex items-start gap-3">
                      <Avatar name={review.reviewer_name} src={review.reviewer_avatar} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-ink-900">
                            {review.reviewer_name}
                          </p>
                          <Rating value={review.rating} />
                          <span className="text-xs text-ink-400">
                            {relativeTime(review.created_at)}
                          </span>
                        </div>
                        {review.comment && (
                          <p className="mt-2 text-sm leading-relaxed text-ink-700">
                            {review.comment}
                          </p>
                        )}
                        {review.reply && (
                          <div className="mt-3 rounded-lg bg-ink-50 p-3">
                            <p className="text-xs font-semibold text-ink-600">
                              {review.reviewee_name} replied
                            </p>
                            <p className="mt-1 text-sm text-ink-700">{review.reply}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Side rail */}
        <div className="space-y-6">
          <EscrowPanel order={order} />
          <PeoplePanel order={order} />
          <TimelinePanel order={order} />

          {order.fines.length > 0 && (
            <Card>
              <CardHeader title="Fines on this order" icon={<AlertTriangle className="h-4 w-4" />} />
              <div className="space-y-2.5 p-5">
                {order.fines.map((fine) => (
                  <div
                    key={fine.id}
                    className={cn(
                      'rounded-xl p-3 ring-1 ring-inset',
                      fine.is_waived ? 'bg-ink-50 ring-ink-200' : 'bg-red-50 ring-red-200',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-900">
                        {formatMoney(fine.amount)}
                      </p>
                      {fine.is_waived && (
                        <span className="text-xs font-semibold text-ink-500">Waived</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-ink-600">{fine.notes || fine.reason}</p>
                    <p className="mt-1 text-[11px] text-ink-500">
                      {formatMoney(fine.client_refund_portion)} refunded to the client
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {order.disputes.length > 0 && (
            <Card>
              <CardHeader title="Disputes" icon={<Gavel className="h-4 w-4" />} />
              <div className="space-y-3 p-5">
                {order.disputes.map((dispute) => (
                  <div key={dispute.id} className="rounded-xl bg-ink-50 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-ink-900">
                        Raised by {dispute.raised_by_name}
                      </p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                          dispute.status === 'resolved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700',
                        )}
                      >
                        {dispute.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{dispute.reason}</p>
                    {dispute.resolution_notes && (
                      <p className="mt-2 border-t border-ink-200 pt-2 text-xs text-ink-700">
                        <span className="font-semibold">Resolution:</span>{' '}
                        {dispute.resolution_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Modals */}
      <RevisionModal
        open={modal === 'revision'}
        busy={busy}
        onClose={() => setModal(null)}
        onSubmit={(note) =>
          run(() => ordersApi.requestRevision(order.id, note), 'Revision requested.')
        }
      />
      <DisputeModal
        open={modal === 'dispute'}
        busy={busy}
        onClose={() => setModal(null)}
        onSubmit={(reason) =>
          run(() => ordersApi.dispute(order.id, reason), 'Dispute opened — an admin will review it.')
        }
      />
      <SubmitWorkModal
        open={modal === 'submit'}
        busy={busy}
        onClose={() => setModal(null)}
        onSubmit={(file, note) => {
          const form = new FormData()
          form.append('file', file)
          form.append('note', note)
          return run(
            () => ordersApi.submitDeliverable(order.id, form),
            'Work submitted — screening is running now.',
          )
        }}
      />
      <ReviewModal
        open={modal === 'review'}
        busy={busy}
        onClose={() => setModal(null)}
        counterparty={isOwner ? order.writer_detail?.display_name : order.client_detail.display_name}
        onSubmit={(rating, comment) =>
          run(
            () => reviewsApi.create({ order: order.id, rating, comment }),
            'Thanks — your review is live.',
          )
        }
      />
      <Modal
        open={modal === 'cancel'}
        onClose={() => setModal(null)}
        title="Cancel this order?"
        description="Any money held in escrow is refunded to your wallet."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => run(() => ordersApi.cancel(order.id), 'Order canceled and refunded.')}
            >
              Cancel order
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          The assigned writer will be notified. This can't be undone.
        </p>
      </Modal>
    </div>
  )
}

/* ----------------------------------------------------------- action bar */

function ActionBar({
  order,
  isOwner,
  isAssigned,
  isAdmin,
  busy,
  onFund,
  onPublish,
  onApprove,
  onOpen,
  hasReview,
}: {
  order: Order
  isOwner: boolean
  isAssigned: boolean
  isAdmin: boolean
  busy: boolean
  onFund: () => void
  onPublish: () => void
  onApprove: () => void
  onOpen: (kind: ModalKind) => void
  hasReview: boolean
}) {
  const actions: React.ReactNode[] = []

  if (isOwner && order.status === 'draft') {
    actions.push(
      <Button key="publish" loading={busy} onClick={onPublish}>
        Publish for bids
      </Button>,
    )
  }

  if (isOwner && order.status === 'bid_accepted') {
    actions.push(
      <Button key="fund" loading={busy} icon={<Lock className="h-4 w-4" />} onClick={onFund}>
        Fund escrow · {formatMoney(order.budget)}
      </Button>,
    )
  }

  if (isOwner && order.status === 'submitted') {
    actions.push(
      <Button
        key="approve"
        variant="success"
        loading={busy}
        icon={<CheckCircle2 className="h-4 w-4" />}
        onClick={onApprove}
      >
        Approve & release payment
      </Button>,
      <Button
        key="revision"
        variant="secondary"
        icon={<RotateCcw className="h-4 w-4" />}
        onClick={() => onOpen('revision')}
      >
        Request revision
      </Button>,
    )
  }

  if (isAssigned && ['in_progress', 'in_revision', 'escrowed'].includes(order.status)) {
    actions.push(
      <Button
        key="submit"
        variant="accent"
        icon={<Upload className="h-4 w-4" />}
        onClick={() => onOpen('submit')}
      >
        {order.status === 'in_revision' ? 'Submit revision' : 'Submit work'}
      </Button>,
    )
  }

  if (order.status === 'completed' && (isOwner || isAssigned) && !hasReview) {
    actions.push(
      <Button key="review" icon={<Star className="h-4 w-4" />} onClick={() => onOpen('review')}>
        Leave a review
      </Button>,
    )
  }

  const canDispute =
    (isOwner || isAssigned) &&
    ['submitted', 'in_revision', 'in_progress'].includes(order.status) &&
    !order.disputes.some((dispute) => dispute.status !== 'resolved')

  if (canDispute) {
    actions.push(
      <Button
        key="dispute"
        variant="ghost"
        icon={<Gavel className="h-4 w-4" />}
        onClick={() => onOpen('dispute')}
      >
        Raise a dispute
      </Button>,
    )
  }

  if (isOwner && !['completed', 'canceled'].includes(order.status)) {
    actions.push(
      <Button
        key="cancel"
        variant="ghost"
        className="text-red-600 hover:bg-red-50"
        icon={<Ban className="h-4 w-4" />}
        onClick={() => onOpen('cancel')}
      >
        Cancel
      </Button>,
    )
  }

  if (actions.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-ink-200 bg-ink-50/70 px-6 py-4">
      {actions}
    </div>
  )
}

/* --------------------------------------------------------------- panels */

function EscrowPanel({ order }: { order: Order }) {
  const escrow = order.escrow
  return (
    <Card>
      <CardHeader title="Escrow & fees" icon={<WalletIcon className="h-4 w-4" />} />
      <div className="space-y-3 p-5 text-sm">
        <Row label="Order value" value={formatMoney(order.budget)} />
        <Row label={`Platform fee (${order.quote.fee_percent}%)`} value={`− ${formatMoney(order.quote.platform_fee)}`} />
        <div className="border-t border-ink-200 pt-3">
          <Row label="Writer receives" value={formatMoney(order.quote.writer_receives)} strong />
        </div>

        {escrow ? (
          <div
            className={cn(
              'mt-4 rounded-xl p-3.5 ring-1 ring-inset',
              escrow.status === 'held'
                ? 'bg-violet-50 ring-violet-200'
                : escrow.status === 'released'
                  ? 'bg-emerald-50 ring-emerald-200'
                  : 'bg-ink-50 ring-ink-200',
            )}
          >
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-600">
              <Lock className="h-3 w-3" />
              {escrow.status === 'held'
                ? 'Held in escrow'
                : escrow.status === 'released'
                  ? 'Released to writer'
                  : escrow.status === 'partial_release'
                    ? 'Partially released'
                    : 'Refunded'}
            </p>
            <p className="mt-1 text-lg font-bold text-ink-900">
              {formatMoney(escrow.amount_held)}
            </p>
            {escrow.released_at && (
              <p className="mt-0.5 text-xs text-ink-500">{formatDateTime(escrow.released_at)}</p>
            )}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-ink-50 p-3.5 text-xs leading-relaxed text-ink-600">
            Not funded yet. Money moves into escrow once a bid is accepted and the client funds
            the order.
          </p>
        )}
      </div>
    </Card>
  )
}

function PeoplePanel({ order }: { order: Order }) {
  return (
    <Card>
      <CardHeader title="People" />
      <div className="space-y-4 p-5">
        <Person label="Client" name={order.client_detail.display_name} avatar={order.client_detail.avatar} />
        {order.writer_detail ? (
          <Person
            label="Writer"
            name={order.writer_detail.display_name}
            avatar={order.writer_detail.avatar}
            link={`/w/${order.writer_detail.username}`}
          />
        ) : (
          <div>
            <p className="text-xs font-medium text-ink-500">Writer</p>
            <p className="mt-1 text-sm text-ink-400">Not assigned yet</p>
          </div>
        )}
      </div>
    </Card>
  )
}

function Person({
  label,
  name,
  avatar,
  link,
}: {
  label: string
  name: string
  avatar: string | null
  link?: string
}) {
  const inner = (
    <div className="flex items-center gap-3">
      <Avatar name={name} src={avatar} size="md" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink-500">{label}</p>
        <p className="truncate text-sm font-semibold text-ink-900">{name}</p>
      </div>
    </div>
  )
  return link ? (
    <Link to={link} className="block rounded-xl transition-colors hover:bg-ink-50">
      {inner}
    </Link>
  ) : (
    inner
  )
}

function TimelinePanel({ order }: { order: Order }) {
  const events = [
    { label: 'Posted', at: order.created_at, done: true },
    { label: 'Funded into escrow', at: order.funded_at, done: Boolean(order.funded_at) },
    { label: 'Work started', at: order.started_at, done: Boolean(order.started_at) },
    { label: 'Delivered', at: order.submitted_at, done: Boolean(order.submitted_at) },
    { label: 'Completed', at: order.completed_at, done: Boolean(order.completed_at) },
  ]

  return (
    <Card>
      <CardHeader title="Timeline" icon={<Clock className="h-4 w-4" />} />
      <div className="p-5">
        <ol className="relative space-y-5 border-l border-ink-200 pl-5">
          {events.map((event) => (
            <li key={event.label} className="relative">
              <span
                className={cn(
                  'absolute -left-[25px] top-1 h-3 w-3 rounded-full ring-4 ring-white',
                  event.done ? 'bg-brand-500' : 'bg-ink-300',
                )}
              />
              <p
                className={cn(
                  'text-sm font-medium',
                  event.done ? 'text-ink-900' : 'text-ink-400',
                )}
              >
                {event.label}
              </p>
              <p className="text-xs text-ink-500">
                {event.at ? formatDateTime(event.at) : 'Pending'}
              </p>
            </li>
          ))}
        </ol>

        {order.review_deadline && order.status === 'submitted' && (
          <Alert tone="info" className="mt-5">
            Auto-approves {relativeTime(order.review_deadline)} if nobody responds.
          </Alert>
        )}
        {order.revision_count > 0 && (
          <p className="mt-4 text-xs text-ink-500">
            {order.revision_count} revision{order.revision_count === 1 ? '' : 's'} requested
          </p>
        )}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------- bid card */

function BidRow({
  bid,
  canAccept,
  fixedPrice,
  busy,
  onAccept,
  onReject,
}: {
  bid: Bid
  canAccept: boolean
  fixedPrice: boolean
  busy: boolean
  onAccept: () => void
  onReject: () => void
}) {
  // The API sends a full PublicWriter when the bidder has a writer profile,
  // and falls back to a plain User when they don't.
  const writer = bid.writer_detail
  const profile: PublicWriter | null = 'tier' in writer ? writer : null
  const tier: WriterTier = profile?.tier ?? 'new'

  return (
    <div className="rounded-2xl border border-ink-200 p-4 transition-colors hover:border-brand-300">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <Avatar name={writer.display_name} src={writer.avatar} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/w/${writer.username}`}
                className="text-sm font-semibold text-ink-900 hover:text-brand-700"
              >
                {writer.display_name}
              </Link>
              <TierBadge tier={tier} />
            </div>
            {profile && (
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                <Rating value={profile.rating_avg} count={profile.rating_count} />
                <span>{profile.completed_orders} orders</span>
                <span>{Number(profile.on_time_rate).toFixed(0)}% on time</span>
              </div>
            )}
            {bid.message && (
              <p className="mt-2.5 text-sm leading-relaxed text-ink-600">{bid.message}</p>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-lg font-bold text-ink-900">{formatMoney(bid.amount)}</p>
          {fixedPrice && <p className="text-[11px] text-ink-400">fixed price</p>}
          <p className="mt-0.5 text-xs text-ink-500">
            delivers in {hoursToLabel(bid.delivery_time_hours)}
          </p>
        </div>
      </div>

      {canAccept && bid.status === 'pending' && (
        <div className="mt-4 flex gap-2 border-t border-ink-200 pt-3.5">
          <Button size="sm" loading={busy} onClick={onAccept}>
            Accept this bid
          </Button>
          <Button size="sm" variant="ghost" onClick={onReject}>
            Decline
          </Button>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- modals */

function RevisionModal({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onSubmit: (note: string) => void
}) {
  const [note, setNote] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request a revision"
      description="Be specific — the clearer the note, the faster the fix."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!note.trim()} onClick={() => onSubmit(note)}>
            Send back for revision
          </Button>
        </>
      }
    >
      <Textarea
        name="note"
        label="What needs changing?"
        rows={6}
        placeholder="e.g. Section 2 needs three more peer-reviewed sources from the last 5 years, and the conclusion doesn't address the second research question."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
    </Modal>
  )
}

function DisputeModal({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raise a dispute"
      description="An admin reads the brief, the deliverable and the full chat before deciding."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => onSubmit(reason)}>
            Open dispute
          </Button>
        </>
      }
    >
      <Alert tone="warning" className="mb-4">
        Try a revision request first — it's faster and free. Disputes freeze the order until an
        admin resolves them.
      </Alert>
      <Textarea
        name="reason"
        label="What went wrong?"
        rows={6}
        placeholder="Explain the problem and what outcome you're asking for."
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
    </Modal>
  )
}

function SubmitWorkModal({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onSubmit: (file: File, note: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Submit your work"
      description="It goes through AI-content and plagiarism screening immediately."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!file}
            onClick={() => file && onSubmit(file, note)}
          >
            Submit for review
          </Button>
        </>
      }
    >
      <label
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
          file ? 'border-gold-400 bg-gold-50' : 'border-ink-300 bg-ink-50 hover:border-gold-400',
        )}
      >
        <input
          type="file"
          className="sr-only"
          accept=".doc,.docx,.pdf,.txt,.rtf,.odt"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            <FileText className="h-9 w-9 text-gold-600" />
            <p className="mt-3 text-sm font-semibold text-ink-900">{file.name}</p>
            <p className="mt-0.5 text-xs text-ink-500">{formatBytes(file.size)} · click to replace</p>
          </>
        ) : (
          <>
            <Upload className="h-9 w-9 text-ink-400" />
            <p className="mt-3 text-sm font-semibold text-ink-800">Upload the completed document</p>
            <p className="mt-0.5 text-xs text-ink-500">.docx, .pdf or .txt</p>
          </>
        )}
      </label>

      <Textarea
        name="note"
        label="Note to the client (optional)"
        className="mt-5"
        rows={4}
        placeholder="e.g. I've added the two extra sources you asked for and rewritten the conclusion."
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />

      <Alert tone="info" className="mt-5">
        Screening scores are shown to the client. Submitting AI-generated or copied work counts
        toward strikes.
      </Alert>
    </Modal>
  )
}

function ReviewModal({
  open,
  busy,
  onClose,
  onSubmit,
  counterparty,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onSubmit: (rating: number, comment: string) => void
  counterparty?: string
}) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Review ${counterparty ?? 'this order'}`}
      description="Only people who actually transacted can leave a review — that's what keeps ratings honest."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => onSubmit(rating, comment)}>
            Post review
          </Button>
        </>
      }
    >
      <div>
        <p className="label">Rating</p>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              className="rounded-lg p-1 transition-transform hover:scale-110"
              aria-label={`${value} star${value === 1 ? '' : 's'}`}
            >
              <Star
                className={cn(
                  'h-8 w-8',
                  value <= rating ? 'fill-gold-400 text-gold-400' : 'fill-ink-200 text-ink-200',
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <Textarea
        name="comment"
        label="Comment"
        className="mt-5"
        rows={5}
        placeholder="What went well? What could have been better?"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
    </Modal>
  )
}

/* --------------------------------------------------------------- shared */

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-ink-500">{label}</span>
      <span className={cn(strong ? 'text-base font-bold text-ink-900' : 'font-medium text-ink-800')}>
        {value}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="mt-0.5 text-base font-bold text-ink-900">{value}</p>
    </div>
  )
}
