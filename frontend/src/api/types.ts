export type Role = 'client' | 'writer' | 'admin'

export type OrderStatus =
  | 'draft'
  | 'open_for_bids'
  | 'bid_accepted'
  | 'escrowed'
  | 'in_progress'
  | 'submitted'
  | 'in_revision'
  | 'completed'
  | 'disputed'
  | 'canceled'

export type OrderType = 'writing' | 'humanization'
export type WriterTier = 'new' | 'verified' | 'expert'
export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn'
export type KycStatus = 'not_submitted' | 'pending' | 'approved' | 'rejected'

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  display_name: string
  role: Role
  phone: string
  country: string
  avatar: string | null
  is_verified: boolean
  is_staff?: boolean
  kyc_status: KycStatus
  date_joined: string
}

export interface WriterProfile {
  id: number
  user: User
  headline: string
  bio: string
  skills: string[]
  subjects: string[]
  languages: string[]
  years_experience: number
  tier: WriterTier
  rating_avg: string
  rating_count: number
  completed_orders: number
  on_time_rate: string
  revision_rate: string
  dispute_count: number
  strikes: number
  is_suspended: boolean
  total_earned: string
  can_withdraw: boolean
}

export interface ClientProfile {
  id: number
  user: User
  company_name: string
  industry: string
  orders_posted_count: number
  orders_completed_count: number
  total_spent: string
  rating_avg: string
  rating_count: number
}

export interface CurrentUser extends User {
  writer_profile: WriterProfile | null
  client_profile: ClientProfile | null
  wallet_balance: string
  unread_notifications: number
}

export interface PublicWriter {
  id: number
  username: string
  display_name: string
  avatar: string | null
  country: string
  is_verified: boolean
  headline: string
  bio: string
  skills: string[]
  subjects: string[]
  languages: string[]
  years_experience: number
  tier: WriterTier
  rating_avg: string
  rating_count: number
  completed_orders: number
  on_time_rate: string
}

export interface Bid {
  id: number
  order: number
  writer: number
  writer_detail: PublicWriter | User
  amount: string
  delivery_time_hours: number
  message: string
  status: BidStatus
  is_boosted: boolean
  created_at: string
}

export interface Deliverable {
  id: number
  order: number
  writer: number
  writer_name: string
  file: string
  original_name: string
  note: string
  version_number: number
  submitted_at: string
  word_count: number | null
  plagiarism_score: string | null
  ai_content_score: string | null
  gptzero_report_url: string
  scan_status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  flagged: boolean
  flag_reason: string
}

export interface Attachment {
  id: number
  file: string
  original_name: string
  size_bytes: number
  created_at: string
}

export interface Review {
  id: number
  order: number
  order_title: string
  reviewer: number
  reviewer_name: string
  reviewer_avatar: string | null
  reviewee: number
  reviewee_name: string
  rating: number
  comment: string
  reply: string
  replied_at: string | null
  created_at: string
}

export interface Dispute {
  id: number
  order: number
  order_title: string
  raised_by: number
  raised_by_name: string
  reason: string
  evidence: string | null
  status: 'open' | 'under_review' | 'resolved'
  resolution: string
  writer_share_percent: number
  resolution_notes: string
  resolved_by: number | null
  resolved_at: string | null
  created_at: string
}

export interface Fine {
  id: number
  writer: number
  writer_name: string
  order: number | null
  order_title: string | null
  reason: 'late_delivery' | 'quality' | 'plagiarism' | 'contact_leak'
  amount: string
  client_refund_portion: string
  platform_portion: string
  days_late: number
  notes: string
  is_waived: boolean
  created_at: string
}

export interface Escrow {
  amount_held: string
  platform_fee: string
  fee_percent: string
  writer_payout: string
  amount_refunded: string
  status: 'pending' | 'held' | 'released' | 'partial_release' | 'refunded'
  released_at: string | null
}

export interface Quote {
  amount: string
  fee_percent: string
  platform_fee: string
  writer_receives: string
  currency: string
}

export interface OrderListItem {
  id: number
  title: string
  subject: string
  subject_display: string
  order_type: OrderType
  status: OrderStatus
  status_display: string
  deadline: string
  budget: string
  currency: string
  word_count: number | null
  pages: number | null
  client: number
  client_name: string
  writer: number | null
  writer_name: string | null
  bid_count: number
  is_overdue: boolean
  has_bid: boolean
  created_at: string
}

