# Write Chap Chap — Complete Build Plan
### A freelance writing marketplace with escrow, quality enforcement, and AI/plagiarism screening

---

## 1. Vision & Value Proposition

**For clients:** Post a task, get bids from vetted writers, never miss a deadline — money stays in escrow until the work is approved, and late or poor-quality delivery has real consequences for the writer.

**For writers:** A fair shot at consistent income. Good, reliable writers get more visibility and lower fees; unreliable ones get flagged and eventually pushed out — protecting the writers who do good work from being lumped in with the ones who don't.

**Core differentiator vs. the reference site:** same escrow trust model, radically simpler navigation, built-in AI-content/plagiarism screening on every delivery, and a fairer, more transparent fine/dispute system.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend | Django + Django REST Framework | You already know Django; DRF gives clean REST APIs for the React frontend |
| Frontend | React + TypeScript + Tailwind | Matches your existing stack and skillset |
| Database | PostgreSQL | Relational integrity matters a lot here (money, orders, disputes) |
| Async tasks | Celery + Redis | For scheduled jobs: deadline checks, auto-fines, GPTZero scans, payout batching |
| File storage | S3-compatible (e.g. Cloudflare R2 or AWS S3) | Writer-submitted documents, revisions |
| Auth | Django + JWT (SimpleJWT) | Standard, works cleanly with React |
| Payments | M-Pesa Daraja API (Kenya) + Flutterwave (cards/global) | Matches your earlier stack decision |
| Plagiarism/AI detection | GPTZero API | Your existing choice |
| Realtime chat | Django Channels (WebSockets) or a simple polling fallback for MVP | Order messaging, support chat |
| Notifications | Email (SendGrid/Postmark) + WhatsApp click-to-chat + in-app | |
| Hosting | Backend: Render/Railway/DigitalOcean; Frontend: Vercel/Netlify | Cheap to start, scales fine |

---

## 3. Database Models (Django)

**User** (base, `AbstractUser`)
- role: `client` / `writer` / `admin`
- phone, country, is_verified, kyc_status

**WriterProfile**
- user (FK), bio, skills[], subjects[], tier (`new` / `verified` / `expert`), rating_avg, on_time_rate, revision_rate, dispute_count, strikes, is_suspended

**ClientProfile**
- user (FK), company_name (optional), orders_posted_count

**Order**
- client (FK), title, description, subject/category, deadline, budget, status
  - status choices: `draft`, `open_for_bids`, `bid_accepted`, `escrowed`, `in_progress`, `submitted`, `in_revision`, `completed`, `disputed`, `canceled`
  - order_type: `writing` / `humanization` — for `humanization`, `word_count` is captured on upload and `budget` auto-calculates (see 4.6) and is locked from manual editing
- attachments (FK to File model), created_at, is_public, word_count (nullable, used for humanization pricing)

**Bid**
- order (FK), writer (FK), amount, delivery_time_estimate, message, status (`pending`/`accepted`/`rejected`)
  - for `humanization` orders, amount is auto-locked to the order's fixed budget — writers bid to claim the job (backed by delivery time/profile), not on price

**EscrowTransaction**
- order (FK, one-to-one), amount_held, platform_fee, status (`held`/`released`/`refunded`/`partial_release`), released_at

**Wallet**
- user (FK, one-to-one), balance, currency

**WalletTransaction**
- wallet (FK), type (`topup`/`payout`/`fine`/`refund`/`withdrawal`), amount, reference, created_at

**Deliverable**
- order (FK), writer (FK), file, version_number, submitted_at
- plagiarism_score, ai_content_score, gptzero_report_url, flagged (bool)

**Review**
- order (FK), reviewer (FK), reviewee (FK), rating (1-5), comment

**Dispute**
- order (FK), raised_by (FK), reason, status (`open`/`under_review`/`resolved`), resolution_notes, resolved_by (admin FK)

**Fine**
- writer (FK), order (FK), reason (`late_delivery`/`quality`/`plagiarism`), amount, client_refund_portion, platform_portion, created_at

**Subscription**
- writer (FK), plan (`free`/`pro`), fee_rate_override, active, renews_at

**Message**
- order (FK, nullable for support chat), sender (FK), content, attachment (nullable), created_at

