import type * as React from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileSearch,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Misc'
import { Badge as Pill } from '@/components/ui/Badge'
import { checks } from '@/api/endpoints'
import { mediaUrl } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { cn, formatBytes, formatDateTime, formatMoney } from '@/lib/utils'
import type { CheckRequest } from '@/api/types'

interface ReportType {
  value: string
  label: string
}

export default function CheckMyPaper() {
  const { user } = useAuth()
  const toast = useToast()
  const [params] = useSearchParams()

  const [pricing, setPricing] = useState<{ price: number; report_types: ReportType[] }>({
    price: 120,
    report_types: [
      { value: 'ai_content', label: 'AI report' },
      { value: 'similarity_links', label: 'Plagiarism / similarity report' },
    ],
  })

  const [file, setFile] = useState<File | null>(null)
  const [contact, setContact] = useState({
    contact_name: user?.display_name ?? '',
    contact_email: user?.email ?? '',
    contact_phone: user?.phone ?? '',
  })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<CheckRequest | null>(null)
  const [error, setError] = useState('')

  const [trackRef, setTrackRef] = useState(params.get('ref') ?? '')
  const [tracked, setTracked] = useState<CheckRequest | null>(null)
  const [tracking, setTracking] = useState(false)

  useEffect(() => {
    checks
      .pricing()
      .then((data) => setPricing({ price: data.price, report_types: data.report_types }))
      .catch(() => {
        /* the defaults above are fine if the API isn't reachable */
      })
  }, [])

  useEffect(() => {
    const ref = params.get('ref')
    if (ref) void doTrack(ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!file) return setError('Attach the document you want checked.')
    if (!user && !contact.contact_email) return setError('We need an email to send the report to.')
    if (!contact.contact_phone.trim()) return setError('Enter the M-Pesa number to pay from.')

    const form = new FormData()
    form.append('document', file)
    form.append('contact_name', contact.contact_name)
    form.append('contact_email', contact.contact_email)
    form.append('contact_phone', contact.contact_phone)
    form.append('notes', notes)

    setSubmitting(true)
    try {
      const created = await checks.submit(form)
      setResult(created)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const doTrack = async (reference: string) => {
    if (!reference.trim()) return
    setTracking(true)
    try {
      setTracked(await checks.track(reference.trim()))
    } catch {
      setTracked(null)
      toast.error('Not found', 'No request matches that reference.')
    } finally {
      setTracking(false)
    }
  }

  return (
    <MarketingLayout>
      <section className="relative overflow-hidden theme-fixed bg-ink-950 py-16">
        <div className="absolute inset-0 bg-mesh-brand" aria-hidden />
        <div className="container-page relative">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-teal-300">
              <FileSearch className="h-3.5 w-3.5" />
              KES {pricing.price} for both reports · any document size
            </span>
            <h1 className="mt-5 text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Check my paper
            </h1>
            <p className="mt-5 text-balance text-lg leading-relaxed text-ink-400">
              Upload a document and we'll run both the AI and similarity checks and send the
              results back. No marketplace account needed.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-ink-50 py-16">
        <div className="container-page">
          <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
            {/* Form / receipt */}
            <div>
              {result ? (
                <PaymentReceipt
                  result={result}
                  onUpdate={setResult}
                  onReset={() => {
                    setResult(null)
                    setFile(null)
                    setNotes('')
                  }}
                />
              ) : (
                <form onSubmit={onSubmit} className="card p-6 sm:p-8">
                  <h2 className="text-xl font-bold text-ink-900">Submit a document</h2>
                  <p className="mt-1.5 text-sm text-ink-500">
                    Takes about a minute. We'll send an M-Pesa prompt to your phone for the payment.
                  </p>

                  {error && (
                    <Alert tone="danger" className="mt-5">
                      {error}
                    </Alert>
                  )}

                  {/* Upload */}
                  <div className="mt-6">
                    <p className="label">Document</p>
                    <label
                      className={cn(
                        'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
                        file
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-ink-300 bg-ink-50 hover:border-brand-400 hover:bg-brand-50/50',
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
                          <FileText className="h-9 w-9 text-brand-600" />
                          <p className="mt-3 text-sm font-semibold text-ink-900">{file.name}</p>
                          <p className="mt-0.5 text-xs text-ink-500">
                            {formatBytes(file.size)} · click to replace
                          </p>
                        </>
                      ) : (
                        <>
                          <Upload className="h-9 w-9 text-ink-400" />
                          <p className="mt-3 text-sm font-semibold text-ink-800">
                            Click to upload your document
                          </p>
                          <p className="mt-0.5 text-xs text-ink-500">
                            .docx, .pdf, .txt or .rtf
                          </p>
                        </>
                      )}
                    </label>
                  </div>

                  {/* What's included: always both reports, one price */}
                  <div className="mt-6">
                    <p className="label">
                      Included{' '}
                      <span className="font-normal text-ink-400">
                        · you get both reports back, KES {pricing.price} per document
                      </span>
                    </p>
                    <ul className="grid gap-2.5 sm:grid-cols-2">
                      {pricing.report_types.map((type) => (
                        <li
                          key={type.value}
                          className="flex items-center gap-2.5 rounded-xl border border-ink-200 bg-surface px-4 py-3 text-sm font-medium text-ink-800"
                        >
                          <Check className="h-4 w-4 text-emerald-600" />
                          {type.label}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Contact */}
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {!user && (
                      <>
                      <Input
                        name="contact_name"
                        label="Your name"
                        value={contact.contact_name}
                        onChange={(event) =>
                          setContact({ ...contact, contact_name: event.target.value })
                        }
                      />
                      <Input
                        name="contact_email"
                        type="email"
                        label="Email"
                        hint="Where we send the report"
                        value={contact.contact_email}
                        onChange={(event) =>
                          setContact({ ...contact, contact_email: event.target.value })
                        }
                        required
                      />
                      </>
                    )}
                    <Input
                      name="contact_phone"
                      type="tel"
                      label="M-Pesa number"
                      hint="We send the KES payment prompt here, e.g. 0712 345 678"
                      wrapClassName="sm:col-span-2"
                      value={contact.contact_phone}
                      onChange={(event) =>
                        setContact({ ...contact, contact_phone: event.target.value })
                      }
                      required
                    />
                  </div>

                  <Textarea
                    name="notes"
                    label="Anything we should know? (optional)"
                    placeholder="e.g. This is chapter 3 of my dissertation, due Friday."
                    className="mt-6"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />

                  {/* Total */}
                  <div className="mt-7 flex items-center justify-between rounded-2xl theme-fixed bg-ink-900 px-5 py-4 text-white">
                    <div>
                      <p className="text-xs text-ink-400">
                        AI report + plagiarism / similarity report
                      </p>
                      <p className="text-2xl font-bold">{formatMoney(pricing.price)}</p>
                    </div>
                    <Button type="submit" variant="accent" size="lg" loading={submitting}>
                      Pay with M-Pesa
                    </Button>
                  </div>
                </form>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Track */}
              <div className="card p-6">
                <h3 className="flex items-center gap-2 text-base font-semibold text-ink-900">
                  <Search className="h-4 w-4 text-brand-600" />
                  Track a request
                </h3>
                <p className="mt-1.5 text-sm text-ink-500">
                  Enter the reference you were given.
                </p>
                <div className="mt-4 flex gap-2">
                  <Input
                    name="reference"
                    placeholder="PSP-XXXXXXXX"
                    wrapClassName="flex-1"
                    value={trackRef}
                    onChange={(event) => setTrackRef(event.target.value.toUpperCase())}
                  />
                  <Button
                    variant="secondary"
                    className="mt-0 h-11 shrink-0"
                    loading={tracking}
                    onClick={() => doTrack(trackRef)}
                  >
                    Find
                  </Button>
                </div>

                {tracked && (
                  <div className="mt-5 rounded-xl border border-ink-200 bg-ink-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-ink-900">{tracked.reference}</p>
                      <Pill
                        tone={
                          tracked.status === 'delivered'
                            ? 'success'
                            : tracked.status === 'pending' || tracked.status === 'awaiting_payment'
                              ? 'warning'
                              : 'brand'
                        }
                      >
                        {tracked.status_display}
                      </Pill>
                    </div>
                    <p className="mt-2 text-xs text-ink-500">
                      Submitted {formatDateTime(tracked.created_at)}
                    </p>

                    <div className="mt-4 space-y-2">
                      {tracked.deliverables.map((slot) => (
                        <div
                          key={slot.report_type}
                          className="flex items-center justify-between gap-3 rounded-lg bg-surface p-3 ring-1 ring-ink-200"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink-800">{slot.label}</p>
                            {slot.state === 'delivered' && slot.report?.score != null ? (
                              <p className="text-xs text-ink-500">Score: {slot.report.score}%</p>
                            ) : (
                              <p className="flex items-center gap-1.5 text-xs text-ink-500">
                                {slot.state === 'delivered' ? null : <Clock className="h-3 w-3" />}
                                {slot.state === 'delivered' ? 'Ready' : 'Not ready yet'}
                              </p>
                            )}
                          </div>
                          {slot.state === 'delivered' && (slot.report?.file || slot.report?.report_url) && (
                            <a
                              href={slot.report.report_url || mediaUrl(slot.report.file)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 rounded-lg bg-brand-50 p-2 text-brand-600 hover:bg-brand-100"
                              aria-label={`Download ${slot.label}`}
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Why us */}
              <div className="card p-6">
                <h3 className="flex items-center gap-2 text-base font-semibold text-ink-900">
                  <ShieldCheck className="h-4 w-4 text-brand-600" />
                  How this works
                </h3>
                <ol className="mt-4 space-y-4">
                  {[
                    ['Upload and pay', 'Send the document and approve the M-Pesa prompt on your phone. You get an AI report and a similarity report.'],
                    ['We run it', 'A human runs the checks — not an automated queue.'],
                    ['You collect', 'Download both reports using your reference.'],
                  ].map(([title, body], index) => (
                    <li key={title} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                        {index + 1}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-ink-800">{title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                          {body}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <Alert tone="warning">
                <p className="font-semibold">Note for writers</p>
                <p className="mt-1 text-xs leading-relaxed">
                  This service isn't available to writers on the marketplace. Pre-testing drafts
                  against the same detector that screens deliveries would defeat the point of
                  screening.
                </p>
              </Alert>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-ink-100 pb-3 last:border-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className={cn('text-right', strong ? 'text-base font-bold text-ink-900' : 'font-medium text-ink-800')}>
        {value}
      </dd>
    </div>
  )
}

function PaymentReceipt({
  result,
  onUpdate,
  onReset,
}: {
  result: CheckRequest
  onUpdate: (next: CheckRequest) => void
  onReset: () => void
}) {
  const toast = useToast()
  const [phone, setPhone] = useState(result.contact_phone || '')
  const [retrying, setRetrying] = useState(false)
  const [editing, setEditing] = useState(false)
  const state = result.payment_state
  const paid = state === 'paid'

  // While the phone prompt is open, ask the server every 4s whether Safaricom has confirmed it.
  useEffect(() => {
    if (state !== 'pending') return
    const timer = window.setInterval(async () => {
      try {
        const latest = await checks.track(result.reference)
        if (latest.payment_state !== 'pending') {
          onUpdate(latest)
          if (latest.payment_state === 'paid') toast.success('Payment received', `Reference ${latest.reference}`)
        }
      } catch {
        /* keep waiting; the next tick tries again */
      }
    }, 4000)
    return () => window.clearInterval(timer)
  }, [state, result.reference, onUpdate, toast])

  const resend = async () => {
    setRetrying(true)
    try {
      onUpdate(await checks.pay(result.reference, phone))
      setEditing(false)
    } catch (err) {
      toast.error('Could not send the prompt', err instanceof Error ? err.message : undefined)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="card overflow-hidden">
      <div
        className={cn(
          'px-6 py-5 text-white',
          paid
            ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
            : state === 'failed'
              ? 'bg-gradient-to-r from-amber-500 to-orange-500'
              : 'bg-gradient-to-r from-brand-600 to-brand-500',
        )}
      >
        <div className="flex items-center gap-3">
          {paid ? <CheckCircle2 className="h-6 w-6" /> : state === 'failed' ? <AlertTriangle className="h-6 w-6" /> : <Smartphone className="h-6 w-6" />}
          <div>
            <p className="text-lg font-bold">
              {paid ? 'Payment received' : state === 'failed' ? 'Payment not completed' : 'Check your phone'}
            </p>
            <p className="text-sm text-white/85">
              {paid
                ? 'Your document is with us. Keep your reference safe.'
                : state === 'failed'
                  ? result.payment_message
                  : `Enter your M-Pesa PIN to pay ${formatMoney(result.total_price)}.`}
            </p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <div className="rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Your reference</p>
          <p className="mt-1.5 font-display text-3xl font-extrabold tracking-tight text-brand-800">
            {result.reference}
          </p>
        </div>

        <dl className="mt-6 space-y-3 text-sm">
          <Row label="Document" value={result.original_name || '—'} />
          <Row label="You will receive" value="2 documents: AI report + plagiarism / similarity report" />
          <Row label="Word count" value={result.word_count?.toLocaleString() ?? 'Not parsed'} />
          <Row label={paid ? 'Amount paid' : 'Amount due'} value={formatMoney(result.total_price)} strong />
        </dl>

        {state === 'pending' && (
          <Alert tone="info" className="mt-6">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Waiting for M-Pesa to confirm. This page updates by itself.
            </span>
          </Alert>
        )}

        {paid && (
          <Alert tone="success" className="mt-6">
            We'll email <span className="font-semibold">{result.requester_email}</span> when both
            reports are ready. You can also track it here with your reference.
            {result.payment_message && (
              <span className="mt-2 block font-semibold">{result.payment_message}</span>
            )}
          </Alert>
        )}

        {!paid && (
          <div className="mt-6 space-y-3">
            {(state === 'failed' || editing) && (
              <Input
                name="retry_phone"
                type="tel"
                label="M-Pesa number"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            )}
            {state === 'failed' || editing ? (
              <Button fullWidth variant="accent" loading={retrying} onClick={resend}>
                Send the M-Pesa prompt again
              </Button>
            ) : (
              <Button fullWidth variant="secondary" onClick={() => setEditing(true)}>
                Didn't get a prompt? Resend
              </Button>
            )}
          </div>
        )}

        <Button variant="secondary" className="mt-3" fullWidth onClick={onReset}>
          Submit another document
        </Button>
      </div>
    </div>
  )
}
