import { api } from './client'
import type {
  AdminStats,
  Bid,
  CheckRequest,
  ContactLeakFlag,
  CurrentUser,
  DashboardStats,
  Deliverable,
  Dispute,
  Fine,
  HumanizationQuote,
  LeakScan,
  Message,
  Notification,
  Order,
  OrderListItem,
  Paginated,
  PublicWriter,
  Review,
  Subscription,
  Wallet,
  WalletTransaction,
  Withdrawal,
  WriterProfile,
} from './types'

const qs = (params: Record<string, any> = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.append(key, String(value))
  })
  const s = search.toString()
  return s ? `?${s}` : ''
}

export const auth = {
  login: (username: string, password: string) =>
    api.post<{ access: string; refresh: string; user: CurrentUser }>('/api/auth/login/', {
      username,
      password,
    }),
  register: (payload: Record<string, any>) =>
    api.post<{ access: string; refresh: string; user: CurrentUser }>('/api/auth/register/', payload),
  me: () => api.get<CurrentUser>('/api/auth/me/'),
  updateMe: (payload: Record<string, any>) => api.patch('/api/auth/me/', payload),
  changePassword: (old_password: string, new_password: string) =>
    api.post('/api/auth/change-password/', { old_password, new_password }),
}

export const orders = {
  list: (params?: Record<string, any>) =>
    api.get<Paginated<OrderListItem>>(`/api/orders/${qs(params)}`),
  get: (id: number | string) => api.get<Order>(`/api/orders/${id}/`),
  create: (form: FormData) => api.upload<Order>('/api/orders/', form),
  update: (id: number, payload: Record<string, any>) => api.patch(`/api/orders/${id}/`, payload),
  remove: (id: number) => api.del(`/api/orders/${id}/`),
  publish: (id: number) => api.post<Order>(`/api/orders/${id}/publish/`),
  fund: (id: number) => api.post<Order>(`/api/orders/${id}/fund/`),
  approve: (id: number) => api.post<Order>(`/api/orders/${id}/approve/`),
  requestRevision: (id: number, note: string) =>
    api.post<Order>(`/api/orders/${id}/request-revision/`, { note }),
  cancel: (id: number) => api.post<Order>(`/api/orders/${id}/cancel/`),
  dispute: (id: number, reason: string) => api.post<Dispute>(`/api/orders/${id}/dispute/`, { reason }),
  bids: (id: number | string) => api.get<Bid[]>(`/api/orders/${id}/bids/`),
  placeBid: (id: number, payload: { amount: string; delivery_time_hours: number; message: string }) =>
    api.post<Bid>(`/api/orders/${id}/bids/`, payload),
  submitDeliverable: (id: number, form: FormData) =>
    api.upload<Deliverable>(`/api/orders/${id}/deliverables/`, form),
  humanizationQuote: (form: FormData) =>
    api.upload<HumanizationQuote>('/api/humanization/quote/', form),
}

export const bids = {
  mine: (params?: Record<string, any>) => api.get<Paginated<Bid>>(`/api/bids/${qs(params)}`),
  accept: (id: number) => api.post<{ order: Order; quote: any; detail: string }>(`/api/bids/${id}/accept/`),
  reject: (id: number) => api.post(`/api/bids/${id}/reject/`),
  withdraw: (id: number) => api.post(`/api/bids/${id}/withdraw/`),
}

export const dashboard = {
  stats: () => api.get<DashboardStats>('/api/dashboard/stats/'),
}

export const writers = {
  list: (params?: Record<string, any>) =>
    api.get<Paginated<PublicWriter>>(`/api/writers/${qs(params)}`),
  get: (username: string) => api.get<PublicWriter>(`/api/writers/${username}/`),
  myProfile: () => api.get<WriterProfile>('/api/profile/writer/'),
  updateMyProfile: (payload: Record<string, any>) => api.patch('/api/profile/writer/', payload),
  submitKyc: (form: FormData) => api.upload('/api/profile/kyc/', form, 'PATCH'),
}

export const clientProfile = {
  get: () => api.get('/api/profile/client/'),
  update: (payload: Record<string, any>) => api.patch('/api/profile/client/', payload),
}

export const wallet = {
  get: () => api.get<Wallet>('/api/wallet/'),
  transactions: (params?: Record<string, any>) =>
    api.get<Paginated<WalletTransaction>>(`/api/wallet/transactions/${qs(params)}`),
  topUp: (payload: { amount: string; provider: string; phone?: string }) =>
    api.post('/api/wallet/topup/', payload),
  withdrawals: () => api.get<Paginated<Withdrawal>>('/api/wallet/withdrawals/'),
  withdraw: (payload: { amount: string; method: string; destination: string }) =>
    api.post<Withdrawal>('/api/wallet/withdrawals/', payload),
}

export const subscription = {
  get: () => api.get<Subscription>('/api/subscription/'),
  subscribe: (plan: 'free' | 'pro') => api.post<Subscription>('/api/subscription/', { plan }),
}

