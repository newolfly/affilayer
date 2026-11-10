import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AppLayout, PageLoader } from './components/layout'
import type { DashboardNavItem } from './components/layout'
import { useAuth, roleHome } from './lib/auth'
import { RouteSeo } from './lib/seo'
import { LocaleProvider, useT } from './lib/i18n'
import type { Role } from './lib/types'

// Route sections are code-split: each page module becomes its own chunk,
// so the initial bundle only carries the router, layout and auth.
const Home = lazy(() => import('./pages/public').then((m) => ({ default: m.Home })))
const About = lazy(() => import('./pages/public').then((m) => ({ default: m.About })))
const Advantages = lazy(() => import('./pages/public').then((m) => ({ default: m.Advantages })))
const AdvertisersPage = lazy(() => import('./pages/public').then((m) => ({ default: m.AdvertisersPage })))
const AffiliatesPage = lazy(() => import('./pages/public').then((m) => ({ default: m.AffiliatesPage })))
const HowItWorks = lazy(() => import('./pages/public').then((m) => ({ default: m.HowItWorks })))
const Faq = lazy(() => import('./pages/public').then((m) => ({ default: m.Faq })))
const Contact = lazy(() => import('./pages/public').then((m) => ({ default: m.Contact })))
const Terms = lazy(() => import('./pages/public').then((m) => ({ default: m.Terms })))
const Privacy = lazy(() => import('./pages/public').then((m) => ({ default: m.Privacy })))
const Partner = lazy(() => import('./pages/public').then((m) => ({ default: m.Partner })))
const WhiteLabel = lazy(() => import('./pages/public').then((m) => ({ default: m.WhiteLabel })))
const Advertise = lazy(() => import('./pages/public').then((m) => ({ default: m.Advertise })))
const NotFound = lazy(() => import('./pages/public').then((m) => ({ default: m.NotFound })))
const Blog = lazy(() => import('./pages/blog').then((m) => ({ default: m.Blog })))
const BlogPost = lazy(() => import('./pages/blog').then((m) => ({ default: m.BlogPost })))
const BlogCategory = lazy(() => import('./pages/blog').then((m) => ({ default: m.BlogCategory })))
const News = lazy(() => import('./pages/blog').then((m) => ({ default: m.News })))
const Brand = lazy(() => import('./pages/brand').then((m) => ({ default: m.Brand })))
const GeoIndex = lazy(() => import('./pages/geo').then((m) => ({ default: m.GeoIndex })))
const GeoPage = lazy(() => import('./pages/geo').then((m) => ({ default: m.GeoPage })))
const Login = lazy(() => import('./pages/auth').then((m) => ({ default: m.Login })))
const Register = lazy(() => import('./pages/auth').then((m) => ({ default: m.Register })))
const Onboarding = lazy(() => import('./pages/auth').then((m) => ({ default: m.Onboarding })))
const Pending = lazy(() => import('./pages/auth').then((m) => ({ default: m.Pending })))
const ForgotPassword = lazy(() => import('./pages/auth').then((m) => ({ default: m.ForgotPassword })))
const ResetPassword = lazy(() => import('./pages/auth').then((m) => ({ default: m.ResetPassword })))
const AffiliateDashboard = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliateDashboard })))
const AffiliateOffers = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliateOffers })))
const AffiliateOfferDetail = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliateOfferDetail })))
const AffiliateMyCampaigns = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliateMyCampaigns })))
const AffiliateTrackingLinks = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliateTrackingLinks })))
const AffiliateReports = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliateReports })))
const AffiliatePostbacks = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliatePostbacks })))
const AffiliateEarnings = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliateEarnings })))
const AffiliatePayouts = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliatePayouts })))
const AffiliateProfile = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliateProfile })))
const AffiliateTickets = lazy(() => import('./pages/affiliate').then((m) => ({ default: m.AffiliateTickets })))
const AdvertiserDashboard = lazy(() => import('./pages/advertiser').then((m) => ({ default: m.AdvertiserDashboard })))
const AdvertiserCampaigns = lazy(() => import('./pages/advertiser').then((m) => ({ default: m.AdvertiserCampaigns })))
const AdvertiserCreateOffer = lazy(() => import('./pages/advertiser').then((m) => ({ default: m.AdvertiserCreateOffer })))
const AdvertiserAffiliates = lazy(() => import('./pages/advertiser').then((m) => ({ default: m.AdvertiserAffiliates })))
const AdvertiserConversions = lazy(() => import('./pages/advertiser').then((m) => ({ default: m.AdvertiserConversions })))
const AdvertiserReports = lazy(() => import('./pages/advertiser').then((m) => ({ default: m.AdvertiserReports })))
const AdvertiserBilling = lazy(() => import('./pages/advertiser').then((m) => ({ default: m.AdvertiserBilling })))
const AdminOverview = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminOverview })))
const AdminUsers = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminUsers })))
const AdminAffiliates = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminAffiliates })))
const AdminAdvertisers = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminAdvertisers })))
const AdminOffers = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminOffers })))
const AdminCampaigns = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminCampaigns })))
const AdminConversions = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminConversions })))
const AdminFraud = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminFraud })))
const AdminLedger = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminLedger })))
const AdminPayouts = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminPayouts })))
const AdminCompliance = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminCompliance })))
const AdminAuditLogs = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminAuditLogs })))
const AdminSettings = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminSettings })))
const AdminTickets = lazy(() => import('./pages/admin').then((m) => ({ default: m.AdminTickets })))

