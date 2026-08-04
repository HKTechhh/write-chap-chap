import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageSquare, Star } from 'lucide-react'
import { reviews as reviewsApi } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Field'
import { Avatar, EmptyState, Rating, Skeleton, Tabs } from '@/components/ui/Misc'
import { PageIntro } from '@/pages/client/ClientDashboard'
import type { Review } from '@/api/types'

export default function Reviews() {
  const { user } = useAuth()
  const [tab, setTab] = useState('received')

  const received = useAsync(
    () => (user ? reviewsApi.list({ reviewee: user.id, page_size: 40 }) : Promise.resolve(null)),
    [user?.id],
  )
  const written = useAsync(
    () => (user ? reviewsApi.list({ page_size: 40 }) : Promise.resolve(null)),
    [user?.id],
  )

  const writtenByMe = written.data?.results.filter((review) => review.reviewer === user?.id) ?? []
  const list = tab === 'received' ? (received.data?.results ?? []) : writtenByMe
  const loading = tab === 'received' ? received.loading : written.loading

  const average =
    (received.data?.results.length ?? 0) > 0
      ? received.data!.results.reduce((sum, review) => sum + review.rating, 0) /
        received.data!.results.length
      : 0

  return (
    <div className="space-y-6">
      <PageIntro
        title="Reviews"
        subtitle="Reviews can only come from completed, paid orders — which is what makes them worth reading."
      />

      {(received.data?.results.length ?? 0) > 0 && (
        <div className="card flex flex-wrap items-center gap-6 p-6">
          <div>
            <p className="text-4xl font-extrabold tracking-tight text-ink-900">
              {average.toFixed(1)}
            </p>
            <Rating value={average} className="mt-1.5" />
          </div>
          <div className="h-12 w-px bg-ink-200" />
          <div>
            <p className="text-sm text-ink-500">Based on</p>
            <p className="text-lg font-bold text-ink-900">
              {received.data!.results.length} review
              {received.data!.results.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      )}

      <Tabs
        tabs={[
          { value: 'received', label: 'About you', count: received.data?.results.length },
          { value: 'written', label: 'You wrote', count: writtenByMe.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      <Card>
        {loading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24" />
            ))}
          </div>
        ) : list.length ? (
          <div className="divide-y divide-ink-100">
            {list.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                canReply={tab === 'received' && !review.reply}
                onReplied={() => received.reload()}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Star className="h-6 w-6" />}
            title={tab === 'received' ? 'No reviews yet' : "You haven't reviewed anyone yet"}
            description={
              tab === 'received'
                ? 'Complete an order and the other party can leave you a review.'
                : 'After an order completes, you can rate the person you worked with.'
            }
            action={
              <Link to="/orders">
                <Button variant="secondary">View orders</Button>
              </Link>
            }
          />
        )}
      </Card>
    </div>
  )
}

function ReviewRow({
  review,
  canReply,
  onReplied,
}: {
  review: Review
  canReply: boolean
  onReplied: () => void
}) {
  const toast = useToast()
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!reply.trim()) return
    setBusy(true)
    try {
      await reviewsApi.reply(review.id, reply)
      toast.success('Reply posted')
      setReplying(false)
      onReplied()
    } catch (error) {
      toast.error('Could not reply', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <Avatar name={review.reviewer_name} src={review.reviewer_avatar} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink-900">{review.reviewer_name}</p>
            <Rating value={review.rating} />
            <span className="text-xs text-ink-400">{relativeTime(review.created_at)}</span>
          </div>
          <Link
            to={`/orders/${review.order}`}
            className="mt-1 block text-xs text-ink-500 hover:text-brand-600"
          >
            on “{review.order_title}”
          </Link>

          {review.comment && (
            <p className="mt-2.5 text-sm leading-relaxed text-ink-700">{review.comment}</p>
          )}

          {review.reply ? (
            <div className="mt-3 rounded-xl bg-ink-50 p-3.5">
              <p className="text-xs font-semibold text-ink-600">Your reply</p>
              <p className="mt-1 text-sm text-ink-700">{review.reply}</p>
            </div>
          ) : canReply ? (
            replying ? (
              <div className="mt-3">
                <Textarea
                  name="reply"
                  rows={3}
                  placeholder="Keep it short and professional — you only get one reply."
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                />
                <div className="mt-2.5 flex gap-2">
                  <Button size="sm" loading={busy} onClick={submit}>
                    Post reply
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 -ml-3"
                icon={<MessageSquare className="h-3.5 w-3.5" />}
                onClick={() => setReplying(true)}
              >
                Reply
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  )
}