**CheckRequest**
- requested_by (FK), document (file), report_types requested (`ai_content`/`plagiarism`/`turnitin`/`similarity_links`), status (`pending`/`processed`/`delivered`), total_price, created_at
- Admin-only tool — no writer-facing access point exists to trigger or view this

**CheckReport**
- check_request (FK), report_type, price (KES 150 flat per report), file/report_url, processed_by (admin FK), delivered_at

---

## 4. Core Flows

### 4.1 Order lifecycle (escrow)
1. Client posts order → status `open_for_bids` (or saved as `draft` first)
2. Writers submit bids
3. Client accepts a bid → client funds the order (M-Pesa/Flutterwave) → status `escrowed`
4. Writer starts work → status `in_progress`
5. Writer uploads deliverable → **auto GPTZero scan runs** → status `submitted`
6. Client reviews within a revision window (e.g. 48–72h)
   - Approves → escrow releases to writer wallet (minus platform fee) → status `completed`
   - Requests revision → status `in_revision`, writer resubmits (back to step 5)
   - No response within window → auto-approve (protects writers from ghosting clients)
7. Either party can raise a **Dispute** at any point after submission → admin arbitrates → partial or full refund/release decided manually

### 4.2 Late delivery / fines
- Celery job checks deadlines hourly
- Order passes deadline while still `in_progress` → auto-fine kicks in: e.g. 5% of order value deducted per day late, capped at 25%
- Fine amount: 50% refunded to client's wallet, 50% retained as platform revenue
- 3 late fines within a rolling 90 days → writer tier downgraded, reduced bid visibility

### 4.3 Quality disputes
- Client flags "poor quality" → does **not** auto-fine (avoids abuse) → opens a Dispute
- Admin reviews order history, deliverable, and messages → decides: full release, partial release + fine, or full refund
- Writer's `dispute_count` increments regardless of outcome direction, but only *lost* disputes count toward strikes

