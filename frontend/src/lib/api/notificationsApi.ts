// Endpoints: GET /notifications/, POST /notifications/mark-all-read/.
// Broadcast notifications (organization-wide) are one shared row, so the server
// deliberately never marks THOSE read for a single member; mark-all-read only
// touches notifications addressed to the caller.
import { apiClient } from "./client";
import type { Paginated } from "../../types/common";
import type { AppNotification, NotificationLevel } from "../../types/dashboard";

export const notificationsApi = {
  list: (p: { page?: number; pageSize?: number; level?: NotificationLevel } = {}) =>
    apiClient.get<Paginated<AppNotification>>("/notifications/", {
      params: { page: p.page, page_size: p.pageSize, level: p.level },
    }),
  markAllRead: () => apiClient.post<{ markedCount: number }>("/notifications/mark-all-read/", {}),
};
