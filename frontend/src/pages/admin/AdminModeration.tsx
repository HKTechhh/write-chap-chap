import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquareWarning,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { admin } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useToast } from '@/context/ToastContext'
import { LEAK_KIND_LABEL } from '@/lib/constants'
import { cn, formatDateTime, relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Alert, Avatar, EmptyState, Skeleton, StatCard, Tabs } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { PageIntro } from '@/pages/client/ClientDashboard'
import type { ContactLeakFlag } from '@/api/types'

const TABS = [
  { value: 'false', label: 'Needs review' },
  { value: 'true', label: 'Reviewed' },
  { value: '', label: 'All' },
]

const SEVERITY_TONE = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
} as const

export default function AdminModeration() {
  const toast = useToast()
  const [reviewed, setReviewed] = useState('false')
  const [target, setTarget] = useState<ContactLeakFlag | null>(null)

  const flags = useAsync(
    () => admin.contactLeaks({ reviewed: reviewed || undefined, page_size: 50 }),
    [reviewed],
  )
  const stats = useAsync(() => admin.contactLeakStats(), [])

  return (
    <div className="space-y-7">
      <PageIntro
        title="Contact-leak moderation"
        subtitle="Every blocked attempt to move a deal off-platform. Original text is preserved so you can judge intent."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Needs review"
          value={stats.data?.unreviewed ?? 0}
          icon={<MessageSquareWarning className="h-4 w-4" />}
          accent={stats.data?.unreviewed ? 'red' : 'emerald'}
        />
        <StatCard
          label="Blocked all time"
          value={stats.data?.blocked ?? 0}
          icon={<ShieldCheck className="h-4 w-4" />}
          hint="Messages never delivered"
          accent="brand"
        />
        <StatCard
          label="Total flags"
          value={stats.data?.total ?? 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          accent="violet"
        />
        <StatCard
          label="False positives"
          value={stats.data?.false_positives ?? 0}
          icon={<XCircle className="h-4 w-4" />}
          hint="Strikes reversed on review"
          accent="gold"
        />
      </div>

      {(stats.data?.by_kind.length ?? 0) > 0 && (
        <Card>
          <CardHeader
            title="What people try to share"
            description="Useful for tuning the detector — a spike in false positives usually means a pattern is too aggressive."
          />
          <div className="flex flex-wrap gap-2.5 p-5">
            {stats.data!.by_kind.map((row) => (
              <span
                key={row.kind}
                className="inline-flex items-center gap-2 rounded-full bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-700"
              >
                {LEAK_KIND_LABEL[row.kind as keyof typeof LEAK_KIND_LABEL] ?? row.kind}
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-ink-900">
                  {row.count}
                </span>
              </span>
            ))}
          </div>
        </Card>
      )}

      <Tabs tabs={TABS} value={reviewed} onChange={setReviewed} />

      {flags.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : flags.data?.results.length ? (
        <div className="space-y-4">
          {flags.data.results.map((flag) => (
            <FlagCard key={flag.id} flag={flag} onReview={() => setTarget(flag)} />
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="Nothing to review"
            description="No contact-sharing attempts are waiting on you."
          />
        </div>
      )}

      <ReviewModal
        flag={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          toast.success('Flag reviewed')
          setTarget(null)
          flags.reload()
          stats.reload()
        }}
      />
    </div>
  )
}

function FlagCard({ flag, onReview }: { flag: ContactLeakFlag; onReview: () => void }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-ink-200 p-5">
        <div className="flex min-w-0 gap-3">
          <Avatar name={flag.user_name} size="md" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-ink-900">{flag.user_name}</p>
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase text-ink-600">
                {flag.user_role}
              </span>
              <Badge tone={SEVERITY_TONE[flag.severity]}>{flag.severity} severity</Badge>
              {flag.strike_applied && <Badge tone="danger">Strike applied</Badge>}
              {flag.is_false_positive && <Badge tone="neutral">False positive</Badge>}
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {formatDateTime(flag.created_at)} · {relativeTime(flag.created_at)}
              {flag.order && (
                <>
                  {' · '}
                  <Link to={`/orders/${flag.order}`} className="text-brand-600 hover:underline">
                    Order #{flag.order}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={flag.action_taken === 'blocked' ? 'danger' : 'warning'}>
            {flag.action_taken === 'blocked' ? 'Blocked' : flag.action_taken}
          </Badge>
          {!flag.reviewed && (
            <Button size="sm" onClick={onReview}>
              Review
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">
            What they wrote
          </p>
          <div className="rounded-xl bg-red-50 p-3.5 ring-1 ring-inset ring-red-200">
            <p className="whitespace-pre-wrap break-words font-mono text-sm text-red-900">
              {flag.original_content}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {flag.detected_kinds.map((kind) => (
            <span
              key={kind}
              className="rounded-full bg-ink-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
            >
              {LEAK_KIND_LABEL[kind] ?? kind}
            </span>
          ))}
        </div>

        {flag.detections.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-xs font-semibold text-brand-600 hover:text-brand-700">
              Show matched fragments ({flag.detections.length})
            </summary>
            <ul className="mt-2.5 space-y-1.5">
              {flag.detections.map((detection, index) => (
                <li
                  key={index}
                  className="flex items-center gap-3 rounded-lg bg-ink-50 px-3 py-2 text-xs"
                >
                  <span className="font-mono font-semibold text-ink-900">“{detection.text}”</span>
                  <span className="text-ink-500">
                    {LEAK_KIND_LABEL[detection.kind as keyof typeof LEAK_KIND_LABEL] ??
                      detection.kind}
                  </span>
                  <span
                    className={cn(
                      'ml-auto rounded-full px-2 py-0.5 font-bold uppercase',
                      detection.severity === 'high'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700',
                    )}
                  >
                    {detection.severity}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {flag.reviewed && (
          <div className="rounded-xl bg-ink-50 p-3.5 text-xs">
            <p className="font-semibold text-ink-700">
              Reviewed by {flag.reviewed_by_name ?? 'admin'} ·{' '}
              {formatDateTime(flag.reviewed_at)}
            </p>
            {flag.review_notes && <p className="mt-1 text-ink-600">{flag.review_notes}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

function ReviewModal({
  flag,
  onClose,
  onDone,
}: {
  flag: ContactLeakFlag | null
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (isFalsePositive: boolean) => {
    if (!flag) return
    setBusy(true)
    try {
      await admin.reviewContactLeak(flag.id, { is_false_positive: isFalsePositive, notes })
      setNotes('')
      onDone()
    } catch (error) {
      toast.error('Could not save review', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(flag)}
      onClose={onClose}
      title="Review this flag"
      description="Was this a genuine attempt to take the deal off-platform?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            loading={busy}
            icon={<XCircle className="h-4 w-4" />}
            onClick={() => submit(true)}
          >
            False positive
          </Button>
          <Button
            variant="danger"
            loading={busy}
            icon={<CheckCircle2 className="h-4 w-4" />}
            onClick={() => submit(false)}
          >
            Confirm violation
          </Button>
        </>
      }
    >
      {flag && (
        <div className="space-y-4">
          <div className="rounded-xl bg-ink-50 p-3.5">
            <p className="text-xs font-semibold text-ink-500">{flag.user_name} wrote</p>
            <p className="mt-1.5 whitespace-pre-wrap break-words font-mono text-sm text-ink-900">
              {flag.original_content}
            </p>
          </div>

          {flag.strike_applied && (
            <Alert tone="warning" icon={<ShieldAlert className="h-4 w-4" />}>
              A strike was already applied automatically. Marking this a false positive removes
              it.
            </Alert>
          )}

          <Textarea
            name="notes"
            label="Notes (optional)"
            rows={4}
            placeholder="e.g. Writer was quoting the client's own brief, not sharing their own number."
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      )}
    </Modal>
  )
}
