// Wizyfi routing configuration.
// CHANGED (Round 18): /app/users and /app/network-cycles are now real pages
// (no more ModulePlaceholder); 404 page styled with tokens.
// Route order note: hard-logout/recurring must stay ABOVE hard-logout/:eventId.

import { Link, Navigate, Route, Routes } from "react-router-dom";

import { AdminRoute } from "./components/auth/AdminRoute";
import { RequireAuth } from "./components/auth/RequireAuth";
import { RequirePermission } from "./components/auth/RequirePermission";
import { StartRedirect } from "./components/auth/StartRedirect";
import { AppLayout } from "./components/layout/AppLayout";
import { btnPrimary } from "./components/ui/styles";

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
import { NetworkCyclesPage } from "./features/cycles/pages/NetworkCyclesPage";
import { DashboardPage } from "./features/dashboard/pages/DashboardPage";
import { DevicesPage } from "./features/devices/pages/DevicesPage";

import { PlaceDetailPage } from "./features/places/pages/PlaceDetailPage";
import { PlaceFormPage } from "./features/places/pages/PlaceFormPage";
import { PlacesPage } from "./features/places/pages/PlacesPage";

import { HomePage } from "./features/public/HomePage";
import { WizyfiProductPage } from "./features/public/WizyfiProductPage";
import { SalesPage } from "./features/sales/pages/SalesPage";
import { TransactionsPage } from "./features/transactions/pages/TransactionsPage";
import { UsersPage } from "./features/users/pages/UsersPage";
import { VouchersPage } from "./features/vouchers/pages/VouchersPage";

import { WizyfiEventPage } from "./features/wizyfi/pages/WizyfiEventPage";
import { WizyfiHistoryPage } from "./features/wizyfi/pages/WizyfiHistoryPage";
import { WizyfiOverviewPage } from "./features/wizyfi/pages/WizyfiOverviewPage";
import { WizyfiRecurringPage } from "./features/wizyfi/pages/WizyfiRecurringPage";
import { WizyfiSchedulePage } from "./features/wizyfi/pages/WizyfiSchedulePage";

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
          <Route path="users" element={<RequirePermission code="customers:view"><UsersPage /></RequirePermission>} />
          <Route path="network-cycles" element={<RequirePermission code="network_cycles:view"><NetworkCyclesPage /></RequirePermission>} />

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
          <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 text-center">
            <div>
              <p className="text-sm font-semibold text-[var(--primary)]">404</p>
              <h1 className="mt-1 text-3xl font-bold text-[var(--foreground)]">Page not found</h1>
              <p className="mt-2 text-[var(--foreground-secondary)]">The page you're looking for doesn't exist or has moved.</p>
              <Link to="/" className={`${btnPrimary} mt-6`}>Back to home</Link>
            </div>
          </div>
        }
      />
    </Routes>
  );
}
