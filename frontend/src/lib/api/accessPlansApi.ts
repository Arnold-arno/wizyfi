// src/lib/api/accessPlansApi.ts
//
// CHANGED (bug fix): DRF serialises DecimalField as a *string* ("1000.00"),
// but AccessPlan.price is typed `number` and PlanTable/PlanPreview call
// price.toFixed(2) — which throws on a string at runtime. Normalising once
// here, at the API boundary, makes the declared type true everywhere.

import { apiClient } from "./client";
import type {
  AccessPlan,
  AccessPlanInput,
  AccessPlanListParams,
  Paginated,
} from "../../types/accessPlan";

const BASE = "/access-plans";

const normalise = (plan: AccessPlan): AccessPlan => ({ ...plan, price: Number(plan.price) });

export const accessPlansApi = {
  list: async (params: AccessPlanListParams = {}) => {
    const page = await apiClient.get<Paginated<AccessPlan>>(`${BASE}/`, {
      params: {
        page: params.page,
        page_size: params.pageSize,
        status: params.status,
        search: params.search,
        ordering: params.ordering,
      },
    });
    return { ...page, results: page.results.map(normalise) };
  },

  retrieve: async (id: string) => normalise(await apiClient.get<AccessPlan>(`${BASE}/${id}/`)),

  create: async (input: AccessPlanInput) =>
    normalise(await apiClient.post<AccessPlan>(`${BASE}/`, input)),

  update: async (id: string, input: Partial<AccessPlanInput>) =>
    normalise(await apiClient.patch<AccessPlan>(`${BASE}/${id}/`, input)),
};
