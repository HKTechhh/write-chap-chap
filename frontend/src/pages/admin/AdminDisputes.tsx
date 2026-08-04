import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Gavel, Scale } from 'lucide-react'
import { admin } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useToast } from '@/context/ToastContext'
import { cn, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Alert, EmptyState, Skeleton, Tabs } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { PageIntro } from '@/pages/client/ClientDashboard'
import type { Dispute } from '@/api/types'

const TABS = [
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under review' },
  { value: 'resolved', label: 'Resolved' },
  { value: '', label: 'All' },
]

export default function AdminDisputes() {
  const toast = useToast()
  const [status, setStatus] = useState('open')
  const [target, setTarget] = useState<Dispute | null>(null)

  const { data, loading, reload } = useAsync(
    () => admin.disputes({ status: status || undefined, page_size: 50 }),
    [status],
  )

  const claim = async (dispute: Dispute) => {
    try {
      await admin.claimDispute(dispute.id)
      toast.success('Marked under review')
      reload()
    } catch (error) {
      toast.error('Failed', error instanceof Error ? error.message : undefined)
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Disputes"
        subtitle="Read the brief, the deliverable and the chat before you decide. Only lost disputes count toward strikes."
      />

      <Tabs tabs={TABS} value={status} onChange={setStatus} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : data?.results.length ? (
        <div className="space-y-4">
          {data.results.map((dispute) => (
            <div key={dispute.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone={
                        dispute.status === 'resolved'
                          ? 'success'
                          : dispute.status === 'under_review'
                            ? 'brand'
                            : 'danger'
                      }
                    >
                      {dispute.status.replace('_', ' ')}
                    </Badge>
                    <span className="text-xs text-ink-400">
                      raised {formatDateTime(dispute.created_at)}
                    </span>
                  </div>

                  <Link
                    to={`/orders/${dispute.order}`}
                    className="mt-2.5 block text-base font-semibold text-ink-900 hover:text-brand-700"
                  >
                    {dispute.order_title}
                  </Link>
                  <p className="mt-1 text-xs text-ink-500">
                    Raised by {dispute.raised_by_name} · order #{dispute.order}
                  </p>

                  <p className="mt-3 whitespace-pre-wrap rounded-xl bg-ink-50 p-3.5 text-sm leading-relaxed text-ink-700">
                    {dispute.reason}
                  </p>

                  {dispute.resolution_notes && (
                    <div className="mt-3 rounded-xl bg-emerald-50 p-3.5 text-sm ring-1 ring-inset ring-emerald-200">
                      <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                        Resolution — writer received {dispute.writer_share_percent}%
                      </p>
                      <p className="mt-1 text-emerald-900">{dispute.resolution_notes}</p>
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <Link to={`/orders/${dispute.order}`}>
                    <Button size="sm" variant="secondary" fullWidth>
                      Open order
                    </Button>
                  </Link>
                  {dispute.status === 'open' && (
                    <Button size="sm" variant="ghost" onClick={() => claim(dispute)}>
                      Claim
                    </Button>
                  )}
                  {dispute.status !== 'resolved' && (
                    <Button size="sm" icon={<Scale className="h-3.5 w-3.5" />} onClick={() => setTarget(dispute)}>
                      Resolve
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={<Gavel className="h-6 w-6" />}
            title="No disputes here"
            description="Nothing in this queue right now."
          />
        </div>
      )}

      <ResolveModal
        dispute={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          toast.success('Dispute resolved', 'Escrow has been settled accordingly.')
          setTarget(null)
          reload()
        }}
      />
    </div>
  )
}

function ResolveModal({
  dispute,
  onClose,
  onDone,
}: {
  dispute: Dispute | null
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [resolution, setResolution] = useState('full_release')
  const [share, setShare] = useState(50)
  const [notes, setNotes] = useState('')
  const [applyStrike, setApplyStrike] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!dispute) return
    setBusy(true)
    try {
      await admin.resolveDispute(dispute.id, {
        resolution,
        writer_share_percent: resolution === 'partial_release' ? share : undefined,
        resolution_notes: notes,
        apply_strike: applyStrike,
      })
      setNotes('')
      onDone()
    } catch (error) {
      toast.error('Could not resolve', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(dispute)}
      onClose={onClose}
      title="Resolve dispute"
      description="This settles escrow immediately and notifies both parties."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Resolve & settle escrow
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Select
          name="resolution"
          label="Outcome"
          options={[
            { value: 'full_release', label: 'Full release — writer is paid in full' },
            { value: 'partial_release', label: 'Partial — split between writer and client' },
            { value: 'full_refund', label: 'Full refund — client gets everything back' },
          ]}
          value={resolution}
          onChange={(event) => setResolution(event.target.value)}
        />

        {resolution === 'partial_release' && (
          <div>
            <Input
              name="share"
              type="number"
              min={0}
              max={100}
              label="Writer's share (%)"
              hint={`Writer gets ${share}%, client is refunded ${100 - share}%.`}
              value={share}
              onChange={(event) => setShare(Number(event.target.value))}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={share}
              onChange={(event) => setShare(Number(event.target.value))}
              className="mt-3 w-full accent-brand-600"
            />
          </div>
        )}

        <Textarea
          name="notes"
          label="Resolution notes"
          rows={5}
          hint="Both parties see this. Explain the reasoning."
          placeholder="The delivered work met the brief on structure and sourcing, but was 2 days late. Releasing 80% to the writer and refunding 20%."
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        {resolution !== 'full_release' && (
          <label
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
              applyStrike ? 'border-red-400 bg-red-50' : 'border-ink-200 hover:border-ink-300',
            )}
          >
            <input
              type="checkbox"
              checked={applyStrike}
              onChange={(event) => setApplyStrike(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-ink-300 text-red-600 focus:ring-red-500"
            />
            <span>
              <span className="block text-sm font-medium text-ink-800">
                Add a strike to the writer
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">
                Use only for clear fault. Five strikes suspends the account.
              </span>
            </span>
          </label>
        )}

        <Alert tone="warning">
          Escrow settles the moment you confirm. This can't be reversed from the admin panel.
        </Alert>
      </div>
    </Modal>
  )
}
