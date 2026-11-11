// Route: /admin/agents/:id (supadmin §9–11). Account, plan capacity (places + networks),
// billing summary, activity. Network contents are never shown: only counts against the plan.
// CHANGED (Round 23): networks (routers) vs plan limit, subscription / period / amount due,
// owner email verification, rename account, plan entitlements in the change-plan dialog.
//
// Destructive contract: exact object, scope, consequence, explicit confirm. Suspension requires
// typing the agent's name because Membership.has_permission denies EVERY permission while the
// organization is SUSPENDED.

import { Mail } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Dialog } from "../../../components/ui/Dialog";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Field } from "../../../components/ui/Field";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel } from "../../../components/ui/Panel";
import { Skeleton } from "../../../components/ui/Skeleton";
import { StatCard } from "../../../components/ui/StatCard";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { btnDanger, btnGhost, btnPrimary, btnSecondary, inputClass } from "../../../components/ui/styles";
import { ApiError } from "../../../lib/api/client";
import { formatDateTime, formatMoney, formatNumber } from "../../../lib/format";
import { timeAgo } from "../../../lib/relativeTime";
import type { AgentDetail } from "../../../types/admin";
import { SubscriptionBadge } from "../components/SubscriptionBadge";
import {
  useAgent, useAgentActivity, useChangeAgentPlan, usePlatformPlans, useRenameAgent, useRestoreAgent, useSuspendAgent,
} from "../hooks/useAdmin";

type Modal = "suspend" | "restore" | "plan" | "rename" | null;

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--foreground-secondary)]">{k}</dt>
      <dd className="break-words text-[var(--foreground)]">{children}</dd>
    </>
  );
}

