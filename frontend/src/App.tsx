// Wizyfi routing configuration.
//
// CHANGED (Round 17):
//  * "/" is now the PUBLIC HOME PAGE (it used to redirect to /app/dashboard).
//  * /sign-in and /sign-up added; /login kept as an alias for old links.
//  * /start decides where a signed-in user goes (dashboard / admin / onboarding).
//  * /app is back UNDER RequireAuth. It had been moved out "for development/testing",
//    but RequireAuth is what loads the profile and memberships (useBootstrapSession);
//    outside it the app never learns the user's organization or permissions, and
//    unauthenticated visitors could open /app. Move it out again only for local UI work.
//  * /app/hard-logout/recurring added (must stay ABOVE hard-logout/:eventId).

import { Navigate, Route, Routes } from "react-router-dom";

import { AdminRoute } from "./components/auth/AdminRoute";
import { RequireAuth } from "./components/auth/RequireAuth";
import { RequirePermission } from "./components/auth/RequirePermission";
import { StartRedirect } from "./components/auth/StartRedirect";
import { AppLayout } from "./components/layout/AppLayout";
import { EmptyState } from "./components/ui/EmptyState";

import { AccessPlansPage } from "./features/access/pages/AccessPlansPage";
import { PlanEditorPage } from "./features/access/pages/PlanEditorPage";

import { AdminLayout } from "./features/admin/components/AdminLayout";
import { ActivityPage } from "./features/admin/pages/ActivityPage";
import { AdminDashboardPage } from "./features/admin/pages/AdminDashboardPage";
import { AgentDetailPage } from "./features/admin/pages/AgentDetailPage";
import { AgentsPage } from "./features/admin/pages/AgentsPage";
import { PlansPage } from "./features/admin/pages/PlansPage";

import { LoginPage } from "./features/auth/LoginPage";
import { OnboardingPage } from "./features/auth/OnboardingPage";
import { SignUpPage } from "./features/auth/SignUpPage";

import { ConnectionsPage } from "./features/connections/pages/ConnectionsPage";
import { DashboardPage } from "./features/dashboard/pages/DashboardPage";
import { DevicesPage } from "./features/devices/pages/DevicesPage";

import { PlaceDetailPage } from "./features/places/pages/PlaceDetailPage";
import { PlaceFormPage } from "./features/places/pages/PlaceFormPage";
import { PlacesPage } from "./features/places/pages/PlacesPage";

import { HomePage } from "./features/public/HomePage";
import { WizyfiProductPage } from "./features/public/WizyfiProductPage";
import { SalesPage } from "./features/sales/pages/SalesPage";
import { TransactionsPage } from "./features/transactions/pages/TransactionsPage";
import { VouchersPage } from "./features/vouchers/pages/VouchersPage";

import { WizyfiEventPage } from "./features/wizyfi/pages/WizyfiEventPage";
import { WizyfiHistoryPage } from "./features/wizyfi/pages/WizyfiHistoryPage";
import { WizyfiOverviewPage } from "./features/wizyfi/pages/WizyfiOverviewPage";
import { WizyfiRecurringPage } from "./features/wizyfi/pages/WizyfiRecurringPage";
import { WizyfiSchedulePage } from "./features/wizyfi/pages/WizyfiSchedulePage";

function ModulePlaceholder({ title }: { title: string }) {
  return (
    <EmptyState
      title={title}
      description="This screen isn't wired into this build yet. Replace this placeholder with your page."
    />
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public website */}
      <Route path="/" element={<HomePage />} />
      <Route path="/wizyfi" element={<WizyfiProductPage />} />
      <Route path="/sign-in" element={<LoginPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sign-up" element={<SignUpPage />} />

      {/* Everything below needs a signed-in user */}
      <Route element={<RequireAuth />}>
        <Route path="/start" element={<StartRedirect />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />

          <Route path="places" element={<RequirePermission code="places:view"><PlacesPage /></RequirePermission>} />
          <Route path="places/new" element={<RequirePermission code="places:create"><PlaceFormPage /></RequirePermission>} />
          <Route path="places/:placeId" element={<RequirePermission code="places:view"><PlaceDetailPage /></RequirePermission>} />

          <Route path="devices" element={<RequirePermission code="devices:view"><DevicesPage /></RequirePermission>} />
          <Route path="connections" element={<RequirePermission code="connections:view"><ConnectionsPage /></RequirePermission>} />

          <Route path="users/*" element={<ModulePlaceholder title="Users" />} />
          <Route path="network-cycles/*" element={<ModulePlaceholder title="Network cycles" />} />

          {/* Wizyfi / hard logout */}
          <Route path="hard-logout" element={<RequirePermission code="hard_logout:view"><WizyfiOverviewPage /></RequirePermission>} />
          <Route path="hard-logout/schedule" element={<RequirePermission code="hard_logout:schedule"><WizyfiSchedulePage /></RequirePermission>} />
          <Route path="hard-logout/recurring" element={<RequirePermission code="hard_logout:view"><WizyfiRecurringPage /></RequirePermission>} />
          <Route path="hard-logout/history" element={<RequirePermission code="hard_logout:view"><WizyfiHistoryPage /></RequirePermission>} />
          <Route path="hard-logout/:eventId" element={<RequirePermission code="hard_logout:view"><WizyfiEventPage /></RequirePermission>} />

          <Route path="access-plans" element={<RequirePermission code="access_plans:view"><AccessPlansPage /></RequirePermission>} />
          <Route path="access-plans/new" element={<RequirePermission code="access_plans:create"><PlanEditorPage /></RequirePermission>} />
          <Route path="access-plans/:id" element={<RequirePermission code="access_plans:view"><PlanEditorPage /></RequirePermission>} />

          <Route path="vouchers" element={<RequirePermission code="vouchers:view"><VouchersPage /></RequirePermission>} />
          <Route path="sales" element={<RequirePermission code="sales:view"><SalesPage /></RequirePermission>} />
          <Route path="transactions" element={<RequirePermission code="transactions:view"><TransactionsPage /></RequirePermission>} />
        </Route>

        {/* Platform administration */}
        <Route path="/admin" element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="agents/:id" element={<AgentDetailPage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="activity" element={<ActivityPage />} />
          </Route>
        </Route>
      </Route>

      {/* 404 */}
      <Route
        path="*"
        element={
          <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-center">
            <div>
              <h1 className="text-3xl font-bold text-[var(--foreground)]">404</h1>
              <p className="mt-2 text-[var(--foreground-secondary)]">Page not found.</p>
            </div>
          </div>
        }
      />
    </Routes>
  );
}
