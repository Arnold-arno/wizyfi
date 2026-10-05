// src/lib/api/session.ts
//
// The ONLY place the API client touches auth state. Swap these accessors if
// your real auth store differs (see src/state/sessionStore.ts).

import { useSessionStore } from "../../state/sessionStore";

const store = () => useSessionStore.getState();

export const getAccessToken = () => store().accessToken;
export const getRefreshToken = () => store().refreshToken;
export const getActiveOrganizationId = () => store().activeOrganizationId;
export const setTokens = (access: string, refresh: string) => store().setTokens(access, refresh);
export const clearSession = () => store().clear();
