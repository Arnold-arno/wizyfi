import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../../../lib/api/dashboardApi";
import { useSessionStore } from "../../../state/sessionStore";

// Org id in the key: a dashboard is only ever valid for the tenant it was
// fetched for. 30 s polling keeps freshness honest without a realtime layer
// (doc03 §6: "polling intervals appropriate to operational importance").
export function useDashboard() {
  const orgId = useSessionStore((s) => s.activeOrganizationId);
  return useQuery({
    queryKey: ["dashboard", orgId],
    queryFn: dashboardApi.summary,
    refetchInterval: 30_000,
    enabled: Boolean(orgId),
  });
}

export function useRecentNotifications(pageSize = 5) {
  const orgId = useSessionStore((s) => s.activeOrganizationId);
  return useQuery({
    queryKey: ["notifications", orgId, pageSize],
    queryFn: () => dashboardApi.notifications(pageSize),
    refetchInterval: 60_000,
    enabled: Boolean(orgId),
  });
}
