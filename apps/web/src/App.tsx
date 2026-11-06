import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppLayout } from './components/layout'
import { useAuth, roleHome } from './lib/auth'
import type { Role } from './lib/types'
import { About, AdvertisersPage, AffiliatesPage, Contact, Home, HowItWorks, Privacy, Terms } from './pages/public'
import { Login, Onboarding, Pending, Register } from './pages/auth'
import {
  AffiliateDashboard, AffiliateEarnings, AffiliateMyCampaigns, AffiliateOfferDetail, AffiliateOffers,
  AffiliatePayouts, AffiliatePostbacks, AffiliateProfile, AffiliateReports, AffiliateTickets, AffiliateTrackingLinks,
} from './pages/affiliate'
import {
  AdvertiserAffiliates, AdvertiserBilling, AdvertiserCampaigns, AdvertiserConversions,
  AdvertiserCreateOffer, AdvertiserDashboard, AdvertiserReports,
} from './pages/advertiser'
import {
  AdminAdvertisers, AdminAffiliates, AdminAuditLogs, AdminCampaigns, AdminCompliance, AdminConversions,
  AdminFraud, AdminLedger, AdminOffers, AdminOverview, AdminPayouts, AdminSettings, AdminTickets, AdminUsers,
} from './pages/admin'

function RequireAuth({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-8 text-slate-500">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  if (user.status === 'pending') return <Navigate to="/pending" replace />
  if (!roles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />
  return <>{children}</>
}

function AppHome() {
  const { user, loading } = useAuth()
  if (loading) return <p className="p-8 text-slate-500">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={roleHome(user.role)} replace />
}

const affiliateNav = [
  { to: '/app/affiliate', label: 'Dashboard' },
  { to: '/app/affiliate/offers', label: 'Offers' },
  { to: '/app/affiliate/my-campaigns', label: 'My campaigns' },
  { to: '/app/affiliate/tracking-links', label: 'Tracking links' },
  { to: '/app/affiliate/reports', label: 'Reports' },
  { to: '/app/affiliate/postbacks', label: 'Postbacks' },
  { to: '/app/affiliate/earnings', label: 'Earnings' },
  { to: '/app/affiliate/payouts', label: 'Payouts' },
  { to: '/app/affiliate/profile', label: 'Profile' },
  { to: '/app/affiliate/tickets', label: 'Tickets' },
]

const advertiserNav = [
  { to: '/app/advertiser', label: 'Dashboard' },
  { to: '/app/advertiser/campaigns', label: 'Campaigns' },
  { to: '/app/advertiser/create-offer', label: 'Create offer' },
  { to: '/app/advertiser/affiliates', label: 'Affiliates' },
  { to: '/app/advertiser/conversions', label: 'Conversions' },
  { to: '/app/advertiser/reports', label: 'Reports' },
  { to: '/app/advertiser/billing', label: 'Billing' },
]

const adminNav = [
  { to: '/app/admin', label: 'Overview' },
  { to: '/app/admin/users', label: 'Users' },
  { to: '/app/admin/affiliates', label: 'Affiliates' },
  { to: '/app/admin/advertisers', label: 'Advertisers' },
  { to: '/app/admin/offers', label: 'Offers' },
  { to: '/app/admin/campaigns', label: 'Campaigns' },
  { to: '/app/admin/conversions', label: 'Conversions' },
  { to: '/app/admin/fraud', label: 'Fraud' },
  { to: '/app/admin/ledger', label: 'Ledger' },
  { to: '/app/admin/payouts', label: 'Payouts' },
  { to: '/app/admin/compliance', label: 'Compliance' },
  { to: '/app/admin/audit-logs', label: 'Audit logs' },
  { to: '/app/admin/settings', label: 'Settings' },
  { to: '/app/admin/tickets', label: 'Tickets' },
]

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/advertisers" element={<AdvertisersPage />} />
        <Route path="/affiliates" element={<AffiliatesPage />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        {/* Auth */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/pending" element={<Pending />} />
        {/* App entry */}
        <Route path="/app" element={<AppHome />} />
        {/* Affiliate */}
        <Route path="/app/affiliate" element={<RequireAuth roles={['affiliate']}><AppLayout nav={affiliateNav} title="Affiliate" /></RequireAuth>}>
          <Route index element={<AffiliateDashboard />} />
          <Route path="offers" element={<AffiliateOffers />} />
          <Route path="offers/:id" element={<AffiliateOfferDetail />} />
          <Route path="my-campaigns" element={<AffiliateMyCampaigns />} />
          <Route path="tracking-links" element={<AffiliateTrackingLinks />} />
          <Route path="reports" element={<AffiliateReports />} />
          <Route path="postbacks" element={<AffiliatePostbacks />} />
          <Route path="earnings" element={<AffiliateEarnings />} />
          <Route path="payouts" element={<AffiliatePayouts />} />
          <Route path="profile" element={<AffiliateProfile />} />
          <Route path="tickets" element={<AffiliateTickets />} />
        </Route>
        {/* Advertiser */}
        <Route path="/app/advertiser" element={<RequireAuth roles={['advertiser']}><AppLayout nav={advertiserNav} title="Advertiser" /></RequireAuth>}>
          <Route index element={<AdvertiserDashboard />} />
          <Route path="campaigns" element={<AdvertiserCampaigns />} />
          <Route path="create-offer" element={<AdvertiserCreateOffer />} />
          <Route path="affiliates" element={<AdvertiserAffiliates />} />
          <Route path="conversions" element={<AdvertiserConversions />} />
          <Route path="reports" element={<AdvertiserReports />} />
          <Route path="billing" element={<AdvertiserBilling />} />
        </Route>
        {/* Admin */}
        <Route path="/app/admin" element={<RequireAuth roles={['super_admin', 'network_manager']}><AppLayout nav={adminNav} title="Admin" /></RequireAuth>}>
          <Route index element={<AdminOverview />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="affiliates" element={<AdminAffiliates />} />
          <Route path="advertisers" element={<AdminAdvertisers />} />
          <Route path="offers" element={<AdminOffers />} />
          <Route path="campaigns" element={<AdminCampaigns />} />
          <Route path="conversions" element={<AdminConversions />} />
          <Route path="fraud" element={<AdminFraud />} />
          <Route path="ledger" element={<AdminLedger />} />
          <Route path="payouts" element={<AdminPayouts />} />
          <Route path="compliance" element={<AdminCompliance />} />
          <Route path="audit-logs" element={<AdminAuditLogs />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="tickets" element={<AdminTickets />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
