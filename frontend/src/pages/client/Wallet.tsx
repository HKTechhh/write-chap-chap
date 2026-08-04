import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Info, Plus, Smartphone, Wallet as WalletIcon } from 'lucide-react'
import { wallet as walletApi } from '@/api/endpoints'
import { useAsync } from '@/hooks/useAsync'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import { cn, formatDateTime, formatMoney } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input, Select } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Alert, EmptyState, Skeleton } from '@/components/ui/Misc'
import { PageIntro } from './ClientDashboard'

const QUICK_AMOUNTS = [1000, 2500, 5000, 10000, 20000]

export default function Wallet() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const [topUpOpen, setTopUpOpen] = useState(false)

  const walletState = useAsync(() => walletApi.get(), [])
  const transactions = useAsync(() => walletApi.transactions({ page_size: 40 }), [])

  const reloadAll = () => {
    walletState.reload()
    transactions.reload()
    void refresh()
  }

  return (
    <div className="space-y-6">
      <PageIntro
        title="Wallet"
        subtitle="Top up here, then fund orders from your balance."
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setTopUpOpen(true)}>
            Top up
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              title="Transaction history"
              description="Every movement in and out of your wallet."
            />
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
                          {formatDateTime(tx.created_at)} · {tx.reference}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            'text-sm font-bold',
                            credit ? 'text-emerald-600' : 'text-ink-900',
                          )}
                        >
                          {credit ? '+' : '−'} {formatMoney(tx.amount)}
                        </p>
                        <p className="text-xs text-ink-400">
                          bal {formatMoney(tx.balance_after)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <EmptyState
                icon={<WalletIcon className="h-6 w-6" />}
                title="No transactions yet"
                description="Top up your wallet and your activity will show here."
                action={<Button onClick={() => setTopUpOpen(true)}>Top up</Button>}
              />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-600 to-teal-600 p-6 text-white">
            <p className="text-sm text-white/75">Available balance</p>
            <p className="mt-2 text-4xl font-extrabold tracking-tight">
              {walletState.loading
                ? '—'
                : formatMoney(walletState.data?.balance ?? user?.wallet_balance)}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-6"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setTopUpOpen(true)}
              fullWidth
            >
              Add money
            </Button>
          </div>

          <Alert tone="info" icon={<Info className="h-4 w-4" />} title="How escrow works">
            When you accept a bid and fund an order, the money moves from this balance into
            escrow. It only reaches the writer once you approve the work — or if you don't
            respond within 72 hours.
          </Alert>
        </div>
      </div>

      <TopUpModal
        open={topUpOpen}
        onClose={() => setTopUpOpen(false)}
        onDone={(message) => {
          toast.success('Top-up complete', message)
          setTopUpOpen(false)
          reloadAll()
        }}
      />
    </div>
  )
}

export function TopUpModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean
  onClose: () => void
  onDone: (message?: string) => void
}) {
  const { user } = useAuth()
  const toast = useToast()
  const [amount, setAmount] = useState('')
  const [provider, setProvider] = useState('mpesa')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!(Number(amount) >= 10)) {
      toast.error('Enter an amount of at least KES 10.')
      return
    }
    setBusy(true)
    try {
      const result = await walletApi.topUp({ amount, provider, phone })
      if (result.simulated) {
        onDone(result.detail)
      } else if (result.payment_link) {
        window.location.href = result.payment_link
      } else {
        toast.info('Check your phone', 'Approve the M-Pesa prompt to complete the top-up.')
        onClose()
      }
      setAmount('')
    } catch (error) {
      toast.error('Top-up failed', error instanceof Error ? error.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Top up your wallet"
      description="Funds land instantly and can be used to escrow any order."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Top up {amount ? formatMoney(amount) : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="label">Quick amounts</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setAmount(String(value))}
                className={cn(
                  'rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors',
                  Number(amount) === value
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-ink-300 bg-white text-ink-700 hover:border-brand-300 hover:bg-brand-50/40',
                )}
              >
                {value.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        <Input
          name="amount"
          type="number"
          min={10}
          label="Amount (KES)"
          placeholder="5000"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />

        <Select
          name="provider"
          label="Payment method"
          options={[
            { value: 'mpesa', label: 'M-Pesa (STK push)' },
            { value: 'flutterwave', label: 'Card / Flutterwave' },
          ]}
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
        />

        {provider === 'mpesa' && (
          <Input
            name="phone"
            label="M-Pesa number"
            placeholder="0712 345 678"
            leading={<Smartphone className="h-4 w-4" />}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        )}

        <Alert tone="info">
          If payment credentials aren't configured on this environment, the top-up is simulated
          so you can still test the full order lifecycle.
        </Alert>
      </div>
    </Modal>
  )
}
