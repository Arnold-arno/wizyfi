// Loads the profile + memberships (and so the permission list) once per page
// load, after a token exists. A 401 that survives the client's refresh retry
// means the session is dead: clear it and RequireAuth redirects to /login.

import { useEffect, useState } from "react";
import { ApiError } from "../lib/api/client";
import { authApi } from "../lib/api/authApi";
import { useSessionStore } from "../state/sessionStore";

export type BootstrapStatus = "loading" | "ready" | "error";

export function useBootstrapSession(): { status: BootstrapStatus; retry: () => void } {
  const accessToken = useSessionStore((s) => s.accessToken);
  const hasProfile = useSessionStore((s) => s.user !== null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!accessToken || hasProfile) return;
    let cancelled = false;
    setFailed(false);

    Promise.all([authApi.me(), authApi.memberships()])
      .then(([user, memberships]) => {
        if (!cancelled) useSessionStore.getState().setProfile(user, memberships);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) useSessionStore.getState().clear();
        else setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, hasProfile, attempt]);

  return {
    status: hasProfile ? "ready" : failed ? "error" : "loading",
    retry: () => setAttempt((n) => n + 1),
  };
}
