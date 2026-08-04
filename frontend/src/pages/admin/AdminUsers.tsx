import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, CheckCircle2, RotateCcw, Search, ShieldCheck, Users, XCircle } from 'lucide-react'
import { admin } from '@/api/endpoints'
import { mediaUrl } from '@/api/client'
import { useAsync } from '@/hooks/useAsync'
import { useToast } from '@/context/ToastContext'
import { formatDate, formatMoney } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Field'
import { Avatar, EmptyState, Skeleton, Tabs } from '@/components/ui/Misc'
import { Badge, TierBadge } from '@/components/ui/Badge'
import { PageIntro } from '@/pages/client/ClientDashboard'

const TABS = [
  { value: 'pending', label: 'KYC pending' },
  { value: '', label: 'All users' },
]

export default function AdminUsers() {
  const toast = useToast()
  const [kyc, setKyc] = useState('pending')
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')

  const { data, loading, reload } = useAsync(
    () =>
      admin.users({
        kyc_status: kyc || undefined,
        search: search || undefined,
        role: role || undefined,
        page_size: 50,
      }),
    [kyc, search, role],
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
        title="Users & KYC"
        subtitle="Approve identity documents, suspend abusive accounts, reinstate on appeal."
      />

      <Tabs tabs={TABS} value={kyc} onChange={setKyc} />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          name="search"
          placeholder="Search by name, username, email or phone…"
          leading={<Search className="h-4 w-4" />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          name="role"
          options={[
            { value: 'client', label: 'Clients' },
            { value: 'writer', label: 'Writers' },
            { value: 'admin', label: 'Admins' },
          ]}
          placeholder="All roles"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          wrapClassName="sm:w-44"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : data?.results.length ? (
        <div className="space-y-3">
          {data.results.map((user) => {
            const profile = user.writer_profile
            return (
              <div key={user.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    <Avatar name={user.display_name} src={user.avatar} size="md" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-ink-900">{user.display_name}</p>
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase text-ink-600">
                          {user.role}
                        </span>
                        {profile && <TierBadge tier={profile.tier} />}
                        <Badge
                          tone={
                            user.kyc_status === 'approved'
                              ? 'success'
                              : user.kyc_status === 'pending'
                                ? 'warning'
                                : user.kyc_status === 'rejected'
                                  ? 'danger'
                                  : 'neutral'
                          }
                        >
                          KYC {user.kyc_status.replace('_', ' ')}
                        </Badge>
                        {profile?.is_suspended && <Badge tone="danger">Suspended</Badge>}
                      </div>

                      <p className="mt-1 text-xs text-ink-500">
                        {user.email} · {user.phone || 'no phone'} · joined{' '}
                        {formatDate(user.date_joined)}
                      </p>

                      {profile && (
                        <p className="mt-1.5 text-xs text-ink-600">
                          {profile.completed_orders} orders ·{' '}
                          {Number(profile.rating_avg).toFixed(1)}★ ·{' '}
                          {Number(profile.on_time_rate).toFixed(0)}% on time ·{' '}
                          <span className={profile.strikes ? 'font-semibold text-red-600' : ''}>
                            {profile.strikes} strike{profile.strikes === 1 ? '' : 's'}
                          </span>
                          {' · earned '}
                          {formatMoney(profile.total_earned)}
                        </p>
                      )}

                      {profile && (
                        <Link
                          to={`/w/${user.username}`}
                          className="mt-1.5 inline-block text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          View public profile →
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {user.kyc_status === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          variant="success"
                          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                          onClick={() => act(() => admin.approveKyc(user.id), 'KYC approved')}
                        >
                          Approve KYC
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<XCircle className="h-3.5 w-3.5" />}
                          onClick={() => act(() => admin.rejectKyc(user.id), 'KYC rejected')}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {profile?.is_suspended ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<RotateCcw className="h-3.5 w-3.5" />}
                        onClick={() => act(() => admin.reinstateUser(user.id), 'Reinstated')}
                      >
                        Reinstate
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        icon={<Ban className="h-3.5 w-3.5" />}
                        onClick={() =>
                          act(
                            () => admin.suspendUser(user.id, 'Administrative action'),
                            'User suspended',
                          )
                        }
                      >
                        Suspend
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={kyc === 'pending' ? <ShieldCheck className="h-6 w-6" /> : <Users className="h-6 w-6" />}
            title={kyc === 'pending' ? 'No KYC submissions waiting' : 'No users match'}
            description={
              kyc === 'pending'
                ? 'Writers who submit identity documents appear here.'
                : 'Try a different search or role filter.'
            }
          />
        </div>
      )}
    </div>
  )
}
