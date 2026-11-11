// CHANGED (Round 23): account lifecycle endpoints added in backend Round 20.
import { apiClient } from "./client";
import type { Paginated } from "../../types/common";
import type { Membership, SessionUser } from "../../types/session";

export interface ProfileInput {
  fullName: string;
  phone: string;
  country: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    apiClient.post<{ access: string; refresh: string }>("/auth/login/", { email, password }),

  me: () => apiClient.get<SessionUser>("/auth/me/"),

  /** Name, phone and country only. Email and platform flags are not editable. */
  updateProfile: (input: ProfileInput) => apiClient.patch<SessionUser>("/auth/me/", input),

  memberships: async () =>
    (await apiClient.get<Paginated<Membership>>("/organizations/")).results,

  createOrganization: (name: string) =>
    apiClient.post<Membership>("/organizations/create/", { name }),

  logout: (refresh: string) => apiClient.post<void>("/auth/logout/", { refresh }),

  // --- email verification ---
  verifyEmail: (token: string) => apiClient.post<{ verified: boolean }>("/auth/verify-email/", { token }),
  resendVerification: () =>
    apiClient.post<{ verified: boolean; sent: boolean }>("/auth/resend-verification/", {}),

  // --- recovery ---
  /** Always answers the same neutral message, whether or not the address has an account. */
  requestPasswordReset: (email: string) =>
    apiClient.post<{ detail: string }>("/auth/password-reset/", { email }),
  confirmPasswordReset: (uid: string, token: string, password: string) =>
    apiClient.post<{ reset: boolean }>("/auth/password-reset/confirm/", { uid, token, password }),

  /** Revokes every refresh token on the server: the caller must sign in again. */
  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<{ changed: boolean }>("/auth/change-password/", { currentPassword, newPassword }),
};
