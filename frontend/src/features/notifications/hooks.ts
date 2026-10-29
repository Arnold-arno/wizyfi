import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { notificationsApi } from "../../lib/api/notificationsApi";
import { useSessionStore } from "../../state/sessionStore";
import type { NotificationLevel } from "../../types/dashboard";

const useOrgId = () => useSessionStore((s) => s.activeOrganizationId);

export function useNotifications(params: { page?: number; pageSize?: number; level?: NotificationLevel }, pollMs: number | false = false) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["notifications", "list", orgId, params],
    queryFn: () => notificationsApi.list(params),
    placeholderData: (prev) => prev,
    refetchInterval: pollMs,
    enabled: Boolean(orgId),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** "Seen up to" time, kept per organization on this device. Broadcast rows can't
 *  carry a per-person read flag, so the bell badge counts items newer than the
 *  last time this person opened the bell or the notifications page. */
export function useSeenAt() {
  const orgId = useOrgId();
  const key = `wizyfi_notif_seen:${orgId ?? "none"}`;
  const read = () => {
    try {
      return Number(localStorage.getItem(key)) || 0;
    } catch {
      return 0;
    }
  };
  const [seenAt, setSeen] = useState<number>(read);
  const markSeen = useCallback(() => {
    const now = Date.now();
    setSeen(now);
    try {
      localStorage.setItem(key, String(now));
    } catch {
      /* ignore */
    }
  }, [key]);
  return { seenAt, markSeen };
}
