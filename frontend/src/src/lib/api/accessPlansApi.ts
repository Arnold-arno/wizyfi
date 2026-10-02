// src/lib/api/accessPlansApi.ts
//
// Endpoints per doc 09 (API Specification):
//   GET/POST /access-plans
//   GET/PATCH /access-plans/{id}

import { apiClient } from "./client";
import type {
  AccessPlan,
  AccessPlanInput,
  AccessPlanListParams,
  Paginated,
} from "../../types/accessPlan";

const BASE = "/access-plans";

export const accessPlansApi = {
  list: (params: AccessPlanListParams = {}) =>
    apiClient.get<Paginated<AccessPlan>>(`${BASE}/`, {
      params: {
        page: params.page,
        page_size: params.pageSize,
        status: params.status,
        search: params.search,
        ordering: params.ordering,
      },
    }),

  retrieve: (id: string) => apiClient.get<AccessPlan>(`${BASE}/${id}/`),

  create: (input: AccessPlanInput) =>
    apiClient.post<AccessPlan>(`${BASE}/`, input),

  update: (id: string, input: Partial<AccessPlanInput>) =>
    apiClient.patch<AccessPlan>(`${BASE}/${id}/`, input),
};
