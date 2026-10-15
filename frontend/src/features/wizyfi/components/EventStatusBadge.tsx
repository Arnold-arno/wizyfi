import { StatusBadge, type Tone } from "../../../components/ui/StatusBadge";
import type { HardLogoutStatus } from "../../../types/wizyfi";

const CONFIG: Record<HardLogoutStatus, { label: string; tone: Tone }> = {
  SCHEDULED: { label: "Scheduled", tone: "info" },
  RUNNING: { label: "Running", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  PARTIAL: { label: "Partial", tone: "warning" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export function EventStatusBadge({ status }: { status: HardLogoutStatus }) {
  return <StatusBadge label={CONFIG[status].label} tone={CONFIG[status].tone} />;
}
