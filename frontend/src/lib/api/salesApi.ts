// Endpoints: GET/POST /sales/, GET /sales/summary/, POST /sales/{id}/refund/,
// GET /transactions/ (read-only ledger).

import { apiClient } from "./client";
import type { Paginated } from "../../types/common";
import type {
  Sale,
  SaleCreateInput,
  SaleStatus,
  SalesSummary,
  Transaction,
  TransactionStatus,
} from "../../types/sales";

export interface SaleListParams {
  page?: number;
  status?: SaleStatus;
}

export interface TransactionListParams {
  page?: number;
  status?: TransactionStatus;
  sale?: string;
}

export const salesApi = {
  list: (p: SaleListParams = {}) =>
    apiClient.get<Paginated<Sale>>("/sales/", { params: { page: p.page, status: p.status } }),

  summary: () => apiClient.get<SalesSummary>("/sales/summary/"),

  create: (input: SaleCreateInput) => apiClient.post<Sale>("/sales/", input),

  refund: (id: string) => apiClient.post<Sale>(`/sales/${id}/refund/`, {}),
};

export const transactionsApi = {
  list: (p: TransactionListParams = {}) =>
    apiClient.get<Paginated<Transaction>>("/transactions/", {
      params: { page: p.page, status: p.status, sale: p.sale },
    }),
};
