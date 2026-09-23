// src/features/vouchers/hooks/useVouchers.ts

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vouchersApi } from "../../../lib/api/vouchersApi";
import type { VoucherListParams } from "../../../types/voucher";

export function useVouchers(params: VoucherListParams = {}) {
  return useQuery({
    queryKey: ["vouchers", params],
    queryFn: () => vouchersApi.list(params),
    placeholderData: (prev) => prev,
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
      queryClient.invalidateQueries({ queryKey: ["voucher", id] });
    },
  });
}
