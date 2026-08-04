import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { notifications as api } from '@/api/endpoints'
import type { Notification } from '@/api/types'
import { cn, relativeTime } from '@/lib/utils'
import { EmptyState } from '@/components/ui/Misc'

const KIND_DOT: Record<string, string> = {
  order: 'bg-brand-500',
  bid: 'bg-teal-500',
  payment: 'bg-emerald-500',
  dispute: 'bg-red-500',
  moderation: 'bg-amber-500',
  system: 'bg-ink-400',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const unread = items.filter((item) => !item.is_read).length

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.list()
      setItems(data.results ?? [])
    } catch {
      /* a failed notification poll should never interrupt the page */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = window.setInterval(load, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const markAll = async () => {
    await api.readAll()
    setItems((current) => current.map((item) => ({ ...item, is_read: true })))
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl p-2.5 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[22rem] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card-hover animate-scale-in">
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>
          <div className="scroll-slim max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <EmptyState
                title={loading ? 'Loading…' : 'Nothing yet'}
                description="Order updates, bids and payments will show up here."
                className="py-10"
              />
            ) : (
              items.map((item) => {
                const body = (
                  <>
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        KIND_DOT[item.kind] ?? KIND_DOT.system,
                        item.is_read && 'opacity-30',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm',
                          item.is_read ? 'text-ink-600' : 'font-semibold text-ink-900',
                        )}
                      >
                        {item.title}
                      </span>
                      {item.body && (
                        <span className="mt-0.5 block text-xs leading-snug text-ink-500">
                          {item.body}
                        </span>
                      )}
                      <span className="mt-1 block text-[11px] text-ink-400">
                        {relativeTime(item.created_at)}
                      </span>
                    </span>
                  </>
                )
                const className = cn(
                  'flex w-full gap-3 border-b border-ink-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-ink-50',
                  !item.is_read && 'bg-brand-50/40',
                )
                return item.link ? (
                  <Link
                    key={item.id}
                    to={item.link}
                    onClick={() => setOpen(false)}
                    className={className}
                  >
                    {body}
                  </Link>
                ) : (
                  <div key={item.id} className={className}>
                    {body}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
