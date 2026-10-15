// Wizyfi = the Hard Logout system, a first-party Wizyfi Bridge product.
// Shapes mirror HardLogoutEventSerializer (camelCased by the backend renderer).

export type HardLogoutScope = "ROUTER" | "ROUTERS" | "PLACE";
export type HardLogoutStatus =
  | "SCHEDULED"
  | "RUNNING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED";
export type TargetStatus = "ATTEMPTED" | "SUCCEEDED" | "FAILED";

export const TERMINAL_STATUSES: ReadonlySet<HardLogoutStatus> = new Set<HardLogoutStatus>([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

export interface HardLogoutTarget {
  id: string;
  router: string;
  status: TargetStatus;
  attemptedAt: string;
  completedAt: string | null;
  errorCode: string;
  errorMessage: string;
}

export interface HardLogoutEvent {
  id: string;
  place: string;
  scopeType: HardLogoutScope;
  routerIds: string[];
  scheduledAt: string;
  scheduledTimezone: string;
  impactEstimateConnections: number | null;
  createdBy: string;
  status: HardLogoutStatus;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string;
  succeededCount: number;
  failedCount: number;
  targetResults: HardLogoutTarget[];
  createdAt: string;
}

export interface HardLogoutScheduleInput {
  place: string;
  scopeType: HardLogoutScope;
  routerIds: string[];
  scheduledAt: string; // ISO 8601, UTC instant
  scheduledTimezone: string; // IANA zone the operator chose the time in
  impactEstimateConnections?: number | null;
  idempotencyKey: string;
}

export interface PlaceLite {
  id: string;
  name: string;
  timezone: string;
  status: string;
}

export interface RouterLite {
  id: string;
  name: string;
  status: "PROVISIONING" | "ONLINE" | "DEGRADED" | "OFFLINE" | "DISABLED";
  place: string;
}