function RequireAuth({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (user.status === 'pending') return <Navigate to="/pending" replace />
  if (!roles.includes(user.role)) return <Navigate to={roleHome(user.role)} replace />
  return <>{children}</>
}

function AppHome() {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={roleHome(user.role)} replace />
}

const affiliateNav: DashboardNavItem[] = [
  { to: '/app/affiliate', label: 'Dashboard', icon: 'grid' },
  { to: '/app/affiliate/offers', label: 'Offers', icon: 'tag' },
  { to: '/app/affiliate/my-campaigns', label: 'My campaigns', icon: 'megaphone' },
  { to: '/app/affiliate/tracking-links', label: 'Tracking links', icon: 'link' },
  { to: '/app/affiliate/reports', label: 'Reports', icon: 'chart' },
  { to: '/app/affiliate/postbacks', label: 'Postbacks', icon: 'send' },
  { to: '/app/affiliate/earnings', label: 'Earnings', icon: 'wallet' },
  { to: '/app/affiliate/payouts', label: 'Payouts', icon: 'banknote' },
  { to: '/app/affiliate/profile', label: 'Profile', icon: 'user' },
  { to: '/app/affiliate/tickets', label: 'Tickets', icon: 'ticket' },
]

const advertiserNav: DashboardNavItem[] = [
  { to: '/app/advertiser', label: 'Dashboard', icon: 'grid' },
  { to: '/app/advertiser/campaigns', label: 'Campaigns', icon: 'megaphone' },
  { to: '/app/advertiser/create-offer', label: 'Create offer', icon: 'plus' },
  { to: '/app/advertiser/affiliates', label: 'Affiliates', icon: 'users' },
  { to: '/app/advertiser/conversions', label: 'Conversions', icon: 'check' },
  { to: '/app/advertiser/reports', label: 'Reports', icon: 'chart' },
  { to: '/app/advertiser/billing', label: 'Billing', icon: 'wallet' },
]

const adminNav: DashboardNavItem[] = [
  { to: '/app/admin', label: 'Overview', icon: 'grid' },
  { to: '/app/admin/users', label: 'Users', icon: 'users' },
  { to: '/app/admin/affiliates', label: 'Affiliates', icon: 'user' },
  { to: '/app/admin/advertisers', label: 'Advertisers', icon: 'building' },
  { to: '/app/admin/offers', label: 'Offers', icon: 'tag' },
  { to: '/app/admin/campaigns', label: 'Campaigns', icon: 'megaphone' },
  { to: '/app/admin/conversions', label: 'Conversions', icon: 'check' },
  { to: '/app/admin/fraud', label: 'Fraud', icon: 'shield' },
  { to: '/app/admin/ledger', label: 'Ledger', icon: 'file' },
  { to: '/app/admin/payouts', label: 'Payouts', icon: 'banknote' },
  { to: '/app/admin/compliance', label: 'Compliance', icon: 'lock' },
  { to: '/app/admin/audit-logs', label: 'Audit logs', icon: 'eye' },
  { to: '/app/admin/settings', label: 'Settings', icon: 'settings' },
  { to: '/app/admin/tickets', label: 'Tickets', icon: 'ticket' },
]

function SkipLink() {
  const t = useT()
  return (
    <a href="#main-content" className="skip-link">{t('a11y.skip')}</a>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <LocaleProvider>
      <SkipLink />
      <RouteSeo />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/advantages" element={<Advantages />} />
          <Route path="/advertisers" element={<AdvertisersPage />} />
          <Route path="/affiliates" element={<AffiliatesPage />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/category/:category" element={<BlogCategory />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/news" element={<News />} />
          <Route path="/brand" element={<Brand />} />
          <Route path="/es/blog" element={<Blog />} />
          <Route path="/es/brand" element={<Brand />} />
          <Route path="/pt/blog" element={<Blog />} />
          <Route path="/pt/brand" element={<Brand />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/partner" element={<Partner />} />
          <Route path="/white-label" element={<WhiteLabel />} />
          <Route path="/advertise" element={<Advertise />} />
          <Route path="/geo" element={<GeoIndex />} />
          <Route path="/geo/:code" element={<GeoPage />} />
          {/* Public, Spanish (same components, locale from the URL) */}
          <Route path="/es" element={<Home />} />
          <Route path="/es/affiliates" element={<AffiliatesPage />} />
          <Route path="/es/advertisers" element={<AdvertisersPage />} />
          <Route path="/es/how-it-works" element={<HowItWorks />} />
          <Route path="/es/geo" element={<GeoIndex />} />
          <Route path="/es/geo/:code" element={<GeoPage />} />
          {/* Public, Portuguese */}
          <Route path="/pt" element={<Home />} />
          <Route path="/pt/affiliates" element={<AffiliatesPage />} />
          <Route path="/pt/advertisers" element={<AdvertisersPage />} />
          <Route path="/pt/how-it-works" element={<HowItWorks />} />
          <Route path="/pt/geo" element={<GeoIndex />} />
          <Route path="/pt/geo/:code" element={<GeoPage />} />
          {/* Auth */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      </LocaleProvider>
    </BrowserRouter>
  )
}
