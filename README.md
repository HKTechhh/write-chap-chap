# PenSpan

A freelance writing marketplace with escrow, quality enforcement, AI/plagiarism screening, and
an off-platform contact guard.

Built to the spec in [`PenSpan_Complete_Build_Plan.md`](./PenSpan_Complete_Build_Plan.md).

```
PenSpan/
├── backend/         Django 5 + DRF + Celery  (API, escrow, moderation, admin)
├── frontend/        Vite + React 18 + TypeScript + Tailwind  (client / writer / admin UI)
└── .venv/           Python virtualenv (already created)
```

---

## Quick start

### 1. Backend — already set up and running-ready

```bash
cd backend
../.venv/Scripts/python.exe manage.py runserver
```

API lives at `http://127.0.0.1:8000`. Interactive docs at `/api/docs/`, Django admin at `/admin/`.

Dependencies are installed, migrations are applied, and demo data is seeded. To reset:

```bash
../.venv/Scripts/python.exe manage.py migrate
../.venv/Scripts/python.exe manage.py seed_demo          # add --flush-demo to start clean
```

### 2. Frontend — also set up and running-ready

```bash
cd frontend
npm run dev
```

App at `http://localhost:5173`. Vite proxies `/api` and `/media` to the Django server, so both
must be running.

Node 24.19.0 LTS is installed at `%LOCALAPPDATA%\Programs\nodejs` (a portable build — no admin
rights were needed) and added to your user PATH. Dependencies are installed and the production
build passes. If `node` isn't found in a terminal you already had open, open a new one so it
picks up the updated PATH.

```bash
npm run build     # tsc -b && vite build  → dist/
npm run lint      # tsc --noEmit
```

---

## Demo accounts

Seeded by `manage.py seed_demo`. Password for all: **`Passw0rd!23`**

| Role | Username | What to look at |
|---|---|---|
| Admin | `admin` | Moderation queue, disputes, flagged work, check requests, payouts |
| Client | `j.smith` | Active orders, one order in review, wallet with balance |
| Client | `m.ochieng` | A second client with orders in other states |
| Writer | `amina.w` | Expert tier, completed order with reviews |
| Writer | `george.m` | New tier — shows the tier-progress path |

The seed creates 9 orders spread across the lifecycle (open for bids, funded, in review, in
revision, completed), with bids, order chat, and reviews attached.

---

## What's built

### Order lifecycle with real escrow
`draft → open_for_bids → bid_accepted → in_progress → submitted → completed`, plus
`in_revision`, `disputed` and `canceled`. Money moves client wallet → escrow → writer wallet,
never directly between people. Every transition is in `backend/apps/orders/services.py` so the
money rules live in one auditable place.

- **Fee transparency** — the split is computed and shown before either party confirms anything.
- **Auto-approval** — a submission releases automatically after the 72-hour review window, so a
  ghosting client can't trap a writer's payment.
- **Late fines** — 5% of order value per day, capped at 25%. Half refunds the client, half is
  platform revenue. Three late fines in 90 days adds a strike.
- **Disputes** — an admin resolves to full release, a partial split, or a full refund. Only
  *lost* disputes count toward strikes.

### Off-platform contact guard
`backend/apps/messaging/leak_detection.py` — the feature you asked for, built to block.

Scans every chat message before it's stored and catches:

| Detected | Examples |
|---|---|
| Emails | `me@gmail.com`, `me at gmail dot com`, `me[at]yahoo[dot]com` |
| Phone numbers | `0712345678`, `+254 712 345 678`, `0 7 1 2 3 4 5 6 7 8`, `+44 7911 123456` |
| Spelled-out digits | `zero seven one two three four five six seven eight` (English and Swahili) |
| Messaging links | `wa.me/…`, `t.me/…`, `chat.whatsapp.com/…` |
| Social handles | `my telegram is johndoe`, `@johndoewriter` |
| Payment details | `paybill 400200 account 12345` |
| Circumvention | "let's work directly", "avoid the fee", "contact me on whatsapp" |

**Policy: block + mask + flag.** High/medium severity hits reject the message with a 422, the
sender sees exactly what tripped it, a `ContactLeakFlag` lands in the admin moderation queue
with the *original* text preserved for arbitration, and repeat offences add strikes
(3 by default → a formal strike; 5 strikes → suspension).

