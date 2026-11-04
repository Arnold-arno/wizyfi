// src/lib/api/vouchersApi.ts
//
// Endpoints per doc 09 (API Specification):
//   POST /vouchers/batches   (Generate/revoke)
//   GET  /vouchers, GET /vouchers/summary
// CHANGED (Round 22): the plan filter was sent as `plan_id` but the backend filters on
// `plan`, so it never filtered. Adds batch filter and summary.

import { apiClient } from "./client";
import type {
  Voucher,
  VoucherBatchCreateRequest,
  VoucherBatchResult,
  VoucherListParams,
  VoucherSummary,
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
        plan: params.planId,
        batch_id: params.batchId,
        search: params.search,
      },
    }),

  summary: (planId?: string) => apiClient.get<VoucherSummary>(`${BASE}/summary/`, { params: { plan: planId } }),

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
