// src/features/access/hooks/usePlans.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { accessPlansApi } from "../../../lib/api/accessPlansApi";
import type {
  AccessPlanInput,
  AccessPlanListParams,
} from "../../../types/accessPlan";

const plansKey = (params: AccessPlanListParams) => ["access-plans", params] as const;

export function usePlans(params: AccessPlanListParams = {}) {
  return useQuery({
    queryKey: plansKey(params),
    queryFn: () => accessPlansApi.list(params),
    placeholderData: (prev) => prev, // keep table populated while paging
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AccessPlanInput) => accessPlansApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["access-plans"] });
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AccessPlanInput> }) =>
      accessPlansApi.update(id, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["access-plans"] });
      queryClient.invalidateQueries({ queryKey: ["access-plan", variables.id] });
    },
  });
}
