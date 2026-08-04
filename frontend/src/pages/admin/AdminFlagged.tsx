import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'
import { admin } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useToast } from '@/context/ToastContext'
import { formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { EmptyState, Skeleton } from '@/components/ui/Misc'
import { ScanReport } from '@/components/orders/ScanReport'
import { PageIntro } from '@/pages/client/ClientDashboard'

export default function AdminFlagged() {
  const toast = useToast()
  const { data, loading, reload } = useAsync(() => admin.flagged(), [])

  const clear = async (id: number) => {
    try {
      await admin.clearFlag(id)
      toast.success('Flag cleared')
      reload()
    } catch (error) {
      toast.error('Failed', error instanceof Error ? error.message : undefined)
    }
  }

  const rescan = async (id: number) => {
    try {
      await admin.rescan(id)
      toast.info('Re-scan queued', 'Scores refresh once the worker finishes.')
    } catch (error) {
      toast.error('Failed', error instanceof Error ? error.message : undefined)
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Flagged deliverables"
        subtitle="Submissions where AI-content or plagiarism crossed the threshold."
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : data?.results.length ? (
        <div className="space-y-4">
          {data.results.map((deliverable) => (
            <div key={deliverable.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                    <Link
                      to={`/orders/${deliverable.order}`}
                      className="text-base font-semibold text-ink-900 hover:text-brand-700"
                    >
                      Order #{deliverable.order} · version {deliverable.version_number}
                    </Link>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">
                    Submitted by {deliverable.writer_name} ·{' '}
                    {formatDateTime(deliverable.submitted_at)}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                    onClick={() => rescan(deliverable.id)}
                  >
                    Re-scan
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    onClick={() => clear(deliverable.id)}
                  >
                    Clear flag
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                <ScanReport deliverable={deliverable} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="Nothing flagged"
            description="Every submission is currently within the AI-content and plagiarism thresholds."
          />
        </div>
      )}
    </div>
  )
}