### 4.4 AI content / plagiarism screening (GPTZero)
1. On deliverable upload → Celery task sends file/text to GPTZero API
2. Store `plagiarism_score`, `ai_content_score` on the Deliverable
3. If either score crosses a configurable threshold (e.g. AI% > 20, plagiarism% > 15):
   - Order auto-flags, held from client view until reviewed OR shown to client with a visible warning badge (your call — I'd default to showing the client the score transparently rather than hiding it, builds trust)
   - Feeds into writer's strike count if it happens repeatedly
4. Cost pass-through: absorb into your platform fee, or add a small fixed scan fee (e.g. KES 30–50) per submission — cheaper than it sounds relative to GPTZero's per-scan pricing, worth confirming current rates on their pricing page before finalizing

### 4.5 Document Check Service (admin-only, standalone revenue stream)
Deliberately kept out of writers' hands — letting writers self-check drafts against the same detector before submitting would let them optimize around it, undermining the whole point of screening.

1. Anyone (client or even a non-marketplace visitor) uploads a document via a public "Check My Paper" request form
2. Request lands only in your Admin dashboard — writers never see this tool
3. You run the check(s) yourself (GPTZero, Turnitin, or a similarity/copy-link report) and upload the resulting report(s) to the request
4. Requester is notified and can view/download the delivered report(s)
5. Pricing: **KES 150 flat per report**, regardless of order/document size — two report types on one document = KES 300 total

The Document Check service doesn't depend on the full marketplace/escrow system — it could realistically launch early as a standalone revenue stream and lead-gen tool, even before bidding/escrow is fully built. Humanization orders, by contrast, need the order/bid/escrow pipeline working first since they run through it.

### 4.6 AI Humanization / Rewriting Service
Open to everyone, self-serve — and unlike the Check service, this one runs through the **normal order + bidding + escrow pipeline**, just with a fixed, non-negotiable price instead of an open budget.

1. Client uploads a document via "Post Order" with type set to **Humanization**
2. On upload, the system automatically extracts and counts the words in the document (parsing .docx/.pdf server-side) — no manual entry needed
3. Price auto-calculates: **KES 50 per 250 words**, partial pages rounded up — this becomes the order's locked budget (client can't edit it manually)
4. Order enters the normal bid feed (`open_for_bids`) — writers see it like any other order and bid to claim it, but since price is fixed, a "bid" here is really a request to take the job at the set price, differentiated by delivery time offered and writer profile/rating
5. Client accepts a bid (or, if you'd rather remove the selection step entirely, this could auto-assign to the first qualified bidder — worth deciding once you see real writer volume) → funds escrow → same lifecycle as any other order from here (in_progress → submitted → approved/revision → completed)
6. Standard platform fee still applies on release, same as regular writing orders — the KES 50/page is what the client pays; the writer receives it minus your normal platform cut

This means humanization orders share every other feature "for free" — dispute handling, late-delivery fines, writer strikes, GPTZero re-check on the output if you want one.

### 4.7 Reviews & Comments
1. After an order is marked `completed`, both client and writer can leave a rating (1-5) and comment on each other — same pattern as Upwork/Fiverr
2. Reviews are **locked to verified completed orders only** — no review can be posted by an account that didn't actually transact, which is also your best long-term defense against the fake-review problem: nobody can fabricate a "customer" because the review system itself requires a real, paid order behind it
3. Writer public profiles display: average rating, review count, and recent comments — feeds directly into the tier system (New/Verified/Expert)
4. Optional: allow a short reply from the reviewee (writer can respond to a client review, and vice versa) — keeps the record fair without letting either side edit or delete an honest review

---

## 5. API Endpoints (high level)

```
/api/auth/register, /login, /refresh
/api/orders/  (GET list, POST create)
/api/orders/{id}/  (GET, PATCH)
/api/orders/{id}/bids/  (GET, POST)
/api/bids/{id}/accept/
/api/orders/{id}/fund/          → triggers M-Pesa/Flutterwave payment
/api/orders/{id}/deliverables/  (POST upload → triggers GPTZero scan)
/api/orders/{id}/approve/
/api/orders/{id}/request-revision/
/api/orders/{id}/dispute/
/api/wallet/  (GET balance, transactions)
/api/wallet/withdraw/           → M-Pesa payout
/api/reviews/
/api/writers/  (GET public writer list, filters by tier/subject/rating)
/api/messages/{order_id}/
/api/admin/disputes/
/api/admin/fines/
/api/admin/check-requests/      → admin-only: view, process, upload report(s), mark delivered
/api/check-requests/            → POST (submit a document for checking)
/api/orders/?type=humanization  → humanization jobs use the same orders endpoint, with word_count auto-parsed on upload and budget locked/auto-calculated server-side
```

---

## 6. Frontend — Simplified Navigation

Replacing the 20-item sidebar from the reference site with two lean, role-specific nav sets instead of one generic one:

**Client (Employer) nav:**
```
Dashboard · My Orders · Find Writers · Wallet · Reviews · Account
```

**Writer nav:**
```
Dashboard · Browse Orders · My Bids · Earnings · Reviews · Account
```

Same underlying component library and page patterns for both (so it's one codebase to maintain), but each role only sees the actions relevant to them — a writer never sees "Post Order," a client never sees "Browse Orders."

**Orders page** = one screen with a filter/tab bar (All, Active, In Review, Completed, Disputed) instead of 15 separate sidebar links.

**Key screens:**
1. Landing page — two clear paths right in the hero: **"Hire a Writer"** and **"Become a Writer"**, each leading to a role-specific signup rather than one generic form
2. Sign up / role selection (Client or Writer) — role is locked in from this point and determines everything downstream: nav, dashboard, theming
3. **Client Dashboard** — Active Orders, Orders Needing Your Action, Wallet Balance, Total Spent this month; primary action is always "Post a New Order"
4. **Writer Dashboard** — Active Jobs, New Orders Available to Bid, Earnings This Month, Wallet Balance, Tier Progress (New → Verified → Expert); primary action is always "Browse Orders"
5. Client: Post Order form (title, description, subject, deadline, budget, attachments) — with a **Humanization** toggle that switches it to auto-priced (word count → fixed budget, locked) instead of open budget
6. Writer: Browse Orders (filterable feed) + Bid modal
7. Order Detail (single source of truth: status timeline, chat, files, escrow status, GPTZero report if applicable) — same layout for both roles, just different action buttons available (client sees Approve/Request Revision, writer sees Submit Deliverable)
8. Wallet (balance, top-up via M-Pesa/Flutterwave, withdrawal, transaction history)
9. Writer Profile (public — rating, tier badge, completed orders, subjects)
10. Reviews (verified, order-linked ratings and comments on writer/client profiles)
11. Admin Dashboard (disputes queue, fines log, flagged deliverables, user verification, **document check requests**)
12. Check My Paper (public-facing request form, routed to Admin — usable even by non-marketplace visitors as a lead-gen and revenue tool)

---

## 7. UI/UX Design System

- **Shared foundation:** one component library, one typography scale, one spacing system — this is what keeps both role experiences feeling like the same professional product rather than two disconnected apps
- **Brand color:** deep teal or indigo as the primary shared color (professional, trustworthy — avoid generic blue-admin-panel look)
- **Role-based accent, not a redesign:** client dashboard uses the primary teal/indigo as its accent (calm, trust-building — appropriate for someone spending money); writer dashboard uses a warm gold/amber accent (energy, opportunity — appropriate for someone earning, and ties nicely into the "chap chap" speed branding). Same cards, same nav pattern, same fonts — only the accent color and dashboard content change, which is enough to make each feel tailored without fragmenting the design system
- **Status colors** used only on badges/pills, not backgrounds: green = paid/completed, amber = in progress, red = disputed/flagged, purple = escrowed
- **Typography:** one clean sans-serif (e.g. Inter or Manrope), generous line height, no more than 2 font weights per screen
- **Layout:** generous white space, cards with soft shadows instead of dense tables where possible, one primary action per screen clearly emphasized
- **Dashboard:** 4-6 meaningful stat cards max per role (see role-specific lists in Section 6) — not 15 redundant progress bars
- **WhatsApp support:** floating button using a `wa.me` click-to-chat link, styled in brand color rather than default WhatsApp green, bottom-right corner



---

## 8. Monetization Plan

| Stream | Mechanism | Notes |
|---|---|---|
| **Platform service fee** (primary) | % cut per order, deducted from writer payout at release | Start around 10-15%, adjust based on market |
| **Subscription tier for writers** | Lower fee rate (e.g. 5%) for a monthly subscription fee | Mirrors the reference site's model — proven to work |
| **Withdrawal fee** | Small flat fee on M-Pesa/bank payouts | Covers your own transaction costs + margin |
| **Featured/boosted bids** | Writers pay to appear higher in bid lists or "available writers" | Optional add-on revenue |
| **Fines** | Late delivery / quality failures | Split: 50% refunded to client, 50% platform revenue |
| **GPTZero scan fee** | Small per-submission charge, or absorbed into service fee | Confirm current GPTZero pricing before deciding which |
| **Document Check service** | KES 150 flat per report (AI-content, plagiarism, Turnitin, similarity/links) | Admin-only — you run and deliver these personally, high margin (your time + one API call vs. flat fee) |
| **AI Humanization service** | KES 50 per page (250 words = 1 page, rounded up), fixed price — flows through normal bidding/escrow, standard platform fee still applies on release | Self-serve for everyone; scales with writer capacity instead of your own time |

---

## 9. Trust & Safety

- KYC for writers before payout eligibility (ID upload, phone verification)
- Writer tiers: New → Verified → Expert, based on completed orders + rating + on-time rate
- Strike system: repeated late fines, lost disputes, or flagged plagiarism → reduced visibility → suspension
- Transparent fee display before both client and writer confirm any action

---

## 10. Phased Build Roadmap

**Phase 0 — Quick-launch revenue (optional, can run in parallel or first)**
- Document Check service only, with a simple landing page and admin dashboard — generates revenue and validates demand before the full marketplace is built. (Humanization now runs through the marketplace itself, so it lands in Phase 1 below, not here.)

**Phase 1 — MVP core**
- Auth, roles, order posting (including the Humanization order type with auto-priced budget), bidding, basic escrow (manual release toggle for admin if payment API isn't ready yet), wallet balance display, basic dashboard, WhatsApp button

**Phase 2 — Payments live**
- M-Pesa Daraja integration (STK push for funding, B2C for payouts), Flutterwave for card payments, automatic escrow release/refund logic

**Phase 3 — Quality & trust systems**
- GPTZero integration on deliverable upload, fine automation via Celery, dispute admin panel, writer tiering logic

**Phase 4 — Growth features**
- Subscriptions, boosted visibility, real-time chat (Channels), analytics dashboard, referral system

---

## Next steps
Once you're happy with this plan, the natural next move is either the Django model code + migrations, or clickable wireframes for the key screens above — your call whenever you're ready to build.
