import { useState } from 'react'
import { Banknote, CheckCircle2, XCircle } from 'lucide-react'
import { admin } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useToast } from '@/context/ToastContext'
import { formatDateTime, formatMoney } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { EmptyState, Skeleton, Tabs } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { PageIntro } from '@/pages/client/ClientDashboard'

const TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
]

export default function AdminPayouts() {
  const toast = useToast()
  const [status, setStatus] = useState('pending')

  const { data, loading, reload } = useAsync(
    () => admin.withdrawals({ status: status || undefined, page_size: 50 }),
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
        title="Withdrawal requests"
        subtitle="The amount is already debited from the writer's wallet. Rejecting returns it."
      />

      <Tabs tabs={TABS} value={status} onChange={setStatus} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : data?.results.length ? (
        <div className="space-y-3">
          {data.results.map((withdrawal) => (
            <div key={withdrawal.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg font-bold text-ink-900">
                      {formatMoney(withdrawal.amount)}
                    </p>
                    <Badge
                      tone={
                        withdrawal.status === 'paid'
                          ? 'success'
                          : withdrawal.status === 'rejected'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {withdrawal.status}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm text-ink-700">
                    {withdrawal.method === 'mpesa' ? 'M-Pesa' : 'Bank'} →{' '}
                    <span className="font-medium">{withdrawal.destination}</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    Net {formatMoney(withdrawal.net_amount)} after {formatMoney(withdrawal.fee)} fee
                    · requested {formatDateTime(withdrawal.created_at)} · ref{' '}
                    {withdrawal.reference.slice(0, 8)}
                  </p>
                  {withdrawal.notes && (
                    <p className="mt-1.5 text-xs italic text-ink-600">{withdrawal.notes}</p>
                  )}
                </div>

                {withdrawal.status === 'pending' && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      onClick={() =>
                        act(
                          () => admin.markWithdrawalPaid(withdrawal.id, 'Paid out manually'),
                          'Marked as paid',
                        )
                      }
                    >
                      Mark paid
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:bg-red-50"
                      icon={<XCircle className="h-3.5 w-3.5" />}
                      onClick={() =>
                        act(
                          () => admin.rejectWithdrawal(withdrawal.id, 'Rejected by admin'),
                          'Rejected — funds returned to the wallet',
                        )
                      }
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={<Banknote className="h-6 w-6" />}
            title="No withdrawal requests"
            description="Requests from writers appear here for you to settle."
          />
        </div>
      )}
    </div>
  )
}
