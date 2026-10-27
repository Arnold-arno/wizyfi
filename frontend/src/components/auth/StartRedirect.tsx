// "/start" — where people land after signing in or up. Sits inside RequireAuth,
// so the profile and memberships are already loaded when this renders.
import { Navigate } from "react-router-dom";
import { useSessionStore } from "../../state/sessionStore";

export function StartRedirect() {
  const user = useSessionStore((s) => s.user);
  const hasOrg = useSessionStore((s) => s.memberships.length > 0);
  if (hasOrg) return <Navigate to="/app/dashboard" replace />;
  if (user?.isPlatformStaff) return <Navigate to="/admin" replace />;
  return <Navigate to="/onboarding" replace />;
}
