// src/state/sessionStore.ts
//
// ⚠️ RECONCILIATION: Expectations_and_workflow says a Zustand auth store
// already exists in your live repo. The uploaded tree doesn't contain it, so
// this is a self-contained one. If yours exists, keep it and re-point the
// accessors in src/lib/api/session.ts at it — only that file and
// usePermissions/RequireAuth read this store.
//
// Only tokens + the chosen organization id are persisted. The profile and the
// permission list are re-fetched on every load, so a role change or an
// organization suspension is picked up at the next page load.
//
// Security note: tokens in localStorage are readable by any XSS. The backend
// issues Bearer JWTs (15-min access / 7-day rotating refresh), so this is the
// matching choice today; httpOnly-cookie auth would need a backend change.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Membership, SessionUser } from "../types/session";

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  activeOrganizationId: string | null;
  user: SessionUser | null;
  memberships: Membership[];

  setTokens: (access: string, refresh: string) => void;
  setProfile: (user: SessionUser, memberships: Membership[]) => void;
  setActiveOrganization: (organizationId: string) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      activeOrganizationId: null,
      user: null,
      memberships: [],

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      setProfile: (user, memberships) => {
        const current = get().activeOrganizationId;
        const stillValid = memberships.some((m) => m.organization.id === current);
        set({
          user,
          memberships,
          activeOrganizationId: stillValid ? current : (memberships[0]?.organization.id ?? null),
        });
      },

      setActiveOrganization: (activeOrganizationId) => set({ activeOrganizationId }),

      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          activeOrganizationId: null,
          user: null,
          memberships: [],
        }),
    }),
    {
      name: "wizyfi_session",
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        activeOrganizationId: s.activeOrganizationId,
      }),
    }
  )
);

export function useActiveMembership(): Membership | null {
  return useSessionStore(
    (s) => s.memberships.find((m) => m.organization.id === s.activeOrganizationId) ?? null
  );
}
