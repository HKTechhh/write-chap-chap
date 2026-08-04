import type { LeakKind, OrderStatus, WriterTier } from '@/api/types'

export const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER ?? '254700000000'

export const SUBJECTS = [
  { value: 'business', label: 'Business & Management' },
  { value: 'nursing', label: 'Nursing & Healthcare' },
  { value: 'law', label: 'Law' },
  { value: 'psychology', label: 'Psychology' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'it', label: 'IT & Computer Science' },
  { value: 'literature', label: 'Literature & English' },
  { value: 'history', label: 'History' },
  { value: 'economics', label: 'Economics & Finance' },
  { value: 'education', label: 'Education' },
  { value: 'science', label: 'Natural Sciences' },
  { value: 'marketing', label: 'Marketing & Copywriting' },
  { value: 'other', label: 'Other' },
]

interface StatusMeta {
  label: string
  /** Badge classes — colour lives on the pill, never the card background. */
  className: string
  dot: string
  description: string
}

export const ORDER_STATUS: Record<OrderStatus, StatusMeta> = {
  draft: {
    label: 'Draft',
    className: 'bg-ink-100 text-ink-600 ring-ink-200',
    dot: 'bg-ink-400',
    description: 'Not published yet — only you can see this.',
  },
  open_for_bids: {
    label: 'Open for bids',
    className: 'bg-sky-50 text-sky-700 ring-sky-200',
    dot: 'bg-sky-500',
    description: 'Writers can bid on this order.',
  },
  bid_accepted: {
    label: 'Awaiting funding',
    className: 'bg-violet-50 text-violet-700 ring-violet-200',
    dot: 'bg-violet-500',
    description: 'A writer is assigned. Fund escrow to start the work.',
  },
  escrowed: {
    label: 'Escrowed',
    className: 'bg-violet-50 text-violet-700 ring-violet-200',
    dot: 'bg-violet-500',
    description: 'Money is held safely until you approve the work.',
  },
  in_progress: {
    label: 'In progress',
    className: 'bg-gold-50 text-gold-700 ring-gold-200',
    dot: 'bg-gold-500',
    description: 'The writer is working on your order.',
  },
  submitted: {
    label: 'In review',
    className: 'bg-brand-50 text-brand-700 ring-brand-200',
    dot: 'bg-brand-500',
    description: 'Work delivered — review it before the window closes.',
  },
  in_revision: {
    label: 'In revision',
    className: 'bg-amber-50 text-amber-700 ring-amber-200',
    dot: 'bg-amber-500',
    description: 'The writer is making the changes you asked for.',
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    description: 'Approved and paid out.',
  },
  disputed: {
    label: 'Disputed',
    className: 'bg-red-50 text-red-700 ring-red-200',
    dot: 'bg-red-500',
    description: 'Under admin review.',
  },
  canceled: {
    label: 'Canceled',
    className: 'bg-ink-100 text-ink-600 ring-ink-200',
    dot: 'bg-ink-400',
    description: 'This order was canceled and refunded.',
  },
}

export const TIER: Record<WriterTier, { label: string; className: string; blurb: string }> = {
  new: {
    label: 'New',
    className: 'bg-ink-100 text-ink-700 ring-ink-200',
    blurb: 'Getting started — complete 5 orders at 4.0★ to reach Verified.',
  },
  verified: {
    label: 'Verified',
    className: 'bg-teal-50 text-teal-700 ring-teal-200',
    blurb: 'Proven track record. 25 orders at 4.6★ and 95% on-time unlocks Expert.',
  },
  expert: {
    label: 'Expert',
    className: 'bg-gold-100 text-gold-800 ring-gold-300',
    blurb: 'Top tier — highest visibility in the bid feed.',
  },
}

export const LEAK_KIND_LABEL: Record<LeakKind, string> = {
  email: 'Email address',
  email_obfuscated: 'Disguised email',
  phone: 'Phone number',
  phone_spelled: 'Spelled-out number',
  messaging_link: 'Messaging link',
  social_handle: 'Social handle',
  payment_detail: 'Payment details',
  external_url: 'External link',
  circumvention: 'Off-platform request',
}

export const ORDER_TABS = [
  { value: '', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'active', label: 'Active' },
  { value: 'in_review', label: 'In review' },
  { value: 'completed', label: 'Completed' },
  { value: 'disputed', label: 'Disputed' },
]

export const REPORT_TYPE_LABEL: Record<string, string> = {
  ai_content: 'AI content detection',
  plagiarism: 'Plagiarism scan',
  turnitin: 'Turnitin report',
  similarity_links: 'Similarity / source links',
}