The composer also runs a debounced live pre-check (`POST /api/messages/scan/`) so a writer sees
the warning and a masked preview *before* hitting send, rather than being punished by surprise.

Admins can mark a flag a false positive, which reverses the strike automatically.

The detector is deliberately conservative about false positives — word counts, prices, ISO
dates, order numbers and page references all stay clean. 19 tests in
`backend/apps/messaging/tests.py` cover both directions.

### AI / plagiarism screening
On upload, a Celery task sends the deliverable to GPTZero and stores `ai_content_score` and
`plagiarism_score` on the `Deliverable`. Scores above the configured thresholds (20% AI, 15%
plagiarism) flag the order, notify both parties, and feed the writer's strike count. Scores are
shown to the client openly rather than hidden behind a pass/fail badge.

Without a `GPTZERO_API_KEY` the scan records `skipped` and never blocks delivery.

### Humanization orders
Fixed-price, running through the normal bid/escrow pipeline. Upload a document, the server
parses `.docx`/`.pdf`/`.txt` and counts words, then locks the budget at **KES 50 per 250 words**
(rounded up). The API rejects any attempt to edit that budget, and bids are forced to the fixed
price server-side — writers compete on delivery time and reputation instead.

### Document Check service
Public "Check My Paper" form, **KES 120 flat per document**, routed only to the admin dashboard.
One document goes in and two documents come out: an **AI report** and a **plagiarism /
similarity report**. A single report cannot be ordered. The admin sees both as slots to fill, a
check can only be delivered once both are uploaded, and the requester sees neither (nor their
scores) until delivery.
Anonymous visitors can submit and track by reference. Writers have no access path to it at all
— verified by a test — because letting them pre-test drafts against the same detector would
defeat the screening.

### Payments
M-Pesa Daraja (STK push) and Flutterwave adapters with callback handlers. **Both fall back to
simulation mode when credentials are absent**, which is what makes the full lifecycle
demonstrable today — top-ups credit immediately so you can walk an order end to end without
live keys.

### M-Pesa B2C payouts
Withdrawals are debited from the wallet on request, then paid to the writer's M-Pesa through
Daraja B2C (`apps/payments/payouts.py`). `pending → processing → paid`, or `failed` with the
wallet refunded automatically when Safaricom reports a definite failure. Safaricom's result and
timeout callbacks use a secret URL token derived from `SECRET_KEY`.

- **Auto-pay:** with `MPESA_B2C_ENABLED=True`, withdrawals up to `MPESA_B2C_AUTO_LIMIT` go out
  immediately. Larger ones need an admin to press **Pay via M-Pesa**.
- **Uncertain outcomes are never refunded blindly.** A timeout or server error while submitting
  leaves the withdrawal `processing` and alerts admins; refunding a payment that did go through
  would pay the writer twice. Rejecting an in-flight payout requires explicit confirmation.
- **Needs from Safaricom:** a B2C shortcode, an initiator name and password, and the public
  certificate for your environment (set `MPESA_CERT_PATH`). The callback URLs must be public
  HTTPS, which `https://penspan.com/api/payments/mpesa/b2c/...` is.
- Without live credentials it simulates only when `DEBUG=True`; in production it refuses rather
  than pretending to pay.
- Not yet tested against Safaricom's sandbox. Do that before enabling it with real money.

### Trust & safety
KYC gate before payout, writer tiers (New → Verified → Expert) computed from completed orders,
rating and on-time rate, a strike system feeding suspension, and reviews locked to verified
completed orders so a fake reviewer can't exist.

---

## Frontend

Two lean role-specific nav sets, not one 20-item sidebar:

- **Client** — Dashboard · My Orders · Find Writers · Wallet · Reviews · Account
- **Writer** — Dashboard · Browse Orders · My Bids · My Jobs · Earnings · Reviews · Account
- **Admin** — Overview · Disputes · Moderation · Flagged work · Check requests · Users & KYC · Payouts

