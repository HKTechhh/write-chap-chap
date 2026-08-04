import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeCheck, Search, Users } from 'lucide-react'
import { writers as writersApi } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { SUBJECTS } from '@/lib/constants'
import { Input, Select } from '@/components/ui/Field'
import { Avatar, EmptyState, Rating, Skeleton } from '@/components/ui/Misc'
import { TierBadge } from '@/components/ui/Badge'
import { PageIntro } from './ClientDashboard'
import type { PublicWriter } from '@/api/types'

const TIER_OPTIONS = [
  { value: 'expert', label: 'Expert' },
  { value: 'verified', label: 'Verified' },
  { value: 'new', label: 'New' },
]

export default function FindWriters() {
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [tier, setTier] = useState('')

  const { data, loading } = useAsync(
    () => writersApi.list({ search, subject, tier, page_size: 30 }),
    [search, subject, tier],
  )

  return (
    <div className="space-y-6">
      <PageIntro
        title="Find writers"
        subtitle="Browse the directory, then invite someone to bid by posting an order in their subject."
      />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          name="search"
          placeholder="Search by name or expertise…"
          leading={<Search className="h-4 w-4" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          name="subject"
          options={SUBJECTS}
          placeholder="All subjects"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          wrapClassName="sm:w-52"
        />
        <Select
          name="tier"
          options={TIER_OPTIONS}
          placeholder="All tiers"
          value={tier}
          onChange={(event) => setTier(event.target.value)}
          wrapClassName="sm:w-40"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : data?.results.length ? (
        <>
          <p className="text-sm text-ink-500">
            {data.count} writer{data.count === 1 ? '' : 's'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.results.map((writer) => (
              <WriterCard key={writer.id} writer={writer} />
            ))}
          </div>
        </>
      ) : (
        <div className="card">
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No writers match"
            description="Try widening your filters."
          />
        </div>
      )}
    </div>
  )
}

export function WriterCard({ writer }: { writer: PublicWriter }) {
  return (
    <Link to={`/w/${writer.username}`} className="card card-hover block p-5">
      <div className="flex items-start gap-3">
        <Avatar name={writer.display_name} src={writer.avatar} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-semibold text-ink-900">{writer.display_name}</p>
            {writer.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-teal-500" />}
          </div>
          <TierBadge tier={writer.tier} className="mt-1.5" />
          {writer.headline && (
            <p className="mt-2 line-clamp-2 text-sm leading-snug text-ink-600">{writer.headline}</p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-ink-100 pt-4">
        <Rating value={writer.rating_avg} count={writer.rating_count} />
        <span className="text-xs text-ink-500">{writer.completed_orders} orders</span>
        <span className="text-xs text-ink-500">
          {Number(writer.on_time_rate).toFixed(0)}% on time
        </span>
      </div>

      {writer.subjects.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {writer.subjects.slice(0, 3).map((item) => (
            <span
              key={item}
              className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium capitalize text-ink-600"
            >
              {item.replace('_', ' ')}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}