export interface Order extends Omit<OrderListItem, 'bid_count' | 'has_bid'> {
  description: string
  is_public: boolean
  client_detail: User
  writer_detail: User | null
  accepted_bid: number | null
  funded_at: string | null
  started_at: string | null
  submitted_at: string | null
  completed_at: string | null
  review_deadline: string | null
  revision_count: number
  was_late: boolean
  attachments: Attachment[]
  deliverables: Deliverable[]
  bids: Bid[]
  reviews: Review[]
  fines: Fine[]
  disputes: Dispute[]
  escrow: Escrow | null
  quote: Quote
}

export interface WalletTransaction {
  id: number
  type: string
  type_display: string
  direction: 'credit' | 'debit'
  amount: string
  balance_after: string
  reference: string
  description: string
  order: number | null
  order_title: string | null
  created_at: string
}

export interface Wallet {
  id: number
  balance: string
  pending_balance: string
  currency: string
  recent_transactions: WalletTransaction[]
}

export interface Withdrawal {
  id: number
  amount: string
  fee: string
  net_amount: string
  method: string
  destination: string
  status: 'pending' | 'processing' | 'paid' | 'rejected'
  reference: string
  notes: string
  created_at: string
  processed_at: string | null
}

export interface Message {
  id: number
  order: number | null
  sender: number
  sender_name: string
  sender_role: Role
  sender_avatar: string | null
  content: string
  attachment: string | null
  is_read: boolean
  is_system: boolean
  was_masked: boolean
  created_at: string
  warning?: string
}

export type LeakKind =
  | 'email'
  | 'email_obfuscated'
  | 'phone'
  | 'phone_spelled'
  | 'messaging_link'
  | 'social_handle'
  | 'payment_detail'
  | 'external_url'
  | 'circumvention'

export interface LeakScan {
  clean: boolean
  blocked: boolean
  severity: 'low' | 'medium' | 'high' | null
  kinds: LeakKind[]
  summary: string
  masked_text: string
  spans: { start: number; end: number; kind: LeakKind }[]
}

export interface ContactLeakFlag {
  id: number
  user: number
  user_name: string
  user_role: Role
  order: number | null
  order_title: string | null
  original_content: string
  masked_content: string
  detected_kinds: LeakKind[]
  detections: { kind: string; severity: string; start: number; end: number; text: string }[]
  severity: 'low' | 'medium' | 'high'
  action_taken: 'blocked' | 'masked' | 'flagged'
  strike_applied: boolean
  reviewed: boolean
  reviewed_by: number | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  review_notes: string
  is_false_positive: boolean
  created_at: string
}

export interface Notification {
  id: number
  kind: string
  title: string
  body: string
  link: string
  is_read: boolean
  created_at: string
}

export interface CheckReport {
  id: number
  check_request: number
  report_type: string
  report_type_display: string
  price: string
  file: string | null
  report_url: string
  score: string | null
  summary: string
  processed_by_name: string | null
  delivered_at: string | null
  created_at: string
}

export interface CheckRequest {
  id: number
  reference: string
  requested_by: number | null
  requester_display: string
  requester_email: string
  contact_name: string
  contact_email: string
  contact_phone: string
  document: string
  original_name: string
  word_count: number | null
  report_types: string[]
  notes: string
  status: 'pending' | 'processing' | 'processed' | 'delivered' | 'canceled'
  status_display: string
  payment_status: 'unpaid' | 'paid' | 'waived'
  total_price: string
  currency: string
  delivered_at: string | null
  admin_notes: string
  reports: CheckReport[]
  created_at: string
}

export interface ClientStats {
  role: 'client'
  wallet_balance: string
  active_orders: number
  needs_action: number
  open_for_bids: number
  total_bids_received: number
  completed_orders: number
  spent_this_month: string
}

export interface WriterStats {
  role: 'writer'
  wallet_balance: string
  active_jobs: number
  awaiting_review: number
  in_revision: number
  completed_orders: number
  open_orders_available: number
  pending_bids: number
  earnings_this_month: string
  tier: WriterTier
  rating_avg: string
  on_time_rate: string
  strikes: number
  is_suspended: boolean
}

export type DashboardStats = ClientStats | WriterStats | { role: 'admin'; detail: string }

export interface AdminStats {
  users: number
  writers: number
  clients: number
  orders_total: number
  orders_active: number
  open_disputes: number
  flagged_deliverables: number
  pending_kyc: number
  pending_check_requests: number
  open_contact_leaks: number
  escrow_held: string
  platform_revenue: string
  orders_by_status: { status: OrderStatus; count: number }[]
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Subscription {
  id: number
  plan: 'free' | 'pro'
  fee_rate_override: string | null
  monthly_price: string
  active: boolean
  renews_at: string | null
  effective_fee_percent: string
  standard_fee_percent?: number
  pro_fee_percent?: number
}

export interface HumanizationQuote {
  word_count: number
  pages: number
  price: string
  currency: string
  rate_per_page: number
  words_per_page: number
}
