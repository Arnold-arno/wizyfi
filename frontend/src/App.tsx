```tsx
// Wizyfi routing configuration
// RootRedirect is outside RequireAuth so the root route can decide
// where to navigate without being blocked by the authentication guard.
//
// Route family:
// /app/dashboard
// /app/places
// /app/devices
// /app/connections
// /app/hard-logout
// /app/hard-logout/schedule
// /app/hard-logout/history
// /app/hard-logout/:eventId

import { Navigate, Route, Routes } from "react-router-dom";

import { AdminRoute } from "./components/auth/AdminRoute";
import { RequireAuth } from "./components/auth/RequireAuth";
import { RequirePermission } from "./components/auth/RequirePermission";
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

import { ConnectionsPage } from "./features/connections/pages/ConnectionsPage";
import { DashboardPage } from "./features/dashboard/pages/DashboardPage";
import { DevicesPage } from "./features/devices/pages/DevicesPage";

import { PlaceDetailPage } from "./features/places/pages/PlaceDetailPage";
import { PlaceFormPage } from "./features/places/pages/PlaceFormPage";
import { PlacesPage } from "./features/places/pages/PlacesPage";

import { WizyfiProductPage } from "./features/public/WizyfiProductPage";
import { SalesPage } from "./features/sales/pages/SalesPage";
import { TransactionsPage } from "./features/transactions/pages/TransactionsPage";
import { VouchersPage } from "./features/vouchers/pages/VouchersPage";

import { WizyfiEventPage } from "./features/wizyfi/pages/WizyfiEventPage";
import { WizyfiHistoryPage } from "./features/wizyfi/pages/WizyfiHistoryPage";
import { WizyfiOverviewPage } from "./features/wizyfi/pages/WizyfiOverviewPage";
import { WizyfiSchedulePage } from "./features/wizyfi/pages/WizyfiSchedulePage";

import { useSessionStore } from "./state/sessionStore";

function ModulePlaceholder({ title }: { title: string }) {
  return (
    <EmptyState
      title={title}
      description="This screen isn't wired into this build yet. Replace this placeholder with your page."
    />
  );
}

/**
 * Root route handler.
 *
 * This component stays outside RequireAuth.
 * A missing user in the store is not automatically treated as
 * proof that the session has been checked and the user is logged out.
 */
function RootRedirect() {
  const user = useSessionStore((s) => s.user);
  const hasOrg = useSessionStore((s) => s.memberships.length > 0);

  // Platform staff land in the admin area.
  if (user?.isPlatformStaff) {
    return <Navigate to="/admin" replace />;
  }

  // Users with an organization land on the dashboard.
  if (user && hasOrg) {
    return <Navigate to="/app/dashboard" replace />;
  }

  // Authenticated users without an organization continue onboarding.
  if (user) {
    return <Navigate to="/onboarding" replace />;
  }

  // Default landing destination.
  // RequireAuth may still enforce authentication on this destination.
  return <Navigate to="/app/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Root redirect is intentionally outside RequireAuth. */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public pages */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/wizyfi" element={<WizyfiProductPage />} />

      {/* Protected application routes */}
      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage />} />

        <Route path="/app" element={<AppLayout />}>
          <Route
            index
            element={<Navigate to="dashboard" replace />}
          />

          <Route path="dashboard" element={<DashboardPage />} />

          {/* Places */}
          <Route
            path="places"
            element={
              <RequirePermission code="places:view">
                <PlacesPage />
              </RequirePermission>
            }
          />

          <Route
            path="places/new"
            element={
              <RequirePermission code="places:create">
                <PlaceFormPage />
              </RequirePermission>
            }
          />

          <Route
            path="places/:placeId"
            element={
              <RequirePermission code="places:view">
                <PlaceDetailPage />
              </RequirePermission>
            }
          />

          {/* Devices and connections */}
          <Route
            path="devices"
            element={
              <RequirePermission code="devices:view">
                <DevicesPage />
              </RequirePermission>
            }
          />

          <Route
            path="connections"
            element={
              <RequirePermission code="connections:view">
                <ConnectionsPage />
              </RequirePermission>
            }
          />

          {/* Placeholder modules */}
          <Route
            path="users/*"
            element={<ModulePlaceholder title="Users" />}
          />

          <Route
            path="network-cycles/*"
            element={<ModulePlaceholder title="Network cycles" />}
          />

          {/* Hard logout / Wizyfi */}
          <Route
            path="hard-logout"
            element={
              <RequirePermission code="hard_logout:view">
                <WizyfiOverviewPage />
              </RequirePermission>
            }
          />

          <Route
            path="hard-logout/schedule"
            element={
              <RequirePermission code="hard_logout:schedule">
                <WizyfiSchedulePage />
              </RequirePermission>
            }
          />

          <Route
            path="hard-logout/history"
            element={
              <RequirePermission code="hard_logout:view">
                <WizyfiHistoryPage />
              </RequirePermission>
            }
          />

          <Route
            path="hard-logout/:eventId"
            element={
              <RequirePermission code="hard_logout:view">
                <WizyfiEventPage />
              </RequirePermission>
            }
          />

          {/* Access plans */}
          <Route
            path="access-plans"
            element={
              <RequirePermission code="access_plans:view">
                <AccessPlansPage />
              </RequirePermission>
            }
          />

          <Route
            path="access-plans/new"
            element={
              <RequirePermission code="access_plans:create">
                <PlanEditorPage />
              </RequirePermission>
            }
          />

          <Route
            path="access-plans/:id"
            element={
              <RequirePermission code="access_plans:view">
                <PlanEditorPage />
              </RequirePermission>
            }
          />

          {/* Vouchers, sales, and transactions */}
          <Route
            path="vouchers"
            element={
              <RequirePermission code="vouchers:view">
                <VouchersPage />
              </RequirePermission>
            }
          />

          <Route
            path="sales"
            element={
              <RequirePermission code="sales:view">
                <SalesPage />
              </RequirePermission>
            }
          />

          <Route
            path="transactions"
            element={
              <RequirePermission code="transactions:view">
                <TransactionsPage />
              </RequirePermission>
            }
          />
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

      {/* 404 fallback */}
      <Route
        path="*"
        element={
          <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-center">
            <div>
              <h1 className="text-3xl font-bold text-[var(--foreground)]">
                404
              </h1>

              <p className="mt-2 text-[var(--foreground-secondary)]">
                Page not found.
              </p>
            </div>
          </div>
        }
      />
    </Routes>
  );
}
```
