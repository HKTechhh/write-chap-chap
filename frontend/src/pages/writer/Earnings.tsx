import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Percent,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { subscription as subApi, wallet as walletApi } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { cn, formatDateTime, formatMoney } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Alert, EmptyState, Skeleton, StatCard } from '@/components/ui/Misc'
import { Badge } from '@/components/ui/Badge'
import { PageIntro } from '@/pages/client/ClientDashboard'

export default function Earnings() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const [withdrawOpen, setWithdrawOpen] = useState(false)

  const walletState = useAsync(() => walletApi.get(), [])
  const transactions = useAsync(() => walletApi.transactions({ page_size: 40 }), [])
  const withdrawals = useAsync(() => walletApi.withdrawals(), [])
  const subscription = useAsync(() => subApi.get(), [])

  const profile = user?.writer_profile
  const kycApproved = user?.kyc_status === 'approved'

  const reloadAll = () => {
    walletState.reload()
    transactions.reload()
    withdrawals.reload()
    void refresh()
  }

  const goPro = async () => {
    try {
      await subApi.subscribe('pro')
      toast.success('Writer Pro active', 'Your platform fee is now 5%.')
      subscription.reload()
      reloadAll()
    } catch (error) {
      toast.error('Could not activate Pro', error instanceof Error ? error.message : undefined)
    }
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Earnings"
        subtitle="What you've made, what you owe in fees, and how to get paid out."
        action={
          <Button
            variant="accent"
            icon={<Banknote className="h-4 w-4" />}
            onClick={() => setWithdrawOpen(true)}
          >
            Withdraw
          </Button>
        }
      />

      {!kycApproved && (
        <Alert
          tone="warning"
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Verify your identity to withdraw"
        >
          Withdrawals need an approved KYC submission.{' '}
          <Link to="/account" className="font-semibold underline">
            Submit your ID
          </Link>{' '}
          — it usually takes under a day.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available now"
          value={formatMoney(walletState.data?.balance ?? user?.wallet_balance)}
          icon={<Banknote className="h-4 w-4" />}
          hint="Ready to withdraw"
          accent="emerald"
        />
        <StatCard
          label="Earned all time"
          value={formatMoney(profile?.total_earned)}
          icon={<TrendingUp className="h-4 w-4" />}
          hint="After platform fees"
          accent="gold"
        />
        <StatCard
          label="Completed orders"
          value={profile?.completed_orders ?? 0}
          icon={<Sparkles className="h-4 w-4" />}
          hint={`${Number(profile?.on_time_rate ?? 100).toFixed(0)}% delivered on time`}
          accent="brand"
        />
        <StatCard
          label="Your platform fee"
          value={`${Number(subscription.data?.effective_fee_percent ?? 12).toFixed(0)}%`}
          icon={<Percent className="h-4 w-4" />}
          hint={subscription.data?.active ? 'Writer Pro rate' : 'Standard rate'}
          accent="violet"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Earnings history" description="Payouts, fines and withdrawals." />
            {transactions.loading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-14" />
                ))}
              </div>
            ) : transactions.data?.results.length ? (
              <div>
                {transactions.data.results.map((tx) => {
                  const credit = tx.direction === 'credit'
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center gap-4 border-b border-ink-100 px-5 py-3.5 last:border-0"
                    >
                      <span
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                          credit ? 'bg-emerald-50 text-emerald-600' : 'bg-ink-100 text-ink-600',
                        )}
                      >
                        {credit ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">
                          {tx.description || tx.type_display}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {formatDateTime(tx.created_at)}
                        </p>
                      </div>
                      <p
                        className={cn(
                          'shrink-0 text-sm font-bold',
                          credit ? 'text-emerald-600' : 'text-ink-900',
                        )}
                      >
                        {credit ? '+' : '−'} {formatMoney(tx.amount)}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={<Banknote className="h-6 w-6" />}
                title="No earnings yet"
                description="Complete your first order and the payout lands here."
                action={
                  <Link to="/browse">
                    <Button variant="accent">Find work</Button>
                  </Link>
                }
              />
            )}
          </Card>

          {withdrawals.data?.results.length ? (
            <Card>
              <CardHeader title="Withdrawal requests" />
              <div>
                {withdrawals.data.results.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 border-b border-ink-100 px-5 py-3.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-900">
                        {formatMoney(item.amount)} to {item.destination}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatDateTime(item.created_at)} · net {formatMoney(item.net_amount)} after{' '}
                        {formatMoney(item.fee)} fee
                      </p>
                    </div>
                    <Badge
                      tone={
                        item.status === 'paid'
                          ? 'success'
                          : item.status === 'rejected'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-gold-500 to-orange-500 p-6 text-white">
            <p className="text-sm text-white/80">Available to withdraw</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight">
              {formatMoney(walletState.data?.balance ?? user?.wallet_balance)}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-6"
              fullWidth
              disabled={!kycApproved}
              onClick={() => setWithdrawOpen(true)}
            >
              {kycApproved ? 'Withdraw to M-Pesa' : 'Verify ID to withdraw'}
            </Button>
          </div>

          {/* Pro upsell */}
          {subscription.data?.active ? (
            <Card>
              <CardHeader
                title="Writer Pro"
                description="Active"
                icon={<Sparkles className="h-4 w-4" />}
              />
              <div className="p-5 text-sm">
                <p className="text-ink-600">
                  Your platform fee is{' '}
                  <span className="font-bold text-ink-900">
                    {Number(subscription.data.effective_fee_percent).toFixed(0)}%
                  </span>{' '}
                  instead of {subscription.data.standard_fee_percent ?? 12}%.
                </p>
                {subscription.data.renews_at && (
                  <p className="mt-2 text-xs text-ink-500">
                    Renews {formatDateTime(subscription.data.renews_at)}
                  </p>
                )}
              </div>
            </Card>
          ) : (
            <div className="rounded-2xl border-2 border-gold-300 bg-gold-50 p-6">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1 text-xs font-bold text-white">
                <Sparkles className="h-3.5 w-3.5" />
                Writer Pro
              </span>
              <h3 className="mt-4 text-lg font-bold text-ink-900">
                Cut your fee from {subscription.data?.standard_fee_percent ?? 12}% to{' '}
                {subscription.data?.pro_fee_percent ?? 5}%
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">
                Billed monthly from your wallet. On steady volume it usually pays for itself
                within a few orders.
              </p>
              <Button variant="accent" className="mt-5" fullWidth onClick={goPro}>
                Go Pro — KES 1,500/month
              </Button>
            </div>
          )}
        </div>
      </div>

      <WithdrawModal
        open={withdrawOpen}
        balance={walletState.data?.balance ?? user?.wallet_balance ?? '0'}
        phone={user?.phone ?? ''}
        onClose={() => setWithdrawOpen(false)}
        onDone={() => {
          toast.success('Withdrawal requested', 'An admin will process it shortly.')
          setWithdrawOpen(false)
          reloadAll()
        }}
      />
    </div>
  )
}

function WithdrawModal({
  open,
  balance,
  phone,
  onClose,
  onDone,
}: {
  open: boolean
  balance: string
  phone: string
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('mpesa')
  const [destination, setDestination] = useState(phone)
  const [busy, setBusy] = useState(false)

  const fee = 50
  const net = Math.max(0, Number(amount || 0) - fee)

  const submit = async () => {
    if (!(Number(amount) > fee)) {
      toast.error(`Withdrawal must be more than the KES ${fee} fee.`)
      return
    }
    if (!destination.trim()) {
      toast.error('Enter the number or account to send to.')
      return
    }
    setBusy(true)
    try {
      await walletApi.withdraw({ amount, method, destination })
      setAmount('')
      onDone()
    } catch (error) {
      toast.error('Withdrawal failed', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Withdraw earnings"
      description={`Available: ${formatMoney(balance)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={submit}>
            Request withdrawal
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Input
          name="amount"
          type="number"
          min={fee + 1}
          label="Amount (KES)"
          placeholder="5000"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          trailing={
            <button
              type="button"
              onClick={() => setAmount(String(Math.floor(Number(balance))))}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Max
            </button>
          }
        />

        <Select
          name="method"
          label="Payout method"
          options={[
            { value: 'mpesa', label: 'M-Pesa' },
            { value: 'bank', label: 'Bank transfer' },
          ]}
          value={method}
          onChange={(event) => setMethod(event.target.value)}
        />

        <Input
          name="destination"
          label={method === 'mpesa' ? 'M-Pesa number' : 'Account number'}
          placeholder={method === 'mpesa' ? '0712 345 678' : 'Bank account'}
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
        />

        <div className="rounded-xl bg-ink-50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-500">Withdrawal</span>
            <span className="font-medium text-ink-800">{formatMoney(amount || 0)}</span>
          </div>
          <div className="mt-2 flex justify-between">
            <span className="text-ink-500">Processing fee</span>
            <span className="font-medium text-ink-800">− {formatMoney(fee)}</span>
          </div>
          <div className="mt-3 flex justify-between border-t border-ink-200 pt-3">
            <span className="font-semibold text-ink-700">You receive</span>
            <span className="text-lg font-bold text-ink-900">{formatMoney(net)}</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}
