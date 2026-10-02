// src/types/accessPlan.ts
//
// Domain types for the Access Plans feature.
// Field set matches doc 08 (Data Architecture) — AccessPlan entity:
//   name, duration, quota, price, status
// and doc 09 (API Specification) endpoint inventory for /access-plans.

export type AccessPlanStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED";

/** Quota / limits block — kept separate from pricing per doc04 editor step order. */
export interface AccessPlanLimits {
  dataCapMb: number | null; // null = unlimited
  maxConcurrentDevices: number | null;
  fairUsePolicyNote?: string;
}

export interface AccessPlanAvailability {
  isPubliclyListed: boolean;
  availableFrom?: string; // ISO 8601, optional scheduling
  availableUntil?: string; // ISO 8601, optional
}

export interface AccessPlan {
  id: string;
  providerId: string;
  name: string;
  description?: string;
  price: number;
  currency: string; // ISO 4217, e.g. "UGX", "USD"
  durationMinutes: number;
  quota: AccessPlanLimits;
  availability: AccessPlanAvailability;
  status: AccessPlanStatus;
  createdAt: string;
  updatedAt: string;
}

/** Payload shape for create/update — server assigns id/timestamps. */
export interface AccessPlanInput {
  name: string;
  description?: string;
  price: number;
  currency: string;
  durationMinutes: number;
  quota: AccessPlanLimits;
  availability: AccessPlanAvailability;
  status: AccessPlanStatus;
}

export interface AccessPlanListParams {
  page?: number;
  pageSize?: number;
  status?: AccessPlanStatus;
  search?: string;
  ordering?: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
