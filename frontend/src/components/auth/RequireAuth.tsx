import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useBootstrapSession } from "../../hooks/useBootstrapSession";
import { useSessionStore } from "../../state/sessionStore";
import { ErrorState } from "../ui/ErrorState";
import { Skeleton } from "../ui/Skeleton";

export function RequireAuth() {
  const location = useLocation();
  const accessToken = useSessionStore((s) => s.accessToken);
  const { status, retry } = useBootstrapSession();

  if (!accessToken) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (status === "error") {
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorState
          title="Couldn't load your account"
          message="The server didn't respond. Your session is still valid — try again."
          onRetry={retry}
        />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div role="status" aria-label="Loading your account" className="mx-auto flex max-w-md flex-col gap-3 p-8">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  return <Outlet />;
}
