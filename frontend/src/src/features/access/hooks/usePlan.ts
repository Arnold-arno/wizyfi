// src/features/access/hooks/usePlan.ts

import { useQuery } from "@tanstack/react-query";
import { accessPlansApi } from "../../../lib/api/accessPlansApi";

export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: ["access-plan", id],
    queryFn: () => accessPlansApi.retrieve(id as string),
    enabled: Boolean(id),
  });
}
