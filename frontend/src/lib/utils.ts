/** Anything a conditional expression might produce in a className position. */
export type ClassValue = string | number | boolean | null | undefined

export function cn(...classes: ClassValue[]): string {
  return classes.filter((value): value is string => typeof value === 'string' && value !== '').join(' ')
}

export function formatMoney(amount: string | number | null | undefined, currency = 'KES'): string {
  const value = Number(amount ?? 0)
  if (Number.isNaN(value)) return `${currency} 0`
  return `${currency} ${value.toLocaleString('en-KE', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatNumber(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString('en-KE')
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-KE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "3 days left", "2 hours ago" — relative to now, with direction. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const target = new Date(iso).getTime()
  const diffMs = target - Date.now()
  const future = diffMs > 0
  const abs = Math.abs(diffMs)

  const minutes = Math.round(abs / 60000)
  const hours = Math.round(abs / 3600000)
  const days = Math.round(abs / 86400000)

  let text: string
  if (minutes < 1) text = 'just now'
  else if (minutes < 60) text = `${minutes} min`
  else if (hours < 24) text = `${hours} hour${hours === 1 ? '' : 's'}`
  else if (days < 30) text = `${days} day${days === 1 ? '' : 's'}`
  else text = formatDate(iso)

  if (text === 'just now' || text.includes(' ') === false) return text
  if (minutes < 1) return text
  if (days >= 30) return text
  return future ? `in ${text}` : `${text} ago`
}

/** Deadline urgency, used to colour countdowns. */
export function deadlineTone(iso: string | null | undefined): 'overdue' | 'urgent' | 'soon' | 'calm' {
  if (!iso) return 'calm'
  const diffHours = (new Date(iso).getTime() - Date.now()) / 3600000
  if (diffHours < 0) return 'overdue'
  if (diffHours < 24) return 'urgent'
  if (diffHours < 72) return 'soon'
  return 'calm'
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function truncate(text: string, max = 120): string {
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function hoursToLabel(hours: number): string {
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'}`
}

/** Deterministic pastel colour from a string — used for avatar fallbacks. */
export function avatarColor(seed: string): string {
  const palette = [
    'bg-brand-500',
    'bg-teal-500',
    'bg-gold-500',
    'bg-rose-500',
    'bg-violet-500',
    'bg-emerald-500',
    'bg-sky-500',
    'bg-orange-500',
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}
