// src/features/vouchers/hooks/useVouchers.ts
// CHANGED (Round 22): useVoucherSummary; every voucher change refreshes the summary.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vouchersApi } from "../../../lib/api/vouchersApi";
import { useSessionStore } from "../../../state/sessionStore";
import type { VoucherListParams } from "../../../types/voucher";

export function useVouchers(params: VoucherListParams = {}) {
  return useQuery({
    queryKey: ["vouchers", params],
    queryFn: () => vouchersApi.list(params),
    placeholderData: (prev) => prev,
  });
}

export function useVoucherSummary(planId?: string) {
  const orgId = useSessionStore((s) => s.activeOrganizationId);
  return useQuery({
    queryKey: ["vouchers-summary", orgId, planId ?? "all"],
    queryFn: () => vouchersApi.summary(planId),
    enabled: Boolean(orgId),
    refetchInterval: 60_000, // expiry and redemptions happen without a click here
  });
}

export function useVoucher(id: string | undefined) {
  return useQuery({
    queryKey: ["voucher", id],
    queryFn: () => vouchersApi.retrieve(id as string),
    enabled: Boolean(id),
  });
}

export function useRevokeVoucher() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => vouchersApi.revoke(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["vouchers-summary"] });
      queryClient.invalidateQueries({ queryKey: ["voucher", id] });
    },
  });
}
