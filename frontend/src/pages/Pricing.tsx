import type * as React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, FileSearch, Sparkles, Wand2 } from 'lucide-react'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export default function Pricing() {
  return (
    <MarketingLayout>
      <section className="relative overflow-hidden bg-ink-950 py-20">
        <div className="absolute inset-0 bg-mesh-brand" aria-hidden />
        <div className="container-page relative text-center">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-300">Pricing</p>
          <h1 className="mx-auto mt-4 max-w-2xl text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            You always see the split before you commit
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-ink-400">
            Clients pay the order amount and nothing on top. Writers pay a service fee on
            release — shown in full on every bid and every order screen.
          </p>
        </div>
      </section>

      {/* Marketplace fees */}
      <section className="bg-white py-20">
        <div className="container-page">
          <div className="grid gap-6 lg:grid-cols-2">
            <PlanCard
              name="Free"
              price="12%"
              unit="service fee per order"
              description="The default for every writer. No monthly cost — the platform only earns when you do."
              features={[
                'Bid on unlimited orders',
                'Escrow protection on every job',
                'Auto-approval if a client goes quiet',
                'Standard placement in the bid feed',
                'M-Pesa withdrawals after KYC',
              ]}
              cta={
                <Link to="/register?role=writer">
                  <Button variant="secondary" fullWidth>
                    Start free
                  </Button>
                </Link>
              }
            />
            <PlanCard
              featured
              name="Writer Pro"
              price="5%"
              unit="service fee per order"
              description="For writers with steady volume. The fee saving usually covers the subscription within a few orders."
              badge="Lower fee"
              features={[
                'Everything in Free',
                'Service fee drops from 12% to 5%',
                'Priority placement in the bid feed',
                'Boosted bid credits',
                'Billed monthly from your wallet — cancel anytime',
              ]}
              cta={
                <Link to="/register?role=writer">
                  <Button variant="accent" fullWidth iconRight={<ArrowRight className="h-4 w-4" />}>
                    Go Pro
                  </Button>
                </Link>
              }
            />
          </div>

          <p className="mt-8 text-center text-sm text-ink-500">
            Clients pay <span className="font-semibold text-ink-800">no platform fee</span> — the
            budget you set is what leaves your wallet.
          </p>
        </div>
      </section>

      {/* Services */}
      <section className="bg-ink-50 py-20">
        <div className="container-page">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-brand-600">Services</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
              Fixed-price, no bidding needed
            </h2>
          </div>

          <div className="mt-14 grid gap-6 md:grid-cols-2">
            <ServiceCard
              icon={<FileSearch className="h-6 w-6" />}
              tone="brand"
              title="Check My Paper"
              price="KES 150"
              unit="per report, any document size"
              body="Upload a document and pick which reports you need. We run the checks and send the results back to you — no marketplace account required."
              points={[
                'AI content detection',
                'Plagiarism scan',
                'Turnitin report',
                'Similarity / source links',
                'Two report types on one document = KES 300',
              ]}
              cta={
                <Link to="/check-my-paper">
                  <Button fullWidth iconRight={<ArrowRight className="h-4 w-4" />}>
                    Submit a document
                  </Button>
                </Link>
              }
            />
            <ServiceCard
              icon={<Wand2 className="h-6 w-6" />}
              tone="gold"
              title="AI Humanization"
              price="KES 50"
              unit="per 250 words (rounded up)"
              body="Upload your draft and the system counts the words automatically and locks the price. Writers then bid to claim the job on delivery time, not on price."
              points={[
                '1,000 words → 4 pages → KES 200',
                '1,750 words → 7 pages → KES 350',
                'Runs through normal escrow and disputes',
                'Standard service fee applies on release',
                'Same revision and refund protections',
              ]}
              cta={
                <Link to="/register?role=client">
                  <Button variant="accent" fullWidth iconRight={<ArrowRight className="h-4 w-4" />}>
                    Post a humanization job
                  </Button>
                </Link>
              }
            />
          </div>
        </div>
      </section>

      {/* Other charges */}
      <section className="bg-white py-20">
        <div className="container-page max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight text-ink-900">Everything else</h2>
          <p className="mt-2 text-sm text-ink-600">
            No hidden charges. This is the complete list.
          </p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-ink-200">
            {[
              ['Posting an order', 'Free', 'Post as many as you like, pay only when you fund one.'],
              ['Bidding on an order', 'Free', 'Unlimited bids on both Free and Pro.'],
              ['Escrow funding', 'No markup', 'Whatever the order costs is what leaves your wallet.'],
              ['Withdrawal fee', 'KES 50 flat', 'Covers the M-Pesa/bank transfer cost.'],
              ['Revision request', 'Free', 'As many rounds as the brief reasonably needs.'],
              ['Dispute arbitration', 'Free', 'Reviewed by a human admin, not an algorithm.'],
              [
                'Late-delivery fine',
                '5%/day, max 25%',
                'Charged to the writer. Half refunds the client, half is platform revenue.',
              ],
            ].map(([label, price, note], index) => (
              <div
                key={label}
                className={cn(
                  'flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6',
                  index % 2 === 1 && 'bg-ink-50',
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{label}</p>
                  <p className="mt-0.5 text-xs text-ink-500">{note}</p>
                </div>
                <p className="shrink-0 text-sm font-bold text-brand-700">{price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  )
}

function PlanCard({
  name,
  price,
  unit,
  description,
  features,
  cta,
  featured,
  badge,
}: {
  name: string
  price: string
  unit: string
  description: string
  features: string[]
  cta: React.ReactNode
  featured?: boolean
  badge?: string
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-3xl border p-8',
        featured
          ? 'border-gold-300 bg-gradient-to-br from-gold-50 via-white to-orange-50 shadow-card-hover'
          : 'border-ink-200 bg-white shadow-card',
      )}
    >
      {badge && (
        <span className="absolute -top-3 left-8 inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1 text-xs font-bold text-white">
          <Sparkles className="h-3.5 w-3.5" />
          {badge}
        </span>
      )}
      <h3 className="text-lg font-bold text-ink-900">{name}</h3>
      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-5xl font-extrabold tracking-tight text-ink-900">{price}</span>
      </div>
      <p className="mt-1 text-sm text-ink-500">{unit}</p>
      <p className="mt-4 text-sm leading-relaxed text-ink-600">{description}</p>
      <ul className="mt-6 flex-1 space-y-3">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2.5 text-sm text-ink-700">
            <Check
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                featured ? 'text-gold-600' : 'text-brand-600',
              )}
            />
            {feature}
          </li>
        ))}
      </ul>
      <div className="mt-8">{cta}</div>
    </div>
  )
}

