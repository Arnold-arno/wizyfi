// First-run guidance: derived ONLY from real data (counts the dashboard already
// returns, plus whether any plan/voucher exists). It disappears once every step
// is done, and a step's link is hidden if the member lacks the permission.
import { Check, Circle } from "lucide-react";
import { Link } from "react-router-dom";
import { Panel } from "../../../components/ui/Panel";
import { usePermissions } from "../../../hooks/usePermissions";
import type { DashboardSummary } from "../../../types/dashboard";
import { usePlans } from "../../access/hooks/usePlans";
import { useVouchers } from "../../vouchers/hooks/useVouchers";

export function SetupChecklist({ kpis }: { kpis: DashboardSummary["kpis"] }) {
  const { hasPermission } = usePermissions();
  const plans = usePlans({ pageSize: 1 });
  const vouchers = useVouchers({ pageSize: 1 });

  const steps = [
    { label: "Add your first place", hint: "A location where you run a network.", done: kpis.placeCount > 0, to: "/app/places/new", code: "places:create" },
    { label: "Add a router to a place", hint: "Connect it through a connector.", done: kpis.routersTotal > 0, to: "/app/places", code: "routers:manage" },
    { label: "Verify a router is online", hint: "Run “Test connection” on the place page.", done: kpis.routersOnline > 0, to: "/app/places", code: "routers:manage" },
    { label: "Create an access plan", hint: "Set the price, duration and limits customers buy.", done: (plans.data?.count ?? 0) > 0, to: "/app/access-plans/new", code: "access_plans:create" },
    { label: "Generate vouchers", hint: "Redeemable codes tied to a plan.", done: (vouchers.data?.count ?? 0) > 0, to: "/app/vouchers", code: "vouchers:issue" },
  ];

  const loading = plans.isLoading || vouchers.isLoading;
  const doneCount = steps.filter((s) => s.done).length;
  if (loading || doneCount === steps.length) return null;
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Panel title="Finish setting up" description={`${doneCount} of ${steps.length} steps done`}>
      <div role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mb-4 h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-[280ms]" style={{ width: `${pct}%` }} />
      </div>
      <ol className="flex flex-col gap-3">
        {steps.map((s) => (
          <li key={s.label} className="flex items-start gap-3">
            {s.done ? (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--success)]" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--foreground-muted)]" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${s.done ? "text-[var(--foreground-muted)] line-through" : "text-[var(--foreground)]"}`}>
                {s.label}
                <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
              </p>
              {!s.done && <p className="text-xs text-[var(--foreground-secondary)]">{s.hint}</p>}
            </div>
            {!s.done && hasPermission(s.code) && (
              <Link to={s.to} className="shrink-0 text-sm font-medium text-[var(--primary)] hover:underline">Start</Link>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
