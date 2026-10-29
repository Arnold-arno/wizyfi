// Persistent provider navigation (doc02 §3/§4). Each entry is gated by the same
// permission code the backend enforces on that module's list endpoint.
// CHANGED (Round 19): adds "Activity log" (audit:view, owner/admin).

import {
  Activity, CalendarClock, Layers, LayoutDashboard, MapPin, Power, Receipt,
  ScrollText, Smartphone, Ticket, TrendingUp, Users, type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission: string;
  note?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/app/dashboard", icon: LayoutDashboard, permission: "places:view" },
  { label: "Places", to: "/app/places", icon: MapPin, permission: "places:view" },
  { label: "Devices", to: "/app/devices", icon: Smartphone, permission: "devices:view" },
  { label: "Live connections", to: "/app/connections", icon: Activity, permission: "connections:view" },
  { label: "Users", to: "/app/users", icon: Users, permission: "customers:view" },
  { label: "Access plans", to: "/app/access-plans", icon: Layers, permission: "access_plans:view" },
  { label: "Vouchers", to: "/app/vouchers", icon: Ticket, permission: "vouchers:view" },
  { label: "Network cycles", to: "/app/network-cycles", icon: CalendarClock, permission: "network_cycles:view" },
  { label: "Sales", to: "/app/sales", icon: TrendingUp, permission: "sales:view" },
  { label: "Transactions", to: "/app/transactions", icon: Receipt, permission: "transactions:view" },
  { label: "Wizyfi", to: "/app/hard-logout", icon: Power, permission: "hard_logout:view", note: "Hard logout · independent system" },
  { label: "Activity log", to: "/app/audit", icon: ScrollText, permission: "audit:view" },
];
