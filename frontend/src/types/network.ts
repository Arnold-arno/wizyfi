// Shapes for Places, Routers, Connectors, Devices and Sessions (Live connections).
// Mirror the DRF serializers; camelCased by the backend renderer.
import type { RouterStatus } from "./dashboard";

export type PlaceStatus = "SETUP" | "ACTIVE" | "ARCHIVED";

export interface Place {
  id: string;
  name: string;
  timezone: string;
  address: string;
  status: PlaceStatus;
  routerCount: number;
  activeConnectionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceInput {
  name: string;
  timezone: string;
  address: string;
}

export interface Router {
  id: string;
  place: string;
  connector: string;
  name: string;
  identity: string;
  status: RouterStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

export type VendorCode = "MIKROTIK" | "WIZYFI";

export interface Connector {
  id: string;
  place: string;
  vendorCode: VendorCode;
  name: string;
  status: "PENDING_VERIFICATION" | "VERIFIED" | "FAILING";
  lastVerifiedAt: string | null;
  createdAt: string;
}

export interface HealthResult {
  healthy: boolean;
  latencyMs: number | null;
  checkedAt: string;
  detail: string;
}

export interface Device {
  id: string;
  place: string;
  placeName: string | null;
  router: string | null;
  routerName: string | null;
  macAddress: string;
  hostname: string;
  lastSeenAt: string | null;
  createdAt: string;
}

export type SessionStatus = "PENDING" | "ACTIVE" | "EXPIRING" | "EXPIRED" | "DISCONNECTED" | "FAILED";

export interface Session {
  id: string;
  customer: string;
  customerLabel: string;
  device: string | null;
  router: string;
  routerName: string | null;
  place: string;
  placeName: string | null;
  accessPlan: string | null;
  accessPlanName: string | null;
  voucher: string | null;
  startedAt: string;
  expiresAt: string | null;
  endedAt: string | null;
  status: SessionStatus;
  /** True when the end time was taken from a scheduled Wizyfi reset. */
  endsWithReset: boolean;
}
