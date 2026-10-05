export type SaleStatus = "COMPLETED" | "REFUNDED" | "CANCELLED";
export type TransactionStatus = "SUCCEEDED" | "FAILED" | "REFUNDED";

export interface Sale {
  id: string;
  place: string | null;
  placeName: string | null;
  customer: string | null;
  accessPlan: string | null;
  accessPlanName: string | null;
  voucher: string | null;
  total: string; // DRF DecimalField -> string
  currency: string;
  status: SaleStatus;
  soldAt: string;
  createdAt: string;
}

export interface SalesSummary {
  totalSales: number;
  totalRevenue: string;
  refundedCount: number;
}

export interface SaleCreateInput {
  total: string;
  currency: string;
  accessPlanId?: string;
  paymentReference?: string;
}

export interface Transaction {
  id: string;
  sale: string;
  amount: string;
  currency: string;
  status: TransactionStatus;
  reference: string;
  createdAt: string;
}
