// Platform (Super Admin) shapes. Strict allow-lists on the server: aggregate
// counts and account metadata only — never network or customer data.

export type AgentStatus = "ACTIVE" | "SUSPENDED";
export type GrowthRange = "7d" | "30d" | "3m" | "6m" | "1y";

export interface GrowthPoint {
  date: string; // YYYY-MM-DD (UTC)
  total: number; // cumulative at the end of the bucket
  new: number; // created inside the bucket
}

export interface PlatformDashboard {
  totalAgents: number;
  activeAgents: number;
  suspendedAgents: number;
  totalPlaces: number;
  totalActiveSessions: number;
  newAgentsThisMonth: number;
  newPlacesThisMonth: number;
  /** Decimal string. Expected from subscriptions — NOT collected money. */
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
  lastActiveAt: string | null;
  createdAt: string;
}

export interface PlanSummary {
  id: string;
  name: string;
  maxPlaces: number | null;
  price: string;
  billingPeriod: "MONTHLY" | "ANNUAL";
}

export interface AgentDetail {
  id: string;
  name: string;
  status: AgentStatus;
  placeCount: number;
  customerCount: number;
  activeSessionCount: number;
  plan: PlanSummary | null;
  ownerEmail: string | null;
  ownerName: string | null;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface PlatformPlan extends PlanSummary {
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
}

export interface PlatformPlanInput {
  name: string;
  maxPlaces: number | null;
  price: string;
  billingPeriod: "MONTHLY" | "ANNUAL";
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
