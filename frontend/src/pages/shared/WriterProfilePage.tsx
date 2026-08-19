import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BadgeCheck, CalendarClock, CheckCircle2, Globe, Star } from 'lucide-react'
import { reviews as reviewsApi, writers as writersApi } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { TIER } from '@/lib/constants'
import { formatNumber, relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Avatar, EmptyState, PageLoader, Rating, StatCard } from '@/components/ui/Misc'
import { TierBadge } from '@/components/ui/Badge'

export default function WriterProfilePage() {
  const { username } = useParams<{ username: string }>()
  const navigate = useNavigate()

  const { data: writer, loading, error } = useAsync(() => writersApi.get(username!), [username])
  const { data: reviewList } = useAsync(
    () => (writer ? reviewsApi.list({ reviewee: writer.id, page_size: 20 }) : Promise.resolve(null)),
    [writer?.id],
  )

  if (loading) return <PageLoader label="Loading profile…" />
  if (error || !writer) {
    return (
      <EmptyState
        title="Writer not found"
        description="This profile doesn't exist or has been removed."
        action={
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Go back
          </Button>
        }
      />
    )
  }

  const tierMeta = TIER[writer.tier] ?? TIER.new

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Header */}
      <div className="card overflow-hidden">
        <div className="theme-fixed h-24 bg-gradient-to-r from-brand-600 via-brand-500 to-teal-500" />
        <div className="px-6 pb-6">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <Avatar name={writer.display_name} src={writer.avatar} size="xl" ring />
              <div className="pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-ink-900">
                    {writer.display_name}
                  </h1>
                  {writer.is_verified && <BadgeCheck className="h-5 w-5 text-teal-500" />}
                  <TierBadge tier={writer.tier} />
                </div>
                <p className="mt-1 text-sm text-ink-500">@{writer.username}</p>
              </div>
            </div>
            <Rating value={writer.rating_avg} count={writer.rating_count} size="md" className="pb-2" />
          </div>

          {writer.headline && (
            <p className="mt-5 text-base font-medium text-ink-800">{writer.headline}</p>
          )}
          {writer.bio && (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink-600">
              {writer.bio}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <Globe className="h-4 w-4" />
              {writer.country}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" />
              {writer.years_experience} year{writer.years_experience === 1 ? '' : 's'} experience
            </span>
          </div>

          <p className="mt-4 rounded-xl bg-ink-50 px-4 py-3 text-xs leading-relaxed text-ink-600">
            {tierMeta.blurb}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Completed orders"
          value={formatNumber(writer.completed_orders)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          accent="brand"
        />
        <StatCard
          label="Average rating"
          value={`${Number(writer.rating_avg).toFixed(1)}★`}
          icon={<Star className="h-4 w-4" />}
          hint={`${writer.rating_count} review${writer.rating_count === 1 ? '' : 's'}`}
          accent="gold"
        />
        <StatCard
          label="On-time delivery"
          value={`${Number(writer.on_time_rate).toFixed(0)}%`}
          icon={<CalendarClock className="h-4 w-4" />}
          accent={Number(writer.on_time_rate) >= 90 ? 'emerald' : 'red'}
        />
        <StatCard
          label="Tier"
          value={tierMeta.label}
          icon={<BadgeCheck className="h-4 w-4" />}
          accent="teal"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Reviews */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Reviews"
              description="Every review here is attached to a real, paid order."
              icon={<Star className="h-4 w-4" />}
            />
            {reviewList?.results.length ? (
              <div className="divide-y divide-ink-100">
                {reviewList.results.map((review) => (
                  <div key={review.id} className="p-5">
                    <div className="flex items-start gap-3">
                      <Avatar name={review.reviewer_name} src={review.reviewer_avatar} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-ink-900">
                            {review.reviewer_name}
                          </p>
                          <Rating value={review.rating} />
                          <span className="text-xs text-ink-400">
                            {relativeTime(review.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-ink-500">on “{review.order_title}”</p>
                        {review.comment && (
                          <p className="mt-2 text-sm leading-relaxed text-ink-700">
                            {review.comment}
                          </p>
                        )}
                        {review.reply && (
                          <div className="mt-3 rounded-lg bg-ink-50 p-3">
                            <p className="text-xs font-semibold text-ink-600">
                              {writer.display_name} replied
                            </p>
                            <p className="mt-1 text-sm text-ink-700">{review.reply}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Star className="h-6 w-6" />}
                title="No reviews yet"
                description="Reviews appear here once this writer completes their first order."
              />
            )}
          </Card>
        </div>

        {/* Skills */}
        <div className="space-y-6">
          {writer.subjects.length > 0 && (
            <Card>
              <CardHeader title="Subjects" />
              <div className="flex flex-wrap gap-2 p-5">
                {writer.subjects.map((subject) => (
                  <span
                    key={subject}
                    className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-medium capitalize text-brand-700 ring-1 ring-inset ring-brand-200"
                  >
                    {subject.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {writer.skills.length > 0 && (
            <Card>
              <CardHeader title="Skills" />
              <div className="flex flex-wrap gap-2 p-5">
                {writer.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-700"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {writer.languages.length > 0 && (
            <Card>
              <CardHeader title="Languages" />
              <div className="flex flex-wrap gap-2 p-5">
                {writer.languages.map((language) => (
                  <span
                    key={language}
                    className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 ring-1 ring-inset ring-teal-200"
                  >
                    {language}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
