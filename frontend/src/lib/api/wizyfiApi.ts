// Endpoints: /hard-logout-events/ (list, create, retrieve, cancel),
// plus read-only lookups the scheduler needs (/places/, /routers/, /sessions/).

import { apiClient } from "./client";
import type { Paginated } from "../../types/common";
import type {
  HardLogoutEvent,
  HardLogoutScheduleInput,
  HardLogoutStatus,
  PlaceLite,
  RouterLite,
} from "../../types/wizyfi";

const B = "/hard-logout-events";

export interface EventListParams {
  page?: number;
  status?: HardLogoutStatus;
  place?: string;
}

const countActiveSessions = (params: { place?: string; router?: string }) =>
  apiClient
    .get<Paginated<unknown>>("/sessions/", { params: { status: "ACTIVE", page_size: 1, ...params } })
    .then((r) => r.count);

export const wizyfiApi = {
  list: (p: EventListParams = {}) =>
    apiClient.get<Paginated<HardLogoutEvent>>(`${B}/`, {
      params: { page: p.page, status: p.status, place: p.place },
    }),

  retrieve: (id: string) => apiClient.get<HardLogoutEvent>(`${B}/${id}/`),

  // Idempotency-Key header: a retried submit returns the same event (doc09, HL-04).
  schedule: ({ idempotencyKey, ...body }: HardLogoutScheduleInput) =>
    apiClient.post<HardLogoutEvent>(`${B}/`, body, { headers: { "Idempotency-Key": idempotencyKey } }),

  cancel: (id: string, reason: string) =>
    apiClient.post<HardLogoutEvent>(`${B}/${id}/cancel/`, { reason }),

  places: () => apiClient.get<Paginated<PlaceLite>>("/places/", { params: { page_size: 100 } }),

  routers: (place: string) =>
    apiClient.get<Paginated<RouterLite>>("/routers/", { params: { place, page_size: 100 } }),

  /** Currently-active sessions in scope. An ESTIMATE: it can change before execution. */
  estimateImpact: async (scope: { mode: "PLACE" | "ROUTERS"; placeId: string; routerIds: string[] }) => {
    if (scope.mode === "PLACE") return countActiveSessions({ place: scope.placeId });
    const counts = await Promise.all(scope.routerIds.map((router) => countActiveSessions({ router })));
    return counts.reduce((a, b) => a + b, 0);
  },
};
