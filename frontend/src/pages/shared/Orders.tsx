import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Briefcase, Plus, Search } from 'lucide-react'
import { orders as ordersApi } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/context/AuthContext'
import { ORDER_TABS, SUBJECTS } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { EmptyState, Skeleton, Tabs } from '@/components/ui/Misc'
import { OrderCard } from '@/components/orders/OrderCard'
import { PageIntro } from '@/pages/client/ClientDashboard'

export default function Orders() {
  const { isWriter, isClient } = useAuth()
  const [params, setParams] = useSearchParams()

  const tab = params.get('tab') ?? ''
  const [search, setSearch] = useState(params.get('search') ?? '')
  const [subject, setSubject] = useState(params.get('subject') ?? '')

  const { data, loading } = useAsync(
    () => ordersApi.list({ tab, search, subject, page_size: 30 }),
    [tab, search, subject],
  )

  const setTab = (value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set('tab', value)
    else next.delete('tab')
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title={isWriter ? 'My jobs' : 'My orders'}
        subtitle={
          isWriter
            ? "Everything you've been assigned or bid on."
            : 'Every order you have posted, filtered however you like.'
        }
        action={
          isClient ? (
            <Link to="/orders/new">
              <Button icon={<Plus className="h-4 w-4" />}>Post a new order</Button>
            </Link>
          ) : (
            <Link to="/browse">
              <Button variant="accent" icon={<Search className="h-4 w-4" />}>
                Find work
              </Button>
            </Link>
          )
        }
      />

      <Tabs tabs={ORDER_TABS} value={tab} onChange={setTab} />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          name="search"
          placeholder="Search by title or brief…"
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
          wrapClassName="sm:w-56"
        />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : data?.results.length ? (
        <>
          <p className="text-sm text-ink-500">
            {data.count} order{data.count === 1 ? '' : 's'}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {data.results.map((order) => (
              <OrderCard key={order.id} order={order} showClient={isWriter} />
            ))}
          </div>
        </>
      ) : (
        <div className="card">
          <EmptyState
            icon={<Briefcase className="h-6 w-6" />}
            title="No orders here"
            description={
              tab
                ? 'Nothing matches this filter. Try another tab.'
                : isClient
                  ? 'Post your first order and writers will start bidding.'
                  : 'Bid on an open order and it will appear here.'
            }
            action={
              isClient ? (
                <Link to="/orders/new">
                  <Button icon={<Plus className="h-4 w-4" />}>Post an order</Button>
                </Link>
              ) : (
                <Link to="/browse">
                  <Button variant="accent">Browse orders</Button>
                </Link>
              )
            }
          />
        </div>
      )}
    </div>
  )
}
