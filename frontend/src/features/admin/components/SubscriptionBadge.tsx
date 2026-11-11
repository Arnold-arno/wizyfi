// Subscription status comes from apps.billing; its exact enum isn't part of this
// frontend's contract, so unknown values fall back to a neutral badge with the
// humanized text (status is always text + dot, never colour alone).
import { StatusBadge, type Tone } from "../../../components/ui/StatusBadge";

const TONE: Record<string, Tone> = {
  ACTIVE: "success",
  TRIALING: "info",
  TRIAL: "info",
  PAST_DUE: "danger",
  OVERDUE: "danger",
  RESTRICTED: "warning",
};

const humanize = (s: string) => {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function SubscriptionBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-sm text-[var(--foreground-muted)]">No subscription</span>;
  return <StatusBadge label={humanize(status)} tone={TONE[status] ?? "muted"} />;
}
