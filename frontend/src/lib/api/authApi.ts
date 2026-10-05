import { apiClient } from "./client";
import type { Paginated } from "../../types/common";
import type { Membership, SessionUser } from "../../types/session";

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<{ access: string; refresh: string }>("/auth/login/", { email, password }),

  me: () => apiClient.get<SessionUser>("/auth/me/"),

  memberships: async () =>
    (await apiClient.get<Paginated<Membership>>("/organizations/")).results,

  createOrganization: (name: string) =>
    apiClient.post<Membership>("/organizations/create/", { name }),

  logout: (refresh: string) => apiClient.post<void>("/auth/logout/", { refresh }),
};
