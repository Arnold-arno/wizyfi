// src/features/vouchers/hooks/useVoucherBatch.ts
//
// Idempotency key is generated once per wizard session (see
// BulkVoucherWizard) and reused across retries of the *same* submission,
// per doc09's idempotency requirement — a fresh key must never be minted
// on retry of the same user intent, or the safety guarantee is defeated.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { vouchersApi } from "../../../lib/api/vouchersApi";
import type { VoucherBatchCreateRequest } from "../../../types/voucher";

export function useCreateVoucherBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: VoucherBatchCreateRequest) => vouchersApi.createBatch(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
    },
  });
}
