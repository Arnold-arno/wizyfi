// Replaces src/app.tsx. NOTE the capital A: main.tsx imports "./App", and on
// Linux/macOS-case-sensitive filesystems (and CI) "app.tsx" would not resolve.
//
// Routes follow doc04 §2 and the canonical navigation map. Modules whose pages
// are NOT part of the uploaded tree use <ModulePlaceholder/>. Expectations_and_
// workflow says Places/Dashboard etc. exist in your live repo — replace each
// placeholder element with your real page when merging.

import { Navigate, Route, Routes } from "react-router-dom";
import { AdminRoute } from "./components/auth/AdminRoute";
import { RequireAuth } from "./components/auth/RequireAuth";
import { RequirePermission } from "./components/auth/RequirePermission";
import { AppLayout } from "./components/layout/AppLayout";
import { EmptyState } from "./components/ui/EmptyState";
import { AccessPlansPage } from "./features/access/pages/AccessPlansPage";
import { PlanEditorPage } from "./features/access/pages/PlanEditorPage";
import { ActivityPage } from "./features/admin/pages/ActivityPage";
import { AdminLayout } from "./features/admin/components/AdminLayout";
import { AdminDashboardPage } from "./features/admin/pages/AdminDashboardPage";
import { AgentDetailPage } from "./features/admin/pages/AgentDetailPage";
import { AgentsPage } from "./features/admin/pages/AgentsPage";
import { PlansPage } from "./features/admin/pages/PlansPage";
import { LoginPage } from "./features/auth/LoginPage";
import { OnboardingPage } from "./features/auth/OnboardingPage";
import { DashboardPage } from "./features/dashboard/pages/DashboardPage";
import { SalesPage } from "./features/sales/pages/SalesPage";
import { TransactionsPage } from "./features/transactions/pages/TransactionsPage";
import { VouchersPage } from "./features/vouchers/pages/VouchersPage";
import { useSessionStore } from "./state/sessionStore";

function ModulePlaceholder({ title }: { title: string }) {
  return (
    <EmptyState
      title={title}
      description="This screen isn't wired into this build yet. Replace this placeholder with your page."
    />
  );
}

/** "/" — decides the landing page once the profile has loaded. */
function RootRedirect() {
  const user = useSessionStore((s) => s.user);
  const hasOrg = useSessionStore((s) => s.memberships.length > 0);
  if (hasOrg) return <Navigate to="/app/dashboard" replace />;
  return <Navigate to={user?.isPlatformStaff ? "/admin" : "/onboarding"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAuth />}>
        <Route index element={<RootRedirect />} />
        <Route path="onboarding" element={<OnboardingPage />} />

        <Route path="app" element={<AppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />

          <Route path="places/*" element={<ModulePlaceholder title="Places" />} />
          <Route path="devices/*" element={<ModulePlaceholder title="Devices" />} />
          <Route path="connections/*" element={<ModulePlaceholder title="Live connections" />} />
          <Route path="users/*" element={<ModulePlaceholder title="Users" />} />
          <Route path="network-cycles/*" element={<ModulePlaceholder title="Network cycles" />} />
          <Route path="hard-logout/*" element={<ModulePlaceholder title="Hard logout" />} />

          <Route path="access-plans" element={<RequirePermission code="access_plans:view"><AccessPlansPage /></RequirePermission>} />
          <Route path="access-plans/new" element={<RequirePermission code="access_plans:create"><PlanEditorPage /></RequirePermission>} />
          <Route path="access-plans/:id" element={<RequirePermission code="access_plans:view"><PlanEditorPage /></RequirePermission>} />
          <Route path="vouchers" element={<RequirePermission code="vouchers:view"><VouchersPage /></RequirePermission>} />
          <Route path="sales" element={<RequirePermission code="sales:view"><SalesPage /></RequirePermission>} />
          <Route path="transactions" element={<RequirePermission code="transactions:view"><TransactionsPage /></RequirePermission>} />
        </Route>

        <Route path="admin" element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="agents/:id" element={<AgentDetailPage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="activity" element={<ActivityPage />} />
          </Route>
        </Route>
      </Route>

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
