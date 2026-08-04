import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { homeFor, useAuth } from '@/context/AuthContext'
import { PageLoader } from '@/components/ui/Misc'

import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import CheckMyPaper from '@/pages/CheckMyPaper'
import Pricing from '@/pages/Pricing'
import NotFound from '@/pages/NotFound'

import ClientDashboard from '@/pages/client/ClientDashboard'
import PostOrder from '@/pages/client/PostOrder'
import FindWriters from '@/pages/client/FindWriters'
import Wallet from '@/pages/client/Wallet'

import WriterDashboard from '@/pages/writer/WriterDashboard'
import BrowseOrders from '@/pages/writer/BrowseOrders'
import MyBids from '@/pages/writer/MyBids'
import Earnings from '@/pages/writer/Earnings'

import Orders from '@/pages/shared/Orders'
import OrderDetail from '@/pages/shared/OrderDetail'
import Reviews from '@/pages/shared/Reviews'
import Account from '@/pages/shared/Account'
import WriterProfilePage from '@/pages/shared/WriterProfilePage'

import AdminOverview from '@/pages/admin/AdminOverview'
import AdminDisputes from '@/pages/admin/AdminDisputes'
import AdminModeration from '@/pages/admin/AdminModeration'
import AdminFlagged from '@/pages/admin/AdminFlagged'
import AdminChecks from '@/pages/admin/AdminChecks'
import AdminUsers from '@/pages/admin/AdminUsers'
import AdminPayouts from '@/pages/admin/AdminPayouts'

function RequireAuth({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, loading, isAdmin } = useAuth()
  const location = useLocation()

  if (loading) return <PageLoader label="Checking your session…" />
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  if (roles && !roles.includes(user.role) && !(roles.includes('admin') && isAdmin)) {
    return <Navigate to={homeFor(user.role)} replace />
  }
  return <>{children}</>
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (user) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Landing />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/check-my-paper" element={<CheckMyPaper />} />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />

      {/* Authenticated app */}
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        {/* Client */}
        <Route
          path="/dashboard"
          element={
            <RequireAuth roles={['client']}>
              <ClientDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/orders/new"
          element={
            <RequireAuth roles={['client']}>
              <PostOrder />
            </RequireAuth>
          }
        />
        <Route
          path="/writers"
          element={
            <RequireAuth roles={['client', 'admin']}>
              <FindWriters />
            </RequireAuth>
          }
        />
        <Route
          path="/wallet"
          element={
            <RequireAuth roles={['client']}>
              <Wallet />
            </RequireAuth>
          }
        />

        {/* Writer */}
        <Route
          path="/writer"
          element={
            <RequireAuth roles={['writer']}>
              <WriterDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/browse"
          element={
            <RequireAuth roles={['writer']}>
              <BrowseOrders />
            </RequireAuth>
          }
        />
        <Route
          path="/my-bids"
          element={
            <RequireAuth roles={['writer']}>
              <MyBids />
            </RequireAuth>
          }
        />
        <Route
          path="/earnings"
          element={
            <RequireAuth roles={['writer']}>
              <Earnings />
            </RequireAuth>
          }
        />

        {/* Shared */}
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/reviews" element={<Reviews />} />
        <Route path="/account" element={<Account />} />
        <Route path="/w/:username" element={<WriterProfilePage />} />

        {/* Admin */}
        <Route
          path="/admin"
          element={
            <RequireAuth roles={['admin']}>
              <AdminOverview />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/disputes"
          element={
            <RequireAuth roles={['admin']}>
              <AdminDisputes />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/moderation"
          element={
            <RequireAuth roles={['admin']}>
              <AdminModeration />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/flagged"
          element={
            <RequireAuth roles={['admin']}>
              <AdminFlagged />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/checks"
          element={
            <RequireAuth roles={['admin']}>
              <AdminChecks />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAuth roles={['admin']}>
              <AdminUsers />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/payouts"
          element={
            <RequireAuth roles={['admin']}>
              <AdminPayouts />
            </RequireAuth>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
