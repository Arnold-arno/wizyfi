// UX guard only. The authority is the backend: every /platform-admin/ view
// uses IsPlatformStaff (a PlatformStaff row, active). Never infer platform
// access from an organization role (INTEGRATION_NOTES §3).

import { Navigate, Outlet } from "react-router-dom";
import { useSessionStore } from "../../state/sessionStore";

export function AdminRoute() {
  const isStaff = useSessionStore((s) => s.user?.isPlatformStaff ?? false);
  return isStaff ? <Outlet /> : <Navigate to="/" replace />;
}
