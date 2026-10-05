export type RouterStatus = "PROVISIONING" | "ONLINE" | "DEGRADED" | "OFFLINE" | "DISABLED";

export interface SalesTrendPoint {
  date: string; // YYYY-MM-DD (UTC day)
  revenue: string; // decimal string
  count: number;
}

export interface DashboardSales {
  currency: string | null;
  multipleCurrencies: boolean;
  todayRevenue: string;
  todayCount: number;
  trend: SalesTrendPoint[];
}

export interface DashboardSummary {
  generatedAt: string;
  kpis: {
    placeCount: number;
    routersOnline: number;
    routersTotal: number;
    activeSessions: number;
  };
  routerHealth: Array<{ status: RouterStatus; count: number }>;
  topPlaces: Array<{ id: string; name: string; activeSessions: number }>;
  /** null when the caller lacks sales:view. */
  sales: DashboardSales | null;
}

export type NotificationLevel = "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "CRITICAL";

export interface AppNotification {
  id: string;
  level: NotificationLevel;
  title: string;
  message: string;
  resourceType: string;
  resourceId: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}
