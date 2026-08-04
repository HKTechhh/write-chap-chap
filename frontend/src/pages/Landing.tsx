import type * as React from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BadgeCheck,
  Clock,
  FileSearch,
  Gavel,
  Lock,
  PenLine,
  Scale,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export default function Landing() {
  return (
    <MarketingLayout>
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <TwoSides />
      <Screening />
      <TrustSafety />
      <Faq />
      <FinalCta />
    </MarketingLayout>
  )
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="relative overflow-hidden bg-ink-950">
      <div className="absolute inset-0 bg-mesh-brand" aria-hidden />
      <div
        className="absolute inset-0 bg-grid-faint [background-size:56px_56px]"
        aria-hidden
      />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white to-transparent" aria-hidden />

      <div className="container-page relative py-20 sm:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white/90 backdrop-blur animate-fade-in">
            <Sparkles className="h-3.5 w-3.5 text-gold-300" />
            Escrow-protected · AI &amp; plagiarism screened · Deadline enforced
          </span>

          <h1 className="mt-7 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl animate-fade-up">
            Great writing,{' '}
            <span className="bg-gradient-to-r from-gold-300 via-gold-400 to-teal-300 bg-clip-text text-transparent">
              chap chap
            </span>
            .
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-ink-300 animate-fade-up">
            Post a task, get bids from vetted writers, and keep your money in escrow until the
            work is approved. Every delivery is screened for AI content and plagiarism before
            it reaches you.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row animate-fade-up">
            <Link to="/register?role=client" className="w-full sm:w-auto">
              <Button size="lg" iconRight={<ArrowRight className="h-4 w-4" />} fullWidth>
                Hire a writer
              </Button>
            </Link>
            <Link to="/register?role=writer" className="w-full sm:w-auto">
              <Button
                size="lg"
                variant="accent"
                iconRight={<ArrowRight className="h-4 w-4" />}
                fullWidth
              >
                Become a writer
              </Button>
            </Link>
          </div>

          <p className="mt-5 text-sm text-ink-400">
            Free to join · No card needed to browse ·{' '}
            <Link to="/check-my-paper" className="font-medium text-teal-300 hover:text-teal-200">
              Just need a document checked?
            </Link>
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
          <HeroStat icon={<Lock className="h-5 w-5" />} title="Money in escrow" body="Released only when you approve the work — or automatically if you go quiet." />
          <HeroStat icon={<ScanSearch className="h-5 w-5" />} title="Screened on delivery" body="AI-content and plagiarism scores attached to every submission." />
          <HeroStat icon={<Clock className="h-5 w-5" />} title="Deadlines with teeth" body="Late delivery triggers automatic fines, half of which come back to you." />
        </div>
      </div>
    </section>
  )
}

function HeroStat({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-teal-500 text-white">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-400">{body}</p>
    </div>
  )
}

/* ----------------------------------------------------------- trust strip */