function ServiceCard({
  icon,
  tone,
  title,
  price,
  unit,
  body,
  points,
  cta,
}: {
  icon: React.ReactNode
  tone: 'brand' | 'gold'
  title: string
  price: string
  unit: string
  body: string
  points: string[]
  cta: React.ReactNode
}) {
  return (
    <div className="flex flex-col rounded-3xl border border-ink-200 bg-white p-8 shadow-card">
      <span
        className={cn(
          'inline-flex h-12 w-12 items-center justify-center rounded-2xl',
          tone === 'brand' ? 'bg-brand-50 text-brand-600' : 'bg-gold-50 text-gold-600',
        )}
      >
        {icon}
      </span>
      <h3 className="mt-5 text-xl font-bold text-ink-900">{title}</h3>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-extrabold tracking-tight text-ink-900">{price}</span>
        <span className="text-sm text-ink-500">{unit}</span>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-ink-600">{body}</p>
      <ul className="mt-5 flex-1 space-y-2.5">
        {points.map((point) => (
          <li key={point} className="flex gap-2.5 text-sm text-ink-700">
            <Check
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                tone === 'brand' ? 'text-brand-600' : 'text-gold-600',
              )}
            />
            {point}
          </li>
        ))}
      </ul>
      <div className="mt-7">{cta}</div>
    </div>
  )
}
