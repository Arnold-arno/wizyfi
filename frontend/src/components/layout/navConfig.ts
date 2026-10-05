// Persistent provider navigation (doc02 §3/§4). Each entry is gated by the
// same permission code the backend enforces on that module's list endpoint.
// IA order follows doc02 §3: ... Access Plans → Vouchers → Network Cycles ...

import {
  Activity,
  CalendarClock,
  Layers,
  LayoutDashboard,
  MapPin,
  Power,
  Receipt,
  Smartphone,
  Ticket,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission: string;
  /** doc02 §4: Hard Logout is labelled as an independent subsystem. */
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
  {
    label: "Hard logout",
    to: "/app/hard-logout",
    icon: Power,
    permission: "hard_logout:view",
    note: "Independent system",
  },
];
