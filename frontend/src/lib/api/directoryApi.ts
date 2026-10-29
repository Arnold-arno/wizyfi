// Endpoints: /customers/ (list, create) and /network-cycles/ (list, create, delete).
// Both exist on the backend today (apps.customers, apps.access NetworkCycleViewSet).
import { apiClient } from "./client";
import type { Paginated } from "../../types/common";

export type CustomerStatus = "ACTIVE" | "BLOCKED";
export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  macAddress: string;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}
export interface CustomerInput {
  fullName: string;
  phone: string;
  macAddress: string;
}

export type CycleStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export interface NetworkCycle {
  id: string;
  place: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: CycleStatus;
  createdAt: string;
}
export interface NetworkCycleInput {
  place: string;
  name: string;
  startsAt: string; // ISO 8601
  endsAt: string;
}

export const customersApi = {
  list: (p: { page?: number; search?: string; status?: CustomerStatus } = {}) =>
    apiClient.get<Paginated<Customer>>("/customers/", { params: { page: p.page, search: p.search, status: p.status } }),
  create: (input: CustomerInput) => apiClient.post<Customer>("/customers/", input),
};

export const cyclesApi = {
  list: (p: { page?: number; place?: string; status?: CycleStatus } = {}) =>
    apiClient.get<Paginated<NetworkCycle>>("/network-cycles/", { params: { page: p.page, place: p.place, status: p.status } }),
  create: (input: NetworkCycleInput) => apiClient.post<NetworkCycle>("/network-cycles/", input),
  remove: (id: string) => apiClient.delete<void>(`/network-cycles/${id}/`),
};
