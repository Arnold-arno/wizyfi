import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  connectorsApi,
  devicesApi,
  placesApi,
  routersApi,
  sessionsApi,
  type DeviceListParams,
  type PlaceListParams,
  type SessionListParams,
} from "../../../lib/api/networkApi";
import { useSessionStore } from "../../../state/sessionStore";
import type { PlaceInput } from "../../../types/network";

const useOrgId = () => useSessionStore((s) => s.activeOrganizationId);

export function usePlaces(params: PlaceListParams) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["net", "places", orgId, params],
    queryFn: () => placesApi.list(params),
    placeholderData: (prev) => prev,
    enabled: Boolean(orgId),
  });
}

/** Up to 100 places for dropdown filters. */
export function usePlaceOptions() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["net", "place-options", orgId],
    queryFn: () => placesApi.list({ pageSize: 100 }),
    enabled: Boolean(orgId),
  });
}

export function usePlace(id: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["net", "place", orgId, id],
    queryFn: () => placesApi.retrieve(id as string),
    enabled: Boolean(orgId && id),
  });
}

export function useCreatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceInput) => placesApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["net"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdatePlace(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<PlaceInput> & { status?: "ACTIVE" | "ARCHIVED" }) => placesApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["net"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRouters(placeId: string | undefined, enabled = true) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["net", "routers", orgId, placeId],
    queryFn: () => routersApi.list(placeId as string),
    enabled: Boolean(orgId && placeId && enabled),
  });
}

export function useConnectors(placeId: string | undefined, enabled = true) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["net", "connectors", orgId, placeId],
    queryFn: () => connectorsApi.list(placeId as string),
    enabled: Boolean(orgId && placeId && enabled),
  });
}

export function useCreateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: connectorsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["net", "connectors"] }),
  });
}

export function useCreateRouter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: routersApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["net"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (routerId: string) => routersApi.testConnection(routerId),
    // The test persists the router's new status server-side; refresh from it.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["net", "routers"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDevices(params: DeviceListParams) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["net", "devices", orgId, params],
    queryFn: () => devicesApi.list(params),
    placeholderData: (prev) => prev,
    enabled: Boolean(orgId),
  });
}

export function useSessions(params: SessionListParams, opts: { pollMs?: number | false; enabled?: boolean } = {}) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["net", "sessions", orgId, params],
    queryFn: () => sessionsApi.list(params),
    placeholderData: (prev) => prev,
    refetchInterval: opts.pollMs ?? false,
    enabled: Boolean(orgId) && (opts.enabled ?? true),
  });
}

export function useDisconnectSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sessionsApi.disconnect(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["net"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