export const reviews = {
  list: (params?: Record<string, any>) => api.get<Paginated<Review>>(`/api/reviews/${qs(params)}`),
  create: (payload: { order: number; rating: number; comment: string }) =>
    api.post<Review>('/api/reviews/', payload),
  reply: (id: number, reply: string) => api.post<Review>(`/api/reviews/${id}/reply/`, { reply }),
}

export const messages = {
  list: (orderId: number | string) => api.get<Message[]>(`/api/messages/${orderId}/`),
  send: (orderId: number, form: FormData) => api.upload<Message>(`/api/messages/${orderId}/`, form),
  scan: (content: string) => api.post<LeakScan>('/api/messages/scan/', { content }),
}

export const notifications = {
  list: () => api.get<Paginated<Notification>>('/api/notifications/'),
  read: (id: number) => api.post(`/api/notifications/${id}/read/`),
  readAll: () => api.post('/api/notifications/read-all/'),
}

export const checks = {
  pricing: () =>
    api.get<{
      price_per_report: number
      currency: string
      report_types: { value: string; label: string }[]
    }>('/api/check-requests/pricing/'),
  submit: (form: FormData) => api.upload<CheckRequest>('/api/check-requests/', form),
  track: (reference: string) => api.get<CheckRequest>(`/api/check-requests/track/${reference}/`),
  mine: () => api.get<CheckRequest[]>('/api/check-requests/mine/'),
}

export const admin = {
  stats: () => api.get<AdminStats>('/api/admin/stats/'),
  users: (params?: Record<string, any>) => api.get<Paginated<CurrentUser>>(`/api/admin/users/${qs(params)}`),
  approveKyc: (id: number) => api.post(`/api/admin/users/${id}/approve-kyc/`),
  rejectKyc: (id: number) => api.post(`/api/admin/users/${id}/reject-kyc/`),
  suspendUser: (id: number, reason: string) => api.post(`/api/admin/users/${id}/suspend/`, { reason }),
  reinstateUser: (id: number) => api.post(`/api/admin/users/${id}/reinstate/`),

  disputes: (params?: Record<string, any>) =>
    api.get<Paginated<Dispute>>(`/api/admin/disputes/${qs(params)}`),
  claimDispute: (id: number) => api.post<Dispute>(`/api/admin/disputes/${id}/claim/`),
  resolveDispute: (
    id: number,
    payload: {
      resolution: string
      writer_share_percent?: number
      resolution_notes?: string
      apply_strike?: boolean
    },
  ) => api.post<Dispute>(`/api/admin/disputes/${id}/resolve/`, payload),

  fines: (params?: Record<string, any>) => api.get<Paginated<Fine>>(`/api/admin/fines/${qs(params)}`),
  waiveFine: (id: number) => api.post<Fine>(`/api/admin/fines/${id}/waive/`),

  flagged: () => api.get<Paginated<Deliverable>>('/api/admin/flagged-deliverables/'),
  clearFlag: (id: number) => api.post(`/api/admin/flagged-deliverables/${id}/clear-flag/`),
  rescan: (id: number) => api.post(`/api/admin/flagged-deliverables/${id}/rescan/`),

  contactLeaks: (params?: Record<string, any>) =>
    api.get<Paginated<ContactLeakFlag>>(`/api/admin/contact-leaks/${qs(params)}`),
  contactLeakStats: () =>
    api.get<{
      total: number
      unreviewed: number
      blocked: number
      false_positives: number
      by_severity: { severity: string; count: number }[]
      by_kind: { kind: string; count: number }[]
      top_offenders: { user__id: number; user__username: string; count: number }[]
    }>('/api/admin/contact-leaks/stats/'),
  reviewContactLeak: (id: number, payload: { is_false_positive: boolean; notes: string }) =>
    api.post<ContactLeakFlag>(`/api/admin/contact-leaks/${id}/review/`, payload),

  checkRequests: (params?: Record<string, any>) =>
    api.get<Paginated<CheckRequest>>(`/api/admin/check-requests/${qs(params)}`),
  startCheck: (id: number) => api.post<CheckRequest>(`/api/admin/check-requests/${id}/start/`),
  markCheckPaid: (id: number) => api.post<CheckRequest>(`/api/admin/check-requests/${id}/mark-paid/`),
  uploadCheckReport: (id: number, form: FormData) =>
    api.upload(`/api/admin/check-requests/${id}/reports/`, form),
  deliverCheck: (id: number) => api.post<CheckRequest>(`/api/admin/check-requests/${id}/deliver/`),

  withdrawals: (params?: Record<string, any>) =>
    api.get<Paginated<Withdrawal>>(`/api/admin/withdrawals/${qs(params)}`),
  markWithdrawalPaid: (id: number, notes?: string) =>
    api.post(`/api/admin/withdrawals/${id}/mark-paid/`, { notes }),
  rejectWithdrawal: (id: number, notes?: string) =>
    api.post(`/api/admin/withdrawals/${id}/reject/`, { notes }),
}
