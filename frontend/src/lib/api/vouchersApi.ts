// src/lib/api/vouchersApi.ts
//
// Endpoints per doc 09 (API Specification):
//   POST /vouchers/batches   (Generate/revoke)
//   GET  /vouchers

import { apiClient } from "./client";
import type {
  Voucher,
  VoucherBatchCreateRequest,
  VoucherBatchResult,
  VoucherListParams,
  Paginated,
} from "../../types/voucher";

const BASE = "/vouchers";

export const vouchersApi = {
  list: (params: VoucherListParams = {}) =>
    apiClient.get<Paginated<Voucher>>(`${BASE}/`, {
      params: {
        page: params.page,
        page_size: params.pageSize,
        status: params.status,
        plan_id: params.planId,
        search: params.search,
      },
    }),

  retrieve: (id: string) => apiClient.get<Voucher>(`${BASE}/${id}/`),

  revoke: (id: string) =>
    apiClient.post<Voucher>(`${BASE}/${id}/revoke/`, {}),

  createBatch: (request: VoucherBatchCreateRequest) =>
    // Idempotency key required per doc09; passed as a header so retried
    // requests with an unchanged body are recognized safely by the backend.
    apiClient.post<VoucherBatchResult>(`${BASE}/batches/`, request, {
      headers: { "Idempotency-Key": request.idempotencyKey },
    }),
};
