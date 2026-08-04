import { useState } from 'react'
import { Download, FileCheck2, Send, Upload } from 'lucide-react'
import { admin } from '@/api/endpoints'
import { mediaUrl } from '@/api/client'
import { useAsync } from '@/hooks/useAsync'
import { useToast } from '@/context/ToastContext'
import { REPORT_TYPE_LABEL } from '@/lib/constants'
import { formatDateTime, formatMoney } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, Skeleton, Tabs } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { PageIntro } from '@/pages/client/ClientDashboard'
import type { CheckRequest } from '@/api/types'

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'processing', label: 'Processing' },
  { value: 'processed', label: 'Ready to deliver' },
  { value: 'delivered', label: 'Delivered' },
  { value: '', label: 'All' },
]

export default function AdminChecks() {
  const toast = useToast()
  const [status, setStatus] = useState('pending')
  const [target, setTarget] = useState<CheckRequest | null>(null)

  const { data, loading, reload } = useAsync(
    () => admin.checkRequests({ status: status || undefined, page_size: 50 }),
    [status],
  )

  const act = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action()
      toast.success(message)
      reload()
    } catch (error) {
      toast.error('Failed', error instanceof Error ? error.message : undefined)
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Document check requests"
        subtitle="Run the checks yourself, upload the reports, then deliver. KES 150 per report."
      />

      <Tabs tabs={TABS} value={status} onChange={setStatus} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : data?.results.length ? (
        <div className="space-y-4">
          {data.results.map((request) => (
            <div key={request.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold text-ink-900">
                      {request.reference}
                    </span>
                    <Badge
                      tone={
                        request.status === 'delivered'
                          ? 'success'
                          : request.status === 'pending'
                            ? 'warning'
                            : 'brand'
                      }
                    >
                      {request.status_display}
                    </Badge>
                    <Badge tone={request.payment_status === 'paid' ? 'success' : 'neutral'}>
                      {request.payment_status}
                    </Badge>
                  </div>

                  <p className="mt-2 text-sm text-ink-700">
                    {request.requester_display} · {request.requester_email}
                    {request.contact_phone && ` · ${request.contact_phone}`}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {request.original_name || 'Document'}
                    {request.word_count ? ` · ${request.word_count.toLocaleString()} words` : ''} ·{' '}
                    {formatDateTime(request.created_at)}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {request.report_types.map((type) => (
                      <span
                        key={type}
                        className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200"
                      >
                        {REPORT_TYPE_LABEL[type] ?? type}
                      </span>
                    ))}
                  </div>

                  {request.notes && (
                    <p className="mt-3 rounded-xl bg-ink-50 p-3 text-sm text-ink-700">
                      {request.notes}
                    </p>
                  )}

                  {request.reports.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                        Uploaded reports
                      </p>
                      {request.reports.map((report) => (
                        <div
                          key={report.id}
                          className="flex items-center gap-3 rounded-lg border border-ink-200 px-3 py-2"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                            {report.report_type_display}
                            {report.score !== null && ` — ${report.score}%`}
                          </span>
                          {report.delivered_at && <Badge tone="success">delivered</Badge>}
                          {(report.file || report.report_url) && (
                            <a
                              href={report.report_url || mediaUrl(report.file)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  <p className="text-right text-lg font-bold text-ink-900">
                    {formatMoney(request.total_price)}
                  </p>
                  <a href={mediaUrl(request.document)} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="secondary" fullWidth icon={<Download className="h-3.5 w-3.5" />}>
                      Document
                    </Button>
                  </a>
                  {request.status === 'pending' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act(() => admin.startCheck(request.id), 'Marked as processing')}
                    >
                      Start
                    </Button>
                  )}
                  <Button
                    size="sm"
                    icon={<Upload className="h-3.5 w-3.5" />}
                    onClick={() => setTarget(request)}
                  >
                    Upload report
                  </Button>
                  {request.reports.length > 0 && request.status !== 'delivered' && (
                    <Button
                      size="sm"
                      variant="success"
                      icon={<Send className="h-3.5 w-3.5" />}
                      onClick={() => act(() => admin.deliverCheck(request.id), 'Delivered to requester')}
                    >
                      Deliver
                    </Button>
                  )}
                  {request.payment_status !== 'paid' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => act(() => admin.markCheckPaid(request.id), 'Marked paid')}
                    >
                      Mark paid
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
            icon={<FileCheck2 className="h-6 w-6" />}
            title="No requests in this queue"
            description="New Check My Paper submissions land here."
          />
        </div>
      )}

      <UploadModal
        request={target}
        onClose={() => setTarget(null)}
        onDone={() => {
          toast.success('Report uploaded')
          setTarget(null)
          reload()
        }}
      />
    </div>
  )
}

function UploadModal({
  request,
  onClose,
  onDone,
}: {
  request: CheckRequest | null
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [reportType, setReportType] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [score, setScore] = useState('')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!request) return
    const type = reportType || request.report_types[0]
    if (!type) return toast.error('Pick a report type.')
    if (!file && !url) return toast.error('Attach a file or paste a report URL.')

    setBusy(true)
    try {
      const form = new FormData()
      form.append('report_type', type)
      if (file) form.append('file', file)
      if (url) form.append('report_url', url)
      if (score) form.append('score', score)
      form.append('summary', summary)
      await admin.uploadCheckReport(request.id, form)
      setFile(null)
      setUrl('')
      setScore('')
      setSummary('')
      onDone()
    } catch (error) {
      toast.error('Upload failed', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(request)}
      onClose={onClose}
      title="Upload a report"
      description={request?.reference}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Save report
          </Button>
        </>
      }
    >
      {request && (
        <div className="space-y-5">
          <Select
            name="report_type"
            label="Report type"
            options={request.report_types.map((type) => ({
              value: type,
              label: REPORT_TYPE_LABEL[type] ?? type,
            }))}
            value={reportType || request.report_types[0]}
            onChange={(event) => setReportType(event.target.value)}
          />

          <div>
            <p className="label">Report file</p>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-ink-300 bg-ink-50 p-6 text-center hover:border-brand-400">
              <input
                type="file"
                className="sr-only"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <Upload className="h-7 w-7 text-ink-400" />
              <p className="mt-2 text-sm font-medium text-ink-800">
                {file ? file.name : 'Upload the PDF or screenshot'}
              </p>
            </label>
          </div>

          <Input
            name="report_url"
            label="Or a report URL"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />

          <Input
            name="score"
            type="number"
            step="0.01"
            label="Headline score (%)"
            placeholder="12.5"
            value={score}
            onChange={(event) => setScore(event.target.value)}
          />

          <Textarea
            name="summary"
            label="Summary for the requester"
            rows={4}
            placeholder="12.5% AI-generated content detected, concentrated in sections 2 and 4."
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </div>
      )}
    </Modal>
  )
}
