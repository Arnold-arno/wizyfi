// Platform (Super Admin) shapes. Strict allow-lists on the server: aggregate
// counts and account metadata only — never network or customer data.
// CHANGED (Round 23): matches backend Round 20 (billing fields, plan entitlements,
// networks = routers, places counted separately, paginated agents list).
import type { VendorCode } from "./network";

export type AgentStatus = "ACTIVE" | "SUSPENDED";
export type GrowthRange = "7d" | "30d" | "3m" | "6m" | "1y";
export type BillingPeriod = "MONTHLY" | "ANNUAL";

export interface GrowthPoint {
  date: string; // YYYY-MM-DD (UTC)
  total: number; // cumulative at the end of the bucket
  new: number; // created inside the bucket
}

export interface PlatformDashboard {
  totalAgents: number;
  activeAgents: number;
  suspendedAgents: number;
  /** Non-archived places. */
  totalPlaces: number;
  /** "Networks" = routers. */
  totalNetworks: number;
  totalActiveSessions: number;
  newAgentsThisMonth: number;
  newPlacesThisMonth: number;
  newNetworksThisMonth: number;
  /** Decimal string, USD. Expected from subscriptions — NOT collected money. */
  expectedMonthlyRevenue: string;
  range: GrowthRange;
  agentGrowth: GrowthPoint[];
  networkGrowth: GrowthPoint[];
}

export interface AgentListItem {
  id: string;
  name: string;
  status: AgentStatus;
  placeCount: number;
  maxPlaces: number | null;
  planName: string | null;
  /** Backend enum (apps.billing); kept as a string so a new value never breaks the UI. */
  subscriptionStatus: string | null;
  /** Open invoices, decimal string, USD. */
  amountDue: string;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface AgentListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: AgentStatus;
  /** name | created_at | place_count | last_active, optionally prefixed with "-". */
  ordering?: string;
}

export interface PlanSummary {
  id: string;
  name: string;
  maxPlaces: number | null;
  maxNetworks: number | null;
  allowedVendors: string[];
  price: string;
  currency: string;
  billingPeriod: BillingPeriod;
}

export interface AgentDetail {
  id: string;
  name: string;
  status: AgentStatus;
  placeCount: number;
  networkCount: number;
  customerCount: number;
  activeSessionCount: number;
  plan: PlanSummary | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  amountDue: string;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerEmailVerified: boolean;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface PlatformPlan extends PlanSummary {
  description: string;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
}

export interface PlatformPlanInput {
  name: string;
  description: string;
  price: string;
  currency: "USD"; // USD-only commercial model (PlanSerializer)
  billingPeriod: BillingPeriod;
  maxPlaces: number | null;
  maxNetworks: number | null;
  allowedVendors: VendorCode[];
  status: "ACTIVE" | "ARCHIVED";
}

export interface PlatformActivity {
  id: string;
  organizationId: string;
  organizationName: string;
  action: string;
  message: string;
  createdAt: string;
}
