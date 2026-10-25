import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { isEnabled, MODULES, requiredOnboardingDone, type ModuleId } from "@thuso/core";
import { ButtonLink, EmptyState, PageSpinner } from "../ui/kit";
import { useSession } from "./session";

const LandingPage = lazy(() => import("../modules/landing/LandingPage"));
const SignInPage = lazy(() => import("../modules/auth/SignInPage"));
const SignUpPage = lazy(() => import("../modules/auth/SignUpPage"));
const VerifyEmailPage = lazy(() => import("../modules/auth/VerifyEmailPage"));
const ForgotPasswordPage = lazy(() => import("../modules/auth/ForgotPasswordPage"));
const OnboardingPage = lazy(() => import("../modules/onboarding/OnboardingPage"));
const AppShell = lazy(() => import("../modules/shell/AppShell"));
const HomePage = lazy(() => import("../modules/home/HomePage"));
const CustomersPage = lazy(() => import("../modules/customers/CustomersPage"));
const CustomerDetailPage = lazy(() => import("../modules/customers/CustomerDetailPage"));
const BookingsPage = lazy(() => import("../modules/bookings/BookingsPage"));
const ServicesPage = lazy(() => import("../modules/bookings/ServicesPage"));
const InvoicesPage = lazy(() => import("../modules/invoices/InvoicesPage"));
const NewInvoicePage = lazy(() => import("../modules/invoices/NewInvoicePage"));
const InvoiceDetailPage = lazy(() => import("../modules/invoices/InvoiceDetailPage"));
const StockPage = lazy(() => import("../modules/stock/StockPage"));
const SettingsPage = lazy(() => import("../modules/settings/SettingsPage"));
const PublicBookingPage = lazy(() => import("../modules/public/PublicBookingPage"));
const PaidPage = lazy(() => import("../modules/public/PaidPage"));
const LegalPage = lazy(() => import("../modules/public/LegalPage"));

function RequireAuth() {
  const s = useSession();
  const loc = useLocation();
  if (!s.ready) return <PageSpinner />;
  if (!s.user) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return <Outlet />;
}

function RequireVerified() {
  const s = useSession();
  if (!s.verified) return <Navigate to="/verify" replace />;
  return <Outlet />;
}

/** The workspace needs a business with the required onboarding steps done. */
function RequireWorkspace() {
  const s = useSession();
  if (!s.businessReady) return <PageSpinner />;
  if (!s.business) return <Navigate to="/onboarding/profile" replace />;
  if (!requiredOnboardingDone(s.business)) return <Navigate to={`/onboarding/${s.business.onboarding.next}`} replace />;
  return <Outlet />;
}

/** Module gate in the UI. Rules and functions enforce the same gate on the server. */
function RequireModule({ module, children }: { module: ModuleId; children: ReactNode }) {
  const s = useSession();
  if (s.business && isEnabled(s.business.enabledModules, module)) return <>{children}</>;
  return (
    <EmptyState icon="lock" title={`${MODULES[module].name} is switched off`}
      body={`${MODULES[module].summary} Switch it on in Settings whenever you are ready. Any data you had is still there.`}
      action={s.role === "owner" || s.role === "admin" ? <ButtonLink to="/app/settings?tab=tools">Go to tools</ButtonLink> : undefined} />
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signin" element={<SignInPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/forgot" element={<ForgotPasswordPage />} />
        <Route path="/b/:slug" element={<PublicBookingPage />} />
        <Route path="/paid" element={<PaidPage />} />
        <Route path="/legal/:doc" element={<LegalPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/verify" element={<VerifyEmailPage />} />
          <Route element={<RequireVerified />}>
            <Route path="/onboarding/:step" element={<OnboardingPage />} />
            <Route path="/onboarding" element={<Navigate to="/onboarding/profile" replace />} />
            <Route element={<RequireWorkspace />}>
              <Route path="/app" element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="customers" element={<CustomersPage />} />
                <Route path="customers/:id" element={<CustomerDetailPage />} />
                <Route path="bookings" element={<RequireModule module="bookings"><BookingsPage /></RequireModule>} />
                <Route path="bookings/services" element={<RequireModule module="bookings"><ServicesPage /></RequireModule>} />
                <Route path="invoices" element={<RequireModule module="invoicing"><InvoicesPage /></RequireModule>} />
                <Route path="invoices/new" element={<RequireModule module="invoicing"><NewInvoicePage /></RequireModule>} />
                <Route path="invoices/:id" element={<RequireModule module="invoicing"><InvoiceDetailPage /></RequireModule>} />
                <Route path="stock" element={<RequireModule module="stock"><StockPage /></RequireModule>} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
