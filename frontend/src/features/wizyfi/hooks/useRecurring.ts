import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { recurringApi } from "../../../lib/api/recurringApi";
import { useSessionStore } from "../../../state/sessionStore";
import type { RecurringResetInput } from "../../../types/recurring";

export function useRecurringResets() {
  const orgId = useSessionStore((s) => s.activeOrganizationId);
  return useQuery({
    queryKey: ["wizyfi", "recurring", orgId],
    queryFn: recurringApi.list,
    refetchInterval: 60_000,
    enabled: Boolean(orgId),
  });
}

// A rule change creates/cancels ordinary events, so refresh everything under "wizyfi".
export function useCreateRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecurringResetInput) => recurringApi.create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wizyfi"] }),
  });
}

export function useToggleRecurring() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activate }: { id: string; activate: boolean }) =>
      activate ? recurringApi.activate(id) : recurringApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wizyfi"] }),
  });
}
