import { apiClient } from "./client";
import type { Paginated } from "../../types/common";
import type { AppNotification, DashboardSummary } from "../../types/dashboard";

export const dashboardApi = {
  summary: () => apiClient.get<DashboardSummary>("/dashboard/"),
  notifications: (pageSize = 5) =>
    apiClient.get<Paginated<AppNotification>>("/notifications/", {
      params: { page_size: pageSize },
    }),
};
