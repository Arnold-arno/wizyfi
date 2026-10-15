// Endpoints: /places/, /routers/ (+test-connection), /connectors/, /devices/, /sessions/ (+disconnect).
// Credentials are write-only: they go out in connectorsApi.create and never come back.
// Credential keys are sent snake_case on purpose — the backend's camelCase parser
// would otherwise rewrite them and the adapters read "api_key" / "username" / "password".

import { apiClient } from "./client";
import type { Paginated } from "../../types/common";
import type {
  Connector,
  Device,
  HealthResult,
  Place,
  PlaceInput,
  PlaceStatus,
  Router,
  Session,
  SessionStatus,
  VendorCode,
} from "../../types/network";

export interface PlaceListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: PlaceStatus;
}
export interface DeviceListParams {
  page?: number;
  search?: string;
  place?: string;
}
export interface SessionListParams {
  page?: number;
  pageSize?: number;
  status?: SessionStatus;
  place?: string;
  device?: string;
  search?: string;
}

export const placesApi = {
  list: (p: PlaceListParams = {}) =>
    apiClient.get<Paginated<Place>>("/places/", {
      params: { page: p.page, page_size: p.pageSize, search: p.search, status: p.status },
    }),
  retrieve: (id: string) => apiClient.get<Place>(`/places/${id}/`),
  create: (input: PlaceInput) => apiClient.post<Place>("/places/", input),
  update: (id: string, input: Partial<PlaceInput> & { status?: "ACTIVE" | "ARCHIVED" }) =>
    apiClient.patch<Place>(`/places/${id}/`, input),
};

export const routersApi = {
  list: (place: string) =>
    apiClient.get<Paginated<Router>>("/routers/", { params: { place, page_size: 100 } }),
  create: (input: { place: string; connector: string; name: string; identity: string }) =>
    apiClient.post<Router>("/routers/", input),
  testConnection: (id: string) => apiClient.post<HealthResult>(`/routers/${id}/test-connection/`, {}),
};

export const connectorsApi = {
  list: (place: string) =>
    apiClient.get<Paginated<Connector>>("/connectors/", { params: { place, page_size: 100 } }),
  create: (input: { place: string; vendorCode: VendorCode; name: string; credentials: Record<string, string> }) =>
    apiClient.post<Connector>("/connectors/", input),
};

export const devicesApi = {
  list: (p: DeviceListParams = {}) =>
    apiClient.get<Paginated<Device>>("/devices/", {
      params: { page: p.page, search: p.search, place: p.place },
    }),
};

export const sessionsApi = {
  list: (p: SessionListParams = {}) =>
    apiClient.get<Paginated<Session>>("/sessions/", {
      params: {
        page: p.page,
        page_size: p.pageSize,
        status: p.status,
        place: p.place,
        device: p.device,
        search: p.search,
      },
    }),
  // Exact session by URL, idempotent on the server (doc02 §5 Live disconnect).
  disconnect: (id: string) => apiClient.post<Session>(`/sessions/${id}/disconnect/`, {}),
};
