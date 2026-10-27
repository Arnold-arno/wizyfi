// Endpoints: /recurring-resets/ (list, create, deactivate, activate).
import { apiClient } from "./client";
import type { Paginated } from "../../types/common";
import type { RecurringReset, RecurringResetInput } from "../../types/recurring";

const B = "/recurring-resets";

export const recurringApi = {
  list: () => apiClient.get<Paginated<RecurringReset>>(`${B}/`, { params: { page_size: 100 } }),
  create: (input: RecurringResetInput) => apiClient.post<RecurringReset>(`${B}/`, input),
  deactivate: (id: string) => apiClient.post<RecurringReset>(`${B}/${id}/deactivate/`, {}),
  activate: (id: string) => apiClient.post<RecurringReset>(`${B}/${id}/activate/`, {}),
};
