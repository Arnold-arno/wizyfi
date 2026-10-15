// Status is always text + dot, never colour alone (doc02 §9).
import { StatusBadge, type Tone } from "../../../components/ui/StatusBadge";
import type { RouterStatus } from "../../../types/dashboard";
import type { PlaceStatus, SessionStatus } from "../../../types/network";

const PLACE: Record<PlaceStatus, { label: string; tone: Tone }> = {
  SETUP: { label: "Setting up", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  ARCHIVED: { label: "Archived", tone: "muted" },
};
const ROUTER: Record<RouterStatus, { label: string; tone: Tone }> = {
  PROVISIONING: { label: "Provisioning", tone: "info" },
  ONLINE: { label: "Online", tone: "success" },
  DEGRADED: { label: "Degraded", tone: "warning" },
  OFFLINE: { label: "Offline", tone: "danger" },
  DISABLED: { label: "Disabled", tone: "muted" },
};
const SESSION: Record<SessionStatus, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "info" },
  ACTIVE: { label: "Active", tone: "success" },
  EXPIRING: { label: "Expiring", tone: "warning" },
  EXPIRED: { label: "Expired", tone: "muted" },
  DISCONNECTED: { label: "Disconnected", tone: "muted" },
  FAILED: { label: "Failed", tone: "danger" },
};

export const PlaceStatusBadge = ({ status }: { status: PlaceStatus }) => (
  <StatusBadge label={PLACE[status].label} tone={PLACE[status].tone} />
);
export const RouterStatusBadge = ({ status }: { status: RouterStatus }) => (
  <StatusBadge label={ROUTER[status].label} tone={ROUTER[status].tone} />
);
export const SessionStatusBadge = ({ status }: { status: SessionStatus }) => (
  <StatusBadge label={SESSION[status].label} tone={SESSION[status].tone} />
);