Shared component library, one type scale, one spacing system. Deep indigo brand throughout;
clients get a teal accent (calm — they're spending), writers get warm gold (energy — they're
earning). Status colour lives on badges only, never on card backgrounds. The Orders screen is a
single page with a filter/tab bar rather than fifteen sidebar links.

26 screens including a full marketing landing page, pricing, and the public Check My Paper flow.

---

## Configuration

Copy `backend/.env.example` to `backend/.env` (already done) and fill in what you need. Sensible
defaults are baked in — nothing below is required to run locally.

| Variable | Default | Purpose |
|---|---|---|
| `PLATFORM_FEE_PERCENT` | `12` | Standard service fee |
| `PLATFORM_FEE_PERCENT_PRO` | `5` | Writer Pro subscription rate |
| `LATE_FINE_PERCENT_PER_DAY` / `LATE_FINE_MAX_PERCENT` | `5` / `25` | Late-delivery fines |
| `REVISION_WINDOW_HOURS` | `72` | Auto-approve window |
| `HUMANIZATION_PRICE_PER_PAGE` / `_WORDS_PER_PAGE` | `50` / `250` | Humanization pricing |
| `DOCUMENT_CHECK_PRICE` | `120` | Per document (AI report + plagiarism/similarity report) |
| `AI_CONTENT_THRESHOLD` / `PLAGIARISM_THRESHOLD` | `20` / `15` | Screening flag thresholds |
| `CONTACT_LEAK_STRIKE_LIMIT` | `3` | Blocked attempts before a formal strike |
| `GPTZERO_API_KEY` | — | Enables real screening |
| `MPESA_*`, `FLUTTERWAVE_*` | — | Enables real payments |
| `MPESA_B2C_ENABLED` | `False` | Send small withdrawals to M-Pesa automatically |
| `MPESA_B2C_AUTO_LIMIT` | `20000` | Larger withdrawals wait for an admin to press "Pay via M-Pesa" |
| `MPESA_INITIATOR_NAME` / `MPESA_INITIATOR_PASSWORD` / `MPESA_CERT_PATH` | — | B2C initiator; or set `MPESA_SECURITY_CREDENTIAL` directly |
| `DATABASE_URL` | SQLite | Set a `postgres://…` URL for Postgres |

---

## Background jobs

Escrow auto-release, deadline fines and tier recalculation run on Celery beat. Not required for
development — the API works without them, you just won't get automatic fines or auto-approval.

```bash
cd backend
../.venv/Scripts/celery.exe -A config worker -l info --pool=solo   # Windows needs --pool=solo
../.venv/Scripts/celery.exe -A config beat -l info
```

Needs Redis on `localhost:6379`.

---

## Tests

```bash
cd backend
../.venv/Scripts/python.exe manage.py test apps
```

72 tests, all passing:

- **Contact-leak detection** (19) — every obfuscation form, plus false-positive guards
- **Escrow** — funding, release, partial release, refund, double-settle protection
- **Fines** — day scaling, the 25% cap, idempotency, deduction from payout
- **Humanization pricing** — page rounding at every boundary
- **API role boundaries** — writers can't post orders, clients can't bid on their own, a writer
  only ever sees their own bid on an order
- **Smoke test** — the full lifecycle over real HTTP: register → post → bid → accept → fund →
  chat (with a blocked leak) → deliver → approve → review → withdraw

---

## Deployment

Production runs on a DigitalOcean droplet. See [`deploy/README.md`](./deploy/README.md).

---

## Roadmap position

| Phase | Status |
|---|---|
| 0 — Document Check service | Done |
| 1 — Auth, roles, orders, bidding, escrow, wallet, dashboards | Done |
| 2 — M-Pesa + Flutterwave | STK push, B2C payouts, callbacks and simulation done; add live credentials and test in Daraja sandbox |
| 3 — GPTZero, fine automation, disputes, tiering | Done |
| 4 — Subscriptions, boosted bids, realtime chat, referrals | Subscriptions and boost field done; chat is polling, WebSockets not wired |

Known gaps, stated plainly:

- **Chat is polling** (20s), not WebSockets. Fine for MVP volume; Django Channels is the upgrade.
- **No frontend unit tests.** Type-checking and the production build both pass, and the backend
  is covered by 47 tests, but the React components themselves have no test suite.