function TrustStrip() {
  const items = [
    { icon: <ShieldCheck className="h-4 w-4" />, label: 'Escrow on every order' },
    { icon: <BadgeCheck className="h-4 w-4" />, label: 'KYC-verified writers' },
    { icon: <Scale className="h-4 w-4" />, label: 'Transparent fees, shown upfront' },
    { icon: <Gavel className="h-4 w-4" />, label: 'Human dispute arbitration' },
  ]
  return (
    <section className="border-b border-ink-200 bg-white">
      <div className="container-page py-6">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {items.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-2 text-sm font-medium text-ink-500"
            >
              <span className="text-brand-500">{item.icon}</span>
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

/* --------------------------------------------------------- how it works */

const STEPS = [
  {
    n: '01',
    title: 'Post your task',
    body: 'Title, brief, subject, deadline and budget. Attach the marking rubric or source files if you have them.',
    tone: 'brand',
  },
  {
    n: '02',
    title: 'Compare real bids',
    body: 'Writers bid with a price and a delivery time. You see their rating, tier, on-time rate and completed orders before choosing.',
    tone: 'teal',
  },
  {
    n: '03',
    title: 'Fund escrow',
    body: 'Money moves into escrow, not to the writer. The fee split is shown in full before you confirm anything.',
    tone: 'violet',
  },
  {
    n: '04',
    title: 'Review and release',
    body: 'Approve, request a revision, or raise a dispute. Escrow releases on approval — and auto-releases if nobody responds.',
    tone: 'gold',
  },
] as const

const STEP_TONES = {
  brand: 'from-brand-500 to-brand-600',
  teal: 'from-teal-500 to-teal-600',
  violet: 'from-violet-500 to-violet-600',
  gold: 'from-gold-400 to-gold-500',
}

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 bg-ink-50 py-20 sm:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="How it works"
          title="Four steps, no surprises"
          body="The same flow whether you're spending or earning — just different buttons."
        />

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <div key={step.n} className="relative">
              {index < STEPS.length - 1 && (
                <div className="absolute left-full top-8 hidden h-px w-6 bg-ink-300 lg:block" aria-hidden />
              )}
              <div className="card card-hover h-full p-6">
                <span
                  className={cn(
                    'inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white',
                    STEP_TONES[step.tone],
                  )}
                >
                  {step.n}
                </span>
                <h3 className="mt-5 text-base font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- two sides */

function TwoSides() {
  return (
    <section className="bg-white py-20 sm:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="Built for both sides"
          title="One platform, two very different jobs"
          body="Clients are spending money and need certainty. Writers are earning it and need a fair shot. Same product, tailored experience."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {/* Client */}
          <div className="overflow-hidden rounded-3xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-teal-50">
            <div className="p-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
                <Wallet className="h-3.5 w-3.5" />
                For clients
              </span>
              <h3 className="mt-5 text-2xl font-bold text-ink-900">
                Never pay for work you haven't seen
              </h3>
              <ul className="mt-6 space-y-3.5">
                {[
                  'Your money sits in escrow until you approve the delivery.',
                  'Every submission arrives with an AI-content and plagiarism score attached.',
                  'Late writers are fined automatically — half of that fine comes back to you.',
                  'Unhappy? Raise a dispute and a human reviews the full order history.',
                  'Reviews come only from real, paid orders, so ratings can’t be faked.',
                ].map((line) => (
                  <FeatureLine key={line} tone="brand">
                    {line}
                  </FeatureLine>
                ))}
              </ul>
              <Link to="/register?role=client" className="mt-8 inline-block">
                <Button iconRight={<ArrowRight className="h-4 w-4" />}>Post your first order</Button>
              </Link>
            </div>
          </div>

          {/* Writer */}
          <div className="overflow-hidden rounded-3xl border border-gold-200 bg-gradient-to-br from-gold-50 via-white to-orange-50">
            <div className="p-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
                <PenLine className="h-3.5 w-3.5" />
                For writers
              </span>
              <h3 className="mt-5 text-2xl font-bold text-ink-900">
                Good work gets rewarded, properly
              </h3>
              <ul className="mt-6 space-y-3.5">
                {[
                  'The client funds escrow before you write a word — no chasing payment.',
                  'A ghosting client can’t trap your money: submissions auto-approve after the review window.',
                  'Climb New → Verified → Expert on rating, volume and on-time delivery.',
                  'Go Pro to cut your platform fee from 12% to 5%.',
                  'Unreliable writers get flagged and pushed out, so your rating actually means something.',
                ].map((line) => (
                  <FeatureLine key={line} tone="gold">
                    {line}
                  </FeatureLine>
                ))}
              </ul>
              <Link to="/register?role=writer" className="mt-8 inline-block">
                <Button variant="accent" iconRight={<ArrowRight className="h-4 w-4" />}>
                  Start earning
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeatureLine({ children, tone }: { children: React.ReactNode; tone: 'brand' | 'gold' }) {
  return (
    <li className="flex gap-3">
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
          tone === 'brand' ? 'bg-brand-600' : 'bg-gold-500',
        )}
      >
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" aria-hidden>
          <path
            d="M2.5 6.2l2.3 2.3 4.7-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-sm leading-relaxed text-ink-700">{children}</span>
    </li>
  )
}

/* ------------------------------------------------------------- screening */

function Screening() {
  return (
    <section className="bg-ink-950 py-20 sm:py-24">
      <div className="container-page">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-teal-300">
              <ScanSearch className="h-3.5 w-3.5" />
              Quality screening
            </span>
            <h2 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Every delivery gets scanned before you see it
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-ink-400">
              The moment a writer submits, the document goes through AI-content and plagiarism
              detection. You see the scores — we don't hide them behind a pass/fail badge.
              Repeated flags feed a writer's strike count and eventually push them off the
              platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/check-my-paper">
                <Button variant="accent" icon={<FileSearch className="h-4 w-4" />}>
                  Check a document — KES 150
                </Button>
              </Link>
              <Link to="/pricing">
                <Button variant="secondary">See all pricing</Button>
              </Link>
            </div>
          </div>

          {/* Illustrative report panel */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Screening report</p>
                <p className="text-xs text-ink-500">Attached to every submission</p>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                Passed
              </span>
            </div>

            <div className="mt-6 space-y-5">
              <ScoreBar label="AI-generated content" value={6} threshold={20} />
              <ScoreBar label="Plagiarism / similarity" value={3} threshold={15} />
            </div>

            <div className="mt-6 rounded-xl bg-white/[0.04] p-4 text-xs leading-relaxed text-ink-400">
              Scores above the threshold flag the order for review, notify both parties, and
              count toward the writer's strike record. Thresholds are configurable per platform.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ScoreBar({ label, value, threshold }: { label: string; value: number; threshold: number }) {
  const safe = value <= threshold
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-ink-300">{label}</span>
        <span className={cn('text-sm font-bold', safe ? 'text-emerald-400' : 'text-red-400')}>
          {value}%
        </span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            'h-full rounded-full',
            safe ? 'bg-gradient-to-r from-emerald-400 to-teal-400' : 'bg-red-500',
          )}
          style={{ width: `${Math.max(value, 3)}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-gold-400"
          style={{ left: `${threshold}%` }}
          title={`Flag threshold: ${threshold}%`}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-ink-500">Flag threshold {threshold}%</p>
    </div>
  )
}

/* ---------------------------------------------------------- trust/safety */

const TRUST = [
  {
    icon: <Lock className="h-5 w-5" />,
    title: 'Escrow, not trust',
    body: 'Funds are held by the platform and released on approval, partial release, or refund — never sent directly writer-to-client.',
  },
  {
    icon: <BadgeCheck className="h-5 w-5" />,
    title: 'KYC before payout',
    body: 'Writers verify their identity and phone number before any money can leave the platform.',
  },
  {
    icon: <TrendingUp className="h-5 w-5" />,
    title: 'Tiers that mean something',
    body: 'New → Verified → Expert is earned on completed orders, rating and on-time rate. Strikes pull a writer straight back down.',
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: 'Off-platform contact blocked',
    body: 'Chat is scanned for phone numbers, emails and handles. Taking a deal off-platform strips both sides of escrow protection, so we stop it at the door.',
  },
  {
    icon: <Gavel className="h-5 w-5" />,
    title: 'Disputes go to a human',
    body: 'An admin reviews the brief, the deliverable, the chat and the timeline before deciding a full release, partial split, or refund.',
  },
  {
    icon: <Scale className="h-5 w-5" />,
    title: 'Fines split fairly',
    body: 'Late-delivery fines are 5% per day capped at 25% — half refunds the client, half is platform revenue. No hidden penalties.',
  },
]

function TrustSafety() {
  return (
    <section id="trust" className="scroll-mt-20 bg-ink-50 py-20 sm:py-24">
      <div className="container-page">
        <SectionHeading
          eyebrow="Trust &amp; safety"
          title="The rules are the product"
          body="Anyone can build a bid board. The hard part is making both sides confident enough to transact."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.map((item) => (
            <div key={item.title} className="card card-hover p-6">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                {item.icon}
              </span>
              <h3 className="mt-4 text-base font-semibold text-ink-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- faq */

const FAQ = [
  {
    q: 'When does the writer actually get paid?',
    a: 'When you approve the delivery, or automatically if you don’t respond within the review window (72 hours by default). The auto-approval exists so writers aren’t held hostage by a client who disappears.',
  },
  {
    q: 'What if the work is poor quality?',
    a: 'Request a revision first — that’s free and sends it straight back to the writer. If that doesn’t resolve it, raise a dispute. An admin reads the brief, the deliverable and the whole chat before deciding on a full release, a partial split, or a full refund.',
  },
  {
    q: 'How does humanization pricing work?',
    a: 'Upload the document and the system counts the words automatically. Price is KES 50 per 250 words, rounded up to the next page. That price is locked — writers bid on delivery time and reputation, not on price.',
  },
  {
    q: 'What does the platform charge?',
    a: 'A 12% service fee is deducted from the writer’s payout on release. Writers on the Pro plan pay 5% instead. Clients pay the order amount and nothing more.',
  },
  {
    q: 'Why can’t I share my phone number in chat?',
    a: 'Because escrow only protects you while the work and the money stay on the platform. Off-platform deals have no dispute process, no refund path, and no recourse if either side walks away. Contact details are blocked in chat and repeat attempts count as strikes.',
  },
  {
    q: 'Can writers check their own work before submitting?',
    a: 'No — deliberately. The Check My Paper service is admin-run and never exposed to writers, because letting them pre-test drafts against the same detector would let them optimise around it.',
  },
]

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="container-page max-w-3xl">
        <SectionHeading eyebrow="FAQ" title="Straight answers" />
        <div className="mt-12 divide-y divide-ink-200 border-y border-ink-200">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <span className="text-base font-semibold text-ink-900">{item.q}</span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500 transition-transform group-open:rotate-45">
                  <svg viewBox="0 0 14 14" className="h-3.5 w-3.5" fill="none" aria-hidden>
                    <path
                      d="M7 2v10M2 7h10"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 pr-11 text-sm leading-relaxed text-ink-600">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------- final cta */

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-teal-600 py-20">
      <div className="absolute inset-0 bg-grid-faint [background-size:48px_48px] opacity-40" aria-hidden />
      <div className="container-page relative text-center">
        <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Pick your side and get going
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-balance text-lg text-white/80">
          Free to join. You only pay when work actually changes hands.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/register?role=client" className="w-full sm:w-auto">
            <Button
              size="lg"
              variant="secondary"
              iconRight={<ArrowRight className="h-4 w-4" />}
              fullWidth
            >
              Hire a writer
            </Button>
          </Link>
          <Link to="/register?role=writer" className="w-full sm:w-auto">
            <Button
              size="lg"
              variant="accent"
              iconRight={<ArrowRight className="h-4 w-4" />}
              fullWidth
            >
              Become a writer
            </Button>
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- shared bit */

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string
  title: string
  body?: string
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-bold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-bold tracking-tight text-ink-900 sm:text-4xl">
        {title}
      </h2>
      {body && <p className="mt-4 text-balance text-lg leading-relaxed text-ink-600">{body}</p>}
    </div>
  )
}