function CapacityBar({ label, used, max }: { label: string; used: number; max: number | null }) {
  if (max === null) {
    return <p className="text-sm text-[var(--foreground-secondary)]">{formatNumber(used)} {label} · no limit on this plan</p>;
  }
  const pct = max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-[var(--foreground)]">{formatNumber(used)} / {formatNumber(max)} {label}</span>
        <span className="text-[var(--foreground-secondary)]">{pct}% of plan capacity</span>
      </div>
      <div
        role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Plan capacity used: ${label}`}
        className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]"
      >
        <div className={`h-full rounded-full ${pct >= 90 ? "bg-[var(--danger)]" : "bg-[var(--primary)]"}`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 90 && <p className="mt-1 text-xs text-[var(--danger-text)]">Near or at the plan limit: adding more may be blocked.</p>}
      <p className="mt-1 text-xs text-[var(--foreground-muted)]">{formatNumber(Math.max(max - used, 0))} remaining</p>
    </div>
  );
}

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const activity = useAgentActivity(id);
  const [modal, setModal] = useState<Modal>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !agent) {
    return <ErrorState message={error instanceof Error ? error.message : "Could not load this agent."} onRetry={() => refetch()} />;
  }

  const suspended = agent.status === "SUSPENDED";
  const owing = Number(agent.amountDue) > 0;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/agents" className="text-sm text-[var(--primary)] hover:underline">← All agents</Link>
      <PageHeader
        title={agent.name}
        description={`Joined ${formatDateTime(agent.createdAt)}`}
        actions={
          <>
            <StatusBadge label={suspended ? "Suspended" : "Active"} tone={suspended ? "danger" : "success"} />
            {agent.ownerEmail && (
              <a href={`mailto:${agent.ownerEmail}`} className={btnSecondary}>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Contact agent
              </a>
            )}
            <button type="button" className={btnSecondary} onClick={() => setModal("rename")}>Rename</button>
            <button type="button" className={btnSecondary} onClick={() => setModal("plan")}>Change plan</button>
            {suspended ? (
              <button type="button" className={btnPrimary} onClick={() => setModal("restore")}>Restore access</button>
            ) : (
              <button type="button" className={btnDanger} onClick={() => setModal("suspend")}>Suspend</button>
            )}
          </>
        }
      />

      {suspended && (
        <p role="status" className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-text)]">
          This account is suspended. Every member of the organization is locked out until it is restored.
        </p>
      )}

      <section aria-label="Agent figures" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Places" value={formatNumber(agent.placeCount)} hint="Count only. Names are private." />
        <StatCard label="Networks" value={formatNumber(agent.networkCount)} hint="Routers. Count only." />
        <StatCard label="Customers" value={formatNumber(agent.customerCount)} hint="Count only. Identities are private." />
        <StatCard label="Active sessions" value={formatNumber(agent.activeSessionCount)} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Account information">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Row k="Owner">{agent.ownerName ?? "—"}</Row>
            <Row k="Email">
              {agent.ownerEmail ?? "—"}
              {agent.ownerEmail && (
                <span className="ml-2 text-xs text-[var(--foreground-muted)]">{agent.ownerEmailVerified ? "Verified" : "Not verified"}</span>
              )}
            </Row>
            <Row k="Account ID"><span className="font-mono text-xs">{agent.id}</span></Row>
            <Row k="Registered">{formatDateTime(agent.createdAt)}</Row>
            <Row k="Last active">{agent.lastActiveAt ? `${timeAgo(agent.lastActiveAt)} · ${formatDateTime(agent.lastActiveAt)}` : "Never signed in"}</Row>
            <Row k="Status">{suspended ? "Suspended" : "Active"}</Row>
          </dl>
        </Panel>

        <Panel title="Plan and capacity" description="This agent's usage against what the plan allows.">
          <div className="flex flex-col gap-5">
            <CapacityBar label="places" used={agent.placeCount} max={agent.plan?.maxPlaces ?? null} />
            <CapacityBar label="networks" used={agent.networkCount} max={agent.plan?.maxNetworks ?? null} />
          </div>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-[var(--divider)] pt-4 text-sm">
            {agent.plan ? (
              <>
                <Row k="Plan">{agent.plan.name}</Row>
                <Row k="Price">{formatMoney(agent.plan.price, agent.plan.currency)} / {agent.plan.billingPeriod === "MONTHLY" ? "month" : "year"}</Row>
                <Row k="Integrations">{agent.plan.allowedVendors.length > 0 ? agent.plan.allowedVendors.join(", ") : "None listed"}</Row>
              </>
            ) : (
              <Row k="Plan">No plan assigned: no limits apply.</Row>
            )}
          </dl>
        </Panel>

        <Panel title="Billing" description="Subscription state and open invoices for this account.">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Row k="Subscription"><SubscriptionBadge status={agent.subscriptionStatus} /></Row>
            <Row k="Current period ends">{agent.currentPeriodEnd ? formatDateTime(agent.currentPeriodEnd) : "—"}</Row>
            <Row k="Amount due">
              <span className={owing ? "font-semibold text-[var(--danger-text)]" : ""}>{formatMoney(agent.amountDue, "USD")}</span>
              <span className="ml-2 text-xs text-[var(--foreground-muted)]">{owing ? "Open invoices" : "Nothing outstanding"}</span>
            </Row>
          </dl>
          <p className="mt-4 text-xs text-[var(--foreground-muted)]">Collected payments and invoice history aren't listed here yet.</p>
        </Panel>

        <Panel title="Activity" description="Actions platform staff have taken on this account.">
          {activity.isLoading && <Skeleton className="h-16 w-full" />}
          {activity.isError && <p className="text-sm text-[var(--danger-text)]">Couldn't load activity.</p>}
          {activity.data && activity.data.results.length === 0 && (
            <p className="text-sm text-[var(--foreground-secondary)]">No platform actions on this account yet.</p>
          )}
          {activity.data && activity.data.results.length > 0 && (
            <ol className="relative space-y-4 border-l border-[var(--border)] pl-4">
              {activity.data.results.slice(0, 10).map((a) => (
                <li key={a.id} className="relative">
                  <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--primary)]" />
                  <p className="text-sm text-[var(--foreground)]">{a.message}</p>
                  <p className="text-xs text-[var(--foreground-muted)]">{formatDateTime(a.createdAt)}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      {modal === "suspend" && <SuspendDialog agent={agent} onClose={() => setModal(null)} />}
      {modal === "restore" && <RestoreDialog agent={agent} onClose={() => setModal(null)} />}
      {modal === "plan" && <ChangePlanDialog agent={agent} onClose={() => setModal(null)} />}
      {modal === "rename" && <RenameDialog agent={agent} onClose={() => setModal(null)} />}
    </div>
  );
}

function RenameDialog({ agent, onClose }: { agent: AgentDetail; onClose: () => void }) {
  const rename = useRenameAgent();
  const [name, setName] = useState(agent.name);
  const fe = rename.error instanceof ApiError ? rename.error.fieldErrors : undefined;
  const valid = name.trim() !== "" && name.trim() !== agent.name;
  return (
    <Dialog
      title="Rename account"
      description="Changes the account name shown across the platform. It is recorded in platform activity."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={!valid || rename.isPending}
            onClick={() => rename.mutate({ id: agent.id, value: name.trim() }, { onSuccess: onClose })}>
            {rename.isPending ? "Saving…" : "Save name"}
          </button>
        </>
      }
    >
      <Field label="Account name" error={fe?.name?.[0]}>
        <input value={name} maxLength={255} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      {rename.error && !fe && <p role="alert" className="mt-3 text-sm text-[var(--danger-text)]">{rename.error instanceof Error ? rename.error.message : "Could not rename."}</p>}
    </Dialog>
  );
}

function SuspendDialog({ agent, onClose }: { agent: AgentDetail; onClose: () => void }) {
  const suspend = useSuspendAgent();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  const ok = confirm.trim() === agent.name;

  return (
    <Dialog
      title={`Suspend ${agent.name}?`}
      description="Every member of this organization immediately loses access until you restore it."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="button" className={btnDanger} disabled={!ok || suspend.isPending}
            onClick={() => suspend.mutate({ id: agent.id, value: reason.trim() }, { onSuccess: onClose })}>
            {suspend.isPending ? "Suspending…" : "Suspend agent"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Reason (recorded in platform activity)">
          <textarea value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} className={inputClass} />
        </Field>
        <Field label={`Type "${agent.name}" to confirm`}>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
        </Field>
        {suspend.error && <p role="alert" className="text-sm text-[var(--danger-text)]">{suspend.error instanceof Error ? suspend.error.message : "Could not suspend this agent."}</p>}
      </div>
    </Dialog>
  );
}

function RestoreDialog({ agent, onClose }: { agent: AgentDetail; onClose: () => void }) {
  const restore = useRestoreAgent();
  return (
    <Dialog
      title={`Restore ${agent.name}?`}
      description="Members regain access with the permissions they had before."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={restore.isPending}
            onClick={() => restore.mutate({ id: agent.id, value: undefined }, { onSuccess: onClose })}>
            {restore.isPending ? "Restoring…" : "Restore access"}
          </button>
        </>
      }
    >
      {restore.error && <p role="alert" className="text-sm text-[var(--danger-text)]">{restore.error instanceof Error ? restore.error.message : "Could not restore this agent."}</p>}
    </Dialog>
  );
}

function ChangePlanDialog({ agent, onClose }: { agent: AgentDetail; onClose: () => void }) {
  const plans = usePlatformPlans("ACTIVE");
  const change = useChangeAgentPlan();
  const [planId, setPlanId] = useState(agent.plan?.id ?? "");
  const chosen = plans.data?.results.find((p) => p.id === planId);
  const overPlaces = chosen?.maxPlaces != null && agent.placeCount > chosen.maxPlaces;
  const overNetworks = chosen?.maxNetworks != null && agent.networkCount > chosen.maxNetworks;

  return (
    <Dialog
      title={`Change plan for ${agent.name}`}
      description="A lower limit doesn't remove existing places or networks. It only blocks adding new ones."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button type="button" className={btnPrimary} disabled={!planId || planId === agent.plan?.id || change.isPending}
            onClick={() => change.mutate({ id: agent.id, value: planId }, { onSuccess: onClose })}>
            {change.isPending ? "Saving…" : "Change plan"}
          </button>
        </>
      }
    >
      <Field label="New plan">
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass} disabled={plans.isLoading}>
          <option value="" disabled>Select a plan</option>
          {plans.data?.results.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.maxPlaces ?? "unlimited"} places · {p.maxNetworks ?? "unlimited"} networks · {formatMoney(p.price, p.currency)}
            </option>
          ))}
        </select>
      </Field>
      {(overPlaces || overNetworks) && (
        <p role="status" className="mt-3 text-sm text-[var(--foreground-secondary)]">
          This agent has {agent.placeCount} places and {agent.networkCount} networks, above this plan's limits. They keep them but can't add more.
        </p>
      )}
      {change.error && <p role="alert" className="mt-3 text-sm text-[var(--danger-text)]">{change.error instanceof Error ? change.error.message : "Could not change the plan."}</p>}
    </Dialog>
  );
}
