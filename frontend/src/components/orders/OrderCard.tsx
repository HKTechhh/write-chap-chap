import type * as React from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, FileText, Users, Wand2 } from 'lucide-react'
import { StatusBadge } from '@/components/ui/Badge'
import { cn, deadlineTone, formatMoney, relativeTime, truncate } from '@/lib/utils'
import type { OrderListItem } from '@/api/types'

const DEADLINE_TONE = {
  overdue: 'text-red-600',
  urgent: 'text-amber-600',
  soon: 'text-gold-600',
  calm: 'text-ink-500',
}

export function OrderCard({
  order,
  showClient,
  footer,
}: {
  order: OrderListItem
  showClient?: boolean
  footer?: React.ReactNode
}) {
  const tone = deadlineTone(order.deadline)
  const humanization = order.order_type === 'humanization'

  return (
    <div className="card card-hover overflow-hidden">
      <Link to={`/orders/${order.id}`} className="block p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={order.status} />
              {humanization && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold-50 px-2.5 py-1 text-xs font-semibold text-gold-700 ring-1 ring-inset ring-gold-200">
                  <Wand2 className="h-3 w-3" />
                  Humanization
                </span>
              )}
              {order.is_overdue && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                  <AlertTriangle className="h-3 w-3" />
                  Overdue
                </span>
              )}
            </div>

            <h3 className="mt-3 text-base font-semibold leading-snug text-ink-900 line-clamp-2">
              {order.title}
            </h3>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                {order.subject_display}
              </span>
              <span className={cn('inline-flex items-center gap-1.5 font-medium', DEADLINE_TONE[tone])}>
                <Clock className="h-3.5 w-3.5" />
                {tone === 'overdue' ? 'Overdue' : 'Due'} {relativeTime(order.deadline)}
              </span>
              {order.bid_count > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {order.bid_count} bid{order.bid_count === 1 ? '' : 's'}
                </span>
              )}
              {showClient && order.client_name && (
                <span className="truncate">by {order.client_name}</span>
              )}
              {order.writer_name && <span className="truncate">Writer: {order.writer_name}</span>}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-lg font-bold text-ink-900">{formatMoney(order.budget)}</p>
            {humanization && order.pages ? (
              <p className="text-xs text-ink-500">
                {order.pages} page{order.pages === 1 ? '' : 's'}
              </p>
            ) : (
              order.has_bid && <p className="text-xs font-medium text-teal-600">You bid</p>
            )}
          </div>
        </div>
      </Link>

      {footer && <div className="border-t border-ink-200 bg-ink-50/60 px-5 py-3">{footer}</div>}
    </div>
  )
}

export function OrderRow({ order }: { order: OrderListItem }) {
  return (
    <Link
      to={`/orders/${order.id}`}
      className="flex items-center gap-4 border-b border-ink-100 px-5 py-3.5 transition-colors last:border-0 hover:bg-ink-50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-900">{order.title}</p>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          {order.subject_display} · due {relativeTime(order.deadline)}
        </p>
      </div>
      <span className="shrink-0 text-sm font-semibold text-ink-800">
        {formatMoney(order.budget)}
      </span>
      <StatusBadge status={order.status} className="shrink-0" />
    </Link>
  )
}

export function OrderDescription({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{truncate(text, 400)}</p>
  )
}
