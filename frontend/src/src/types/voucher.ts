// src/types/voucher.ts
//
// Domain types for the Vouchers feature.
// State model matches doc 08: AVAILABLE / ISSUED / REDEEMED / EXPIRED / REVOKED.
// doc 04 §7 explicitly requires codes are "not unnecessarily re-exposed" —
// the list/detail shapes below only ever carry a masked code, never the
// plaintext/hash, except immediately after batch generation (see
// VoucherBatchResult) where the operator must be able to export new codes once.

export type VoucherStatus =
  | "AVAILABLE"
  | "ISSUED"
  | "REDEEMED"
  | "EXPIRED"
  | "REVOKED";

export interface Voucher {
  id: string;
  planId: string;
  planName: string;
  maskedCode: string; // e.g. "••••-7F2A" — server pre-masks, never send full code here
  status: VoucherStatus;
  issuedAt: string | null;
  redeemedAt: string | null;
  redeemedByCustomerId: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface VoucherListParams {
  page?: number;
  pageSize?: number;
  status?: VoucherStatus;
  planId?: string;
  search?: string;
}

export interface VoucherBatchRules {
  planId: string;
  quantity: number; // hard-capped client + server side, see BulkVoucherWizard
  expiresAt?: string; // ISO 8601, optional
  prefix?: string; // optional cosmetic code prefix
}

export interface VoucherBatchCreateRequest extends VoucherBatchRules {
  idempotencyKey: string; // required by doc09 for retriable commands
}

/** Only right after generation does the client ever see full codes, once. */
export interface VoucherBatchResult {
  batchId: string;
  planId: string;
  quantity: number;
  codes: string[]; // full plaintext codes — display once, offer export, then discard from memory
  createdAt: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
