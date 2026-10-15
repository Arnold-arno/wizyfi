import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { wizyfiApi, type EventListParams } from "../../../lib/api/wizyfiApi";
import { useSessionStore } from "../../../state/sessionStore";
import { TERMINAL_STATUSES, type HardLogoutScheduleInput } from "../../../types/wizyfi";

const useOrgId = () => useSessionStore((s) => s.activeOrganizationId);

export function useHardLogoutEvents(params: EventListParams, pollMs: number | false = false) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["wizyfi", "events", orgId, params],
    queryFn: () => wizyfiApi.list(params),
    placeholderData: (prev) => prev,
    refetchInterval: pollMs,
    enabled: Boolean(orgId),
  });
}

// Polls only while the event can still change; stops at a terminal state.
// The server owns the lifecycle — the page reconstructs it from here, never
// from browser state (doc03 §12).
export function useHardLogoutEvent(id: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["wizyfi", "event", orgId, id],
    queryFn: () => wizyfiApi.retrieve(id as string),
    enabled: Boolean(orgId && id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !TERMINAL_STATUSES.has(status) ? 5_000 : false;
    },
  });
}

export function useScheduleHardLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HardLogoutScheduleInput) => wizyfiApi.schedule(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wizyfi"] }),
  });
}

export function useCancelHardLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => wizyfiApi.cancel(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wizyfi"] }),
  });
}

export function usePlacesLite() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["wizyfi", "places", orgId],
    queryFn: wizyfiApi.places,
    enabled: Boolean(orgId),
  });
}

export function useRoutersLite(placeId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["wizyfi", "routers", orgId, placeId],
    queryFn: () => wizyfiApi.routers(placeId as string),
    enabled: Boolean(orgId && placeId),
  });
}

export function useImpactEstimate(
  scope: { mode: "PLACE" | "ROUTERS"; placeId: string; routerIds: string[] } | null
) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["wizyfi", "impact", orgId, scope],
    queryFn: () => wizyfiApi.estimateImpact(scope as NonNullable<typeof scope>),
    enabled: Boolean(orgId && scope),
    staleTime: 0,
  });
}
