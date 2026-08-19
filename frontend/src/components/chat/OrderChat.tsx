import type * as React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Loader2,
  Lock,
  Paperclip,
  Send,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import { messages as messagesApi } from '@/api/endpoints'
import { ApiError, mediaUrl } from '@/api/client'
import type { LeakScan, Message } from '@/api/types'
import { useAuth } from '@/context/AuthContext'
import { useDebounced } from '@/hooks/useAsync'
import { cn, formatBytes, formatDateTime } from '@/lib/utils'
import { LEAK_KIND_LABEL } from '@/lib/constants'
import { Avatar, EmptyState, Spinner } from '@/components/ui/Misc'

interface BlockedInfo {
  summary: string
  kinds: string[]
  guidance: string
}

export function OrderChat({ orderId, canPost }: { orderId: number; canPost: boolean }) {
  const { user } = useAuth()
  const [items, setItems] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [blocked, setBlocked] = useState<BlockedInfo | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    try {
      setItems(await messagesApi.list(orderId))
    } catch {
      /* leave the thread as-is on a transient failure */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(load, 20_000)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [items.length])

  // ---- live pre-send screening -------------------------------------------
  const debounced = useDebounced(draft, 450)
  const [scan, setScan] = useState<LeakScan | null>(null)
  const [scanning, setScanning] = useState(false)

  useEffect(() => {
    if (!debounced.trim()) {
      setScan(null)
      return
    }
    let active = true
    setScanning(true)
    messagesApi
      .scan(debounced)
      .then((result) => {
        if (active) setScan(result)
      })
      .catch(() => {
        // If the pre-check can't run, the server still enforces on send.
        if (active) setScan(null)
      })
      .finally(() => {
        if (active) setScanning(false)
      })
    return () => {
      active = false
    }
  }, [debounced])

  const willBlock = Boolean(scan?.blocked)

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    if ((!draft.trim() && !file) || sending) return

    setSending(true)
    setBlocked(null)
    const form = new FormData()
    form.append('content', draft)
    if (file) form.append('attachment', file)

    try {
      const created = await messagesApi.send(orderId, form)
      setItems((current) => [...current, created])
      setDraft('')
      setFile(null)
      setScan(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setBlocked({
          summary: error.data?.summary ?? 'contact details',
          kinds: error.data?.kinds ?? [],
          guidance: error.data?.guidance ?? '',
        })
      } else {
        setBlocked({
          summary: error instanceof Error ? error.message : 'Message could not be sent.',
          kinds: [],
          guidance: '',
        })
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Thread */}
      <div className="scroll-slim min-h-[280px] flex-1 space-y-4 overflow-y-auto p-5">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Send className="h-6 w-6" />}
            title="No messages yet"
            description="Keep everything about this order here — it's the record an admin reads if a dispute is ever raised."
            className="py-10"
          />
        ) : (
          items.map((message) => {
            const mine = message.sender === user?.id
            return (
              <div key={message.id} className={cn('flex gap-3', mine && 'flex-row-reverse')}>
                <Avatar
                  name={message.sender_name}
                  src={message.sender_avatar}
                  size="sm"
                  className="mt-1"
                />
                <div className={cn('max-w-[78%] min-w-0', mine && 'items-end text-right')}>
                  <div
                    className={cn(
                      'flex items-baseline gap-2 text-xs text-ink-500',
                      mine && 'flex-row-reverse',
                    )}
                  >
                    <span className="font-semibold text-ink-700">
                      {mine ? 'You' : message.sender_name}
                    </span>
                    <span>{formatDateTime(message.created_at)}</span>
                  </div>
                  <div
                    className={cn(
                      'mt-1.5 inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      mine
                        ? 'rounded-tr-sm bg-solid-brand text-white'
                        : 'rounded-tl-sm bg-ink-100 text-ink-800',
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-left">{message.content}</p>
                    {message.attachment && (
                      <a
                        href={mediaUrl(message.attachment)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                          'mt-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium',
                          mine ? 'bg-white/15 hover:bg-white/25' : 'bg-surface hover:bg-ink-50',
                        )}
                      >
                        <Paperclip className="h-3.5 w-3.5" />
                        Attachment
                      </a>
                    )}
                  </div>
                  {message.was_masked && (
                    <p className="mt-1 text-[11px] font-medium text-amber-600">
                      Contact details were removed from this message.
                    </p>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {canPost ? (
        <div className="border-t border-ink-200 bg-surface p-4">
          {blocked && <BlockedNotice info={blocked} onDismiss={() => setBlocked(null)} />}
          {!blocked && scan && !scan.clean && <ScanWarning scan={scan} />}

          <form onSubmit={send} className="mt-3 first:mt-0">
            {file && (
              <div className="mb-2.5 flex items-center justify-between gap-3 rounded-lg bg-ink-100 px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-ink-700">
                  <Paperclip className="h-4 w-4 shrink-0 text-ink-500" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-ink-500">{formatBytes(file.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="shrink-0 rounded p-1 text-ink-500 hover:bg-ink-200"
                  aria-label="Remove attachment"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div
              className={cn(
                'flex items-end gap-2 rounded-2xl border bg-surface p-2 transition-colors',
                willBlock
                  ? 'border-red-400 ring-2 ring-red-500/15'
                  : 'border-ink-300 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/15',
              )}
            >
              <label className="shrink-0 cursor-pointer rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-700">
                <Paperclip className="h-5 w-5" />
                <input
                  type="file"
                  className="sr-only"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                />
                <span className="sr-only">Attach a file</span>
              </label>

              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    if (!willBlock) void send(event as unknown as React.FormEvent)
                  }
                }}
                rows={1}
                placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
                className="max-h-32 min-h-[38px] flex-1 resize-none border-0 bg-transparent px-1 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-0"
              />

              <button
                type="submit"
                disabled={sending || willBlock || (!draft.trim() && !file)}
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                  willBlock
                    ? 'cursor-not-allowed bg-red-100 text-red-400'
                    : 'bg-solid-brand text-white hover:bg-solid-brand-hover disabled:bg-ink-200 disabled:text-ink-400',
                )}
                aria-label={willBlock ? 'Message blocked' : 'Send message'}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : willBlock ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-400">
              {scanning ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking message…
                </>
              ) : scan?.clean ? (
                <>
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  Looks fine — no contact details detected.
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3 w-3" />
                  Messages are screened for contact details. Keeping the deal here is what keeps
                  escrow protecting you.
                </>
              )}
            </div>
          </form>
        </div>
      ) : (
        <div className="border-t border-ink-200 bg-ink-50 px-5 py-4 text-center text-sm text-ink-500">
          Messaging opens once a writer is assigned to this order.
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------- live warning */

function ScanWarning({ scan }: { scan: LeakScan }) {
  const kinds = useMemo(
    () => scan.kinds.map((kind) => LEAK_KIND_LABEL[kind] ?? kind),
    [scan.kinds],
  )

  const severe = scan.blocked

  return (
    <div
      className={cn(
        'rounded-xl px-4 py-3 ring-1 ring-inset',
        severe ? 'bg-red-50 ring-red-200' : 'bg-amber-50 ring-amber-200',
      )}
    >
      <div className="flex gap-3">
        <ShieldAlert
          className={cn('mt-0.5 h-4 w-4 shrink-0', severe ? 'text-red-600' : 'text-amber-600')}
        />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-semibold', severe ? 'text-red-900' : 'text-amber-900')}>
            {severe
              ? "This message won't send as written"
              : 'Careful — this reads like an off-platform request'}
          </p>
          <p className={cn('mt-1 text-xs leading-relaxed', severe ? 'text-red-800' : 'text-amber-800')}>
            We detected {kinds.join(', ').toLowerCase()}. Remove it and the message will go
            through.
          </p>
          {scan.masked_text && severe && (
            <div className="mt-2 rounded-lg bg-surface/70 px-3 py-2 text-xs text-ink-600">
              <span className="font-medium text-ink-500">How it would look masked: </span>
              {scan.masked_text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------- blocked notice */

function BlockedNotice({ info, onDismiss }: { info: BlockedInfo; onDismiss: () => void }) {
  return (
    <div className="rounded-xl bg-red-50 px-4 py-3.5 ring-1 ring-inset ring-red-200">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-900">Message blocked</p>
          <p className="mt-1 text-xs leading-relaxed text-red-800">
            Sharing {info.summary} is not allowed. {info.guidance}
          </p>
          {info.kinds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {info.kinds.map((kind) => (
                <span
                  key={kind}
                  className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700"
                >
                  {LEAK_KIND_LABEL[kind as keyof typeof LEAK_KIND_LABEL] ?? kind}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] font-medium text-red-700">
            Repeated attempts add a strike to your account.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-red-400 hover:bg-red-100 hover:text-red-700"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
