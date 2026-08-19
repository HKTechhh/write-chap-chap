import type * as React from 'react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  FileText,
  Info,
  Loader2,
  Lock,
  PenLine,
  Upload,
  Wand2,
  X,
} from 'lucide-react'
import { orders as ordersApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { useToast } from '@/context/ToastContext'
import { SUBJECTS } from '@/lib/constants'
import { cn, formatBytes, formatMoney } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Alert } from '@/components/ui/Misc'
import { PageIntro } from './ClientDashboard'
import type { HumanizationQuote, OrderType } from '@/api/types'

/** Default deadline: 5 days out, rounded to the hour, in datetime-local format. */
function defaultDeadline() {
  const date = new Date(Date.now() + 5 * 86400000)
  date.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:00`
}

export default function PostOrder() {
  const navigate = useNavigate()
  const toast = useToast()

  const [orderType, setOrderType] = useState<OrderType>('writing')
  const [form, setForm] = useState({
    title: '',
    description: '',
    subject: 'business',
    deadline: defaultDeadline(),
    budget: '',
  })
  const [files, setFiles] = useState<File[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [general, setGeneral] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Humanization: price is derived from the document, never typed in.
  const [quote, setQuote] = useState<HumanizationQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [manualWords, setManualWords] = useState('')
  const [quoteError, setQuoteError] = useState('')

  const set = (key: keyof typeof form) => (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((current) => ({ ...current, [key]: event.target.value }))
    setErrors((current) => ({ ...current, [key]: '' }))
  }

  // Re-quote whenever the document or manual word count changes.
  useEffect(() => {
    if (orderType !== 'humanization') {
      setQuote(null)
      return
    }
    const words = Number(manualWords)
    if (!files[0] && !words) {
      setQuote(null)
      return
    }

    let active = true
    setQuoting(true)
    setQuoteError('')
    const body = new FormData()
    if (files[0]) body.append('file', files[0])
    if (words > 0) body.append('word_count', String(words))

    ordersApi
      .humanizationQuote(body)
      .then((result) => {
        if (active) setQuote(result)
      })
      .catch((error) => {
        if (active) {
          setQuote(null)
          setQuoteError(
            error instanceof Error
              ? error.message
              : "We couldn't read that file — enter the word count manually.",
          )
        }
      })
      .finally(() => {
        if (active) setQuoting(false)
      })

    return () => {
      active = false
    }
  }, [orderType, files, manualWords])

  const onSubmit = async (publish: boolean) => {
    setErrors({})
    setGeneral('')

    if (!form.title.trim()) return setErrors({ title: 'Give the order a clear title.' })
    if (!form.description.trim())
      return setErrors({ description: 'Describe what you need in detail.' })
    if (orderType === 'humanization' && !quote)
      return setGeneral('Upload a document (or enter a word count) so we can price the job.')
    if (orderType === 'writing' && !(Number(form.budget) > 0))
      return setErrors({ budget: 'Set a budget above zero.' })

    const body = new FormData()
    body.append('title', form.title)
    body.append('description', form.description)
    body.append('subject', form.subject)
    body.append('order_type', orderType)
    body.append('deadline', new Date(form.deadline).toISOString())
    body.append('publish', String(publish))

    if (orderType === 'humanization') {
      body.append('word_count', String(quote!.word_count))
      body.append('budget', quote!.price)
    } else {
      body.append('budget', form.budget)
    }
    files.forEach((file) => body.append('attachments', file))

    setSubmitting(true)
    try {
      const created = await ordersApi.create(body)
      toast.success(
        publish ? 'Order posted' : 'Draft saved',
        publish ? 'Writers can start bidding now.' : 'Publish it whenever you are ready.',
      )
      navigate(`/orders/${created.id}`)
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = error.fieldErrors
        setErrors(fieldErrors)
        if (Object.keys(fieldErrors).length === 0) setGeneral(error.message)
      } else {
        setGeneral(error instanceof Error ? error.message : 'Could not post the order.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const humanization = orderType === 'humanization'

  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <PageIntro
        title="Post a new order"
        subtitle="The clearer the brief, the better the bids you'll get."
      />

      {general && <Alert tone="danger">{general}</Alert>}

      {/* Order type */}
      <div className="card p-5">
        <p className="label">What do you need?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TypeCard
            active={!humanization}
            onClick={() => setOrderType('writing')}
            icon={<PenLine className="h-5 w-5" />}
            title="Writing"
            body="Essays, reports, research, copy. You set the budget and writers bid."
            tone="brand"
          />
          <TypeCard
            active={humanization}
            onClick={() => setOrderType('humanization')}
            icon={<Wand2 className="h-5 w-5" />}
            title="Humanization"
            body="Rewrite an AI-sounding draft. Price is fixed at KES 50 per 250 words."
            tone="gold"
          />
        </div>
      </div>

      {/* Brief */}
      <div className="card space-y-5 p-5">
        <Input
          name="title"
          label="Title"
          placeholder={
            humanization
              ? 'e.g. Humanize a 1,500-word marketing chapter'
              : 'e.g. Literature review on nurse burnout — 2,500 words, APA 7'
          }
          value={form.title}
          onChange={set('title')}
          error={errors.title}
          required
        />

        <Textarea
          name="description"
          label="Brief"
          rows={7}
          hint="Word count, referencing style, sources, structure, tone — anything a writer needs to get it right first time."
          placeholder={
            humanization
              ? 'Rewrite the attached draft so it reads naturally. Keep every argument and citation intact — no meaning changes.'
              : 'What is the topic? How long? Which referencing style? Any required sources or structure?'
          }
          value={form.description}
          onChange={set('description')}
          error={errors.description}
          required
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            name="subject"
            label="Subject"
            options={SUBJECTS}
            value={form.subject}
            onChange={set('subject')}
          />
          <Input
            name="deadline"
            type="datetime-local"
            label="Deadline"
            value={form.deadline}
            onChange={set('deadline')}
            error={errors.deadline}
            required
          />
        </div>

        {/* Budget or locked price */}
        {humanization ? (
          <div className="rounded-2xl border border-gold-200 bg-gold-50/60 p-5">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-gold-600" />
              <p className="text-sm font-semibold text-ink-900">Price is calculated, not set</p>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-600">
              We count the words in your document and charge KES 50 per 250 words, rounding up.
              Writers bid on delivery time and reputation, never on price.
            </p>

            {quoting ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-ink-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Reading your document…
              </div>
            ) : quote ? (
              <div className="mt-4 grid grid-cols-3 gap-4 rounded-xl bg-surface p-4 ring-1 ring-gold-200">
                <QuoteStat label="Words" value={quote.word_count.toLocaleString()} />
                <QuoteStat label="Pages" value={String(quote.pages)} />
                <QuoteStat label="Price" value={formatMoney(quote.price)} highlight />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {quoteError && <Alert tone="warning">{quoteError}</Alert>}
                <Input
                  name="manual_words"
                  type="number"
                  min={1}
                  label="Word count"
                  hint="Upload the document below and this fills in automatically — or type it here."
                  placeholder="1500"
                  value={manualWords}
                  onChange={(event) => setManualWords(event.target.value)}
                />
              </div>
            )}
          </div>
        ) : (
          <Input
            name="budget"
            type="number"
            min={1}
            step="1"
            label="Budget (KES)"
            hint="Writers can bid below this. The accepted bid becomes the final price."
            placeholder="8000"
            value={form.budget}
            onChange={set('budget')}
            error={errors.budget}
            required
          />
        )}

        {/* Attachments */}
        <div>
          <p className="label">
            Attachments {humanization && <span className="text-gold-600">· required</span>}
          </p>
          <label
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors',
              files.length
                ? 'border-brand-400 bg-brand-50/60'
                : 'border-ink-300 bg-ink-50 hover:border-brand-400 hover:bg-brand-50/40',
            )}
          >
            <input
              type="file"
              multiple
              className="sr-only"
              accept=".doc,.docx,.pdf,.txt,.rtf,.odt,.xlsx,.png,.jpg,.jpeg"
              onChange={(event) => {
                const picked = Array.from(event.target.files ?? [])
                if (picked.length) setFiles((current) => [...current, ...picked])
              }}
            />
            <Upload className="h-8 w-8 text-ink-400" />
            <p className="mt-2.5 text-sm font-semibold text-ink-800">
              {humanization ? 'Upload the draft to humanize' : 'Add rubrics, sources or examples'}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">.docx, .pdf, .txt and images</p>
          </label>

          {files.length > 0 && (
            <ul className="mt-3 space-y-2">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 rounded-xl bg-ink-100 px-3.5 py-2.5"
                >
                  <FileText className="h-4 w-4 shrink-0 text-ink-500" />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-800">{file.name}</span>
                  <span className="shrink-0 text-xs text-ink-500">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                    className="shrink-0 rounded p-1 text-ink-400 hover:bg-ink-200 hover:text-ink-700"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Alert tone="info" icon={<Info className="h-4 w-4" />}>
        Posting is free. Money only leaves your wallet when you accept a bid and fund escrow —
        and it stays there until you approve the work.
      </Alert>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          variant="secondary"
          size="lg"
          loading={submitting}
          onClick={() => onSubmit(false)}
        >
          Save as draft
        </Button>
        <Button size="lg" loading={submitting} onClick={() => onSubmit(true)}>
          Post & open for bids
        </Button>
      </div>
    </div>
  )
}

function TypeCard({
  active,
  onClick,
  icon,
  title,
  body,
  tone,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  body: string
  tone: 'brand' | 'gold'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border-2 p-4 text-left transition-all',
        active
          ? tone === 'brand'
            ? 'border-brand-500 bg-brand-50'
            : 'border-gold-500 bg-gold-50'
          : 'border-ink-200 bg-surface hover:border-ink-300 hover:bg-ink-50',
      )}
    >
      <span
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-xl',
          active
            ? tone === 'brand'
              ? 'bg-solid-brand text-white'
              : 'bg-gold-500 text-white'
            : 'bg-ink-100 text-ink-500',
        )}
      >
        {icon}
      </span>
      <span className="mt-3 block text-sm font-semibold text-ink-900">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-ink-500">{body}</span>
    </button>
  )
}

function QuoteStat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 font-bold',
          highlight ? 'text-lg text-gold-700' : 'text-lg text-ink-900',
        )}
      >
        {value}
      </p>
    </div>
  )
}
