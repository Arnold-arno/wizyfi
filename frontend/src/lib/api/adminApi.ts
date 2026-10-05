// Super Admin endpoints under /platform-admin/. Note: the agents list is a
// plain array on the server (not paginated) — see DELIVERY_NOTES.

import { apiClient } from "./client";
import type { Paginated } from "../../types/common";
import type {
  AgentDetail,
  AgentListItem,
  PlatformActivity,
  PlatformDashboard,
  PlatformPlan,
  PlatformPlanInput,
} from "../../types/admin";

const B = "/platform-admin";

export const adminApi = {
  dashboard: () => apiClient.get<PlatformDashboard>(`${B}/dashboard/`),

  agents: () => apiClient.get<AgentListItem[]>(`${B}/agents/`),
  agent: (id: string) => apiClient.get<AgentDetail>(`${B}/agents/${id}/`),
  suspendAgent: (id: string, reason: string) =>
    apiClient.post<AgentDetail>(`${B}/agents/${id}/suspend/`, { reason }),
  restoreAgent: (id: string) => apiClient.post<AgentDetail>(`${B}/agents/${id}/restore/`, {}),
  changeAgentPlan: (id: string, planId: string) =>
    apiClient.post<AgentDetail>(`${B}/agents/${id}/change-plan/`, { planId }),

  plans: (params: { status?: "ACTIVE" | "ARCHIVED"; page?: number } = {}) =>
    apiClient.get<Paginated<PlatformPlan>>(`${B}/plans/`, {
      params: { status: params.status, page: params.page, page_size: 100 },
    }),
  createPlan: (input: PlatformPlanInput) => apiClient.post<PlatformPlan>(`${B}/plans/`, input),
  updatePlan: (id: string, input: Partial<PlatformPlanInput>) =>
    apiClient.patch<PlatformPlan>(`${B}/plans/${id}/`, input),

  activity: (page = 1) =>
    apiClient.get<Paginated<PlatformActivity>>(`${B}/activity/`, { params: { page } }),
};
