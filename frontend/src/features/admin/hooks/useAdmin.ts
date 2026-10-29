import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../../lib/api/adminApi";
import type { AgentDetail, GrowthRange, PlatformPlanInput } from "../../../types/admin";

// NOTE: moved from features/admin/hooks/useAdmin.ts — same path, same exports,
// plus the range-aware dashboard hook and per-agent activity.

export const usePlatformDashboard = (range: GrowthRange = "30d") =>
  useQuery({
    queryKey: ["admin", "dashboard", range],
    queryFn: () => adminApi.dashboard(range),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev, // keep the charts on screen while a new range loads
  });

export const useAgents = () => useQuery({ queryKey: ["admin", "agents"], queryFn: adminApi.agents });

export const useAgent = (id: string | undefined) =>
  useQuery({ queryKey: ["admin", "agent", id], queryFn: () => adminApi.agent(id as string), enabled: Boolean(id) });

export const usePlatformPlans = (status?: "ACTIVE" | "ARCHIVED") =>
  useQuery({ queryKey: ["admin", "plans", status ?? "all"], queryFn: () => adminApi.plans({ status }) });

export const usePlatformActivity = (page: number) =>
  useQuery({
    queryKey: ["admin", "activity", page],
    queryFn: () => adminApi.activity(page),
    placeholderData: (prev) => prev,
  });

export const useAgentActivity = (organizationId: string | undefined) =>
  useQuery({
    queryKey: ["admin", "activity", "agent", organizationId],
    queryFn: () => adminApi.activity(1, organizationId),
    enabled: Boolean(organizationId),
  });

// Every agent mutation returns the fresh AgentDetail: put it straight into the
// cache and refresh the lists/counters that depend on it.
function useAgentMutation<V>(fn: (id: string, v: V) => Promise<AgentDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: V }) => fn(id, value),
    onSuccess: (detail) => {
      qc.setQueryData(["admin", "agent", detail.id], detail);
      qc.invalidateQueries({ queryKey: ["admin", "agents"] });
      qc.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin", "activity"] });
    },
  });
}

export const useSuspendAgent = () => useAgentMutation<string>(adminApi.suspendAgent);
export const useRestoreAgent = () => useAgentMutation<void>((id) => adminApi.restoreAgent(id));
export const useChangeAgentPlan = () => useAgentMutation<string>(adminApi.changeAgentPlan);

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PlatformPlanInput }) =>
      id ? adminApi.updatePlan(id, input) : adminApi.createPlan(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "plans"] }),
  });
}
