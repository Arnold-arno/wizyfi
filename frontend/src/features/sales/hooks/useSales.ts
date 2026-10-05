import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { salesApi, type SaleListParams } from "../../../lib/api/salesApi";
import { useSessionStore } from "../../../state/sessionStore";
import type { SaleCreateInput } from "../../../types/sales";

const useOrgId = () => useSessionStore((s) => s.activeOrganizationId);

export function useSales(params: SaleListParams) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["sales", orgId, params],
    queryFn: () => salesApi.list(params),
    placeholderData: (prev) => prev,
    enabled: Boolean(orgId),
  });
}

export function useSalesSummary() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["sales-summary", orgId],
    queryFn: salesApi.summary,
    enabled: Boolean(orgId),
  });
}

// A sale or refund also moves the ledger, the summary and the dashboard.
function useInvalidateCommercial() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["sales", "sales-summary", "transactions", "dashboard"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

export function useRecordSale() {
  const invalidate = useInvalidateCommercial();
  return useMutation({
    mutationFn: (input: SaleCreateInput) => salesApi.create(input),
    onSuccess: invalidate,
  });
}

export function useRefundSale() {
  const invalidate = useInvalidateCommercial();
  return useMutation({
    mutationFn: (id: string) => salesApi.refund(id),
    onSuccess: invalidate,
  });
}
