import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, MinusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Deliverable } from '@/api/types'

/**
 * Screening results are shown to the client openly rather than hidden behind a
 * pass/fail badge — transparency builds more trust than a gate does.
 */
export function ScanReport({ deliverable }: { deliverable: Deliverable }) {
  const { scan_status, ai_content_score, plagiarism_score, flagged, flag_reason } = deliverable

  if (scan_status === 'pending' || scan_status === 'running') {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Screening in progress — scores appear here shortly.
      </div>
    )
  }

  if (scan_status === 'skipped') {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-600">
        <MinusCircle className="h-4 w-4" />
        Screening not configured on this environment.
      </div>
    )
  }

  if (scan_status === 'failed') {
    return (
      <div className="flex items-center gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
        <AlertTriangle className="h-4 w-4" />
        Screening could not complete. An admin can re-run it.
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-xl p-4 ring-1 ring-inset',
        flagged ? 'bg-red-50 ring-red-200' : 'bg-emerald-50 ring-emerald-200',
      )}
    >
      <div className="flex items-center gap-2">
        {flagged ? (
          <AlertTriangle className="h-4 w-4 text-red-600" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
        <p
          className={cn(
            'text-sm font-semibold',
            flagged ? 'text-red-900' : 'text-emerald-900',
          )}
        >
          {flagged ? 'Flagged by screening' : 'Passed screening'}
        </p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Score label="AI-generated content" value={ai_content_score} threshold={20} />
        <Score label="Plagiarism / similarity" value={plagiarism_score} threshold={15} />
      </div>

      {flagged && flag_reason && (
        <p className="mt-3 text-xs font-medium text-red-800">{flag_reason}</p>
      )}

      {deliverable.gptzero_report_url && (
        <a
          href={deliverable.gptzero_report_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          View full report
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}

function Score({
  label,
  value,
  threshold,
}: {
  label: string
  value: string | null
  threshold: number
}) {
  if (value === null) {
    return (
      <div>
        <p className="text-xs font-medium text-ink-600">{label}</p>
        <p className="mt-1 text-sm text-ink-400">Not measured</p>
      </div>
    )
  }

  const numeric = Number(value)
  const over = numeric > threshold

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-ink-600">{label}</p>
        <p className={cn('text-sm font-bold', over ? 'text-red-700' : 'text-emerald-700')}>
          {numeric.toFixed(1)}%
        </p>
      </div>
      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface/70">
        <div
          className={cn('h-full rounded-full', over ? 'bg-red-500' : 'bg-emerald-500')}
          style={{ width: `${Math.min(100, Math.max(numeric, 2))}%` }}
        />
        <span
          className="absolute top-0 h-full w-px bg-ink-900/40"
          style={{ left: `${threshold}%` }}
          title={`Threshold ${threshold}%`}
        />
      </div>
      <p className="mt-1 text-[10px] text-ink-500">Flag threshold {threshold}%</p>
    </div>
  )
}
