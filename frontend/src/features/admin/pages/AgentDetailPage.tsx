// Route: /admin/agents/:id. Account, plan capacity, REAL billing (status, amount due,
// recent invoices), activity. Network contents are never shown, only counts.
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
import { formatDateTime, formatMoney, formatNumber } from "../../../lib/format";
import { timeAgo } from "../../../lib/relativeTime";
import type { AgentDetail } from "../../../types/admin";
import { useAgent, useAgentActivity, useChangeAgentPlan, useInvoices, usePlatformPlans, useRenameAgent, useRestoreAgent, useSuspendAgent } from "../hooks/useAdmin";
import { SUB } from "./AgentsPage";

type Modal = "suspend" | "restore" | "plan" | "rename" | null;

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (<><dt className="text-[var(--foreground-secondary)]">{k}</dt><dd className="break-words text-[var(--foreground)]">{children}</dd></>);
}

function Capacity({ label, used, max }: { label: string; used: number; max: number | null }) {
  if (max === null) return <p className="text-sm text-[var(--foreground-secondary)]">{formatNumber(used)} {label} · no limit on this plan</p>;
  const pct = max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{formatNumber(used)} / {formatNumber(max)} {label}</span>
        <span className="text-[var(--foreground-secondary)]">{pct}%</span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${label} used`} className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div className={`h-full rounded-full transition-[width] duration-500 ${pct >= 90 ? "bg-[var(--danger)]" : "bg-[var(--primary)]"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const activity = useAgentActivity(id);
  const invoices = useInvoices({ organization: id, pageSize: 5 });
  const [modal, setModal] = useState<Modal>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !agent) return <ErrorState message={error instanceof Error ? error.message : "Could not load this agent."} onRetry={() => refetch()} />;
  const suspended = agent.status === "SUSPENDED";
  const sub = agent.subscriptionStatus ? SUB[agent.subscriptionStatus] : null;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/agents" className="text-sm text-[var(--primary)] hover:underline">← All agents</Link>
      <PageHeader
        title={agent.name} description={`Joined ${formatDateTime(agent.createdAt)}`}
        actions={
          <>
            <StatusBadge label={suspended ? "Suspended" : "Active"} tone={suspended ? "danger" : "success"} />
            {agent.ownerEmail && <a href={`mailto:${agent.ownerEmail}`} className={btnSecondary}><Mail className="h-4 w-4" aria-hidden="true" />Contact agent</a>}
            <button type="button" className={btnSecondary} onClick={() => setModal("rename")}>Rename</button>
            <button type="button" className={btnSecondary} onClick={() => setModal("plan")}>Change plan</button>
            {suspended ? <button type="button" className={btnPrimary} onClick={() => setModal("restore")}>Restore access</button>
              : <button type="button" className={btnDanger} onClick={() => setModal("suspend")}>Suspend</button>}
          </>
        }
      />
      {suspended && <p role="status" className="rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-text)]">This account is suspended. Every member is locked out of the product until it is restored. Billing stays reachable.</p>}

      <section aria-label="Agent figures" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Places" value={formatNumber(agent.placeCount)} hint="Count only" />
        <StatCard label="Routers" value={formatNumber(agent.networkCount)} hint="Count only" />
        <StatCard label="Customers" value={formatNumber(agent.customerCount)} hint="Count only" />
        <StatCard label="Active sessions" value={formatNumber(agent.activeSessionCount)} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Account information">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Row k="Owner">{agent.ownerName ?? "—"}</Row>
            <Row k="Email">{agent.ownerEmail ?? "—"}{agent.ownerEmail && <span className="ml-2 text-xs text-[var(--foreground-muted)]">{agent.ownerEmailVerified ? "verified" : "not verified"}</span>}</Row>
            <Row k="Account ID"><span className="font-mono text-xs">{agent.id}</span></Row>
            <Row k="Last active">{agent.lastActiveAt ? `${timeAgo(agent.lastActiveAt)} · ${formatDateTime(agent.lastActiveAt)}` : "Never signed in"}</Row>
          </dl>
        </Panel>

        <Panel title="Plan and capacity">
          {agent.plan ? (
            <div className="flex flex-col gap-4">
              <Capacity label="places" used={agent.placeCount} max={agent.plan.maxPlaces} />
              <Capacity label="routers" used={agent.networkCount} max={agent.plan.maxNetworks} />
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-[var(--divider)] pt-4 text-sm">
                <Row k="Plan">{agent.plan.name}</Row>
                <Row k="Price">{formatMoney(agent.plan.price, agent.plan.currency)} / {agent.plan.billingPeriod === "MONTHLY" ? "month" : "year"}</Row>
                <Row k="Integrations">{agent.plan.allowedVendors.length ? agent.plan.allowedVendors.map((v) => (v === "MIKROTIK" ? "MikroTik" : "Wizyfi")).join(", ") : "All supported"}</Row>
              </dl>
            </div>
          ) : <p className="text-sm text-[var(--foreground-secondary)]">No plan assigned: no limits apply.</p>}
        </Panel>

        <Panel title="Billing" description="Platform subscription, not the agent's own Wi-Fi sales.">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Row k="Subscription">{sub ? <StatusBadge label={sub.label} tone={sub.tone} /> : "None"}</Row>
            <Row k="Amount due"><span className={Number(agent.amountDue) > 0 ? "font-semibold text-[var(--danger-text)]" : ""}>{formatMoney(agent.amountDue, agent.plan?.currency ?? "USD")}</span></Row>
            <Row k="Period ends">{agent.currentPeriodEnd ? formatDateTime(agent.currentPeriodEnd) : "—"}</Row>
          </dl>
          {invoices.data && invoices.data.results.length > 0 && (
            <ul className="mt-4 divide-y divide-[var(--border)] border-t border-[var(--divider)]">
              {invoices.data.results.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-mono text-xs">{i.number}</span>
                  <span className="tabular-nums">{formatMoney(i.amount, i.currency)}</span>
                  <StatusBadge label={i.status === "OPEN" ? (i.isOverdue ? "Overdue" : "Open") : i.status === "PAID" ? "Paid" : "Void"} tone={i.status === "PAID" ? "success" : i.status === "OPEN" ? (i.isOverdue ? "danger" : "info") : "muted"} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm"><Link to="/admin/invoices" className="text-[var(--primary)] hover:underline">Open billing</Link></p>
        </Panel>

        <Panel title="Activity" description="Actions platform staff have taken on this account.">
          {activity.isLoading && <Skeleton className="h-16 w-full" />}
          {activity.data && activity.data.results.length === 0 && <p className="text-sm text-[var(--foreground-secondary)]">No platform actions yet.</p>}
          {activity.data && activity.data.results.length > 0 && (
            <ol className="relative space-y-4 border-l border-[var(--border)] pl-4">
              {activity.data.results.slice(0, 10).map((a) => (
                <li key={a.id} className="relative">
                  <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] bg-[var(--primary)]" />
                  <p className="text-sm">{a.message}</p><p className="text-xs text-[var(--foreground-muted)]">{formatDateTime(a.createdAt)}</p>
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

const err = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function RenameDialog({ agent, onClose }: { agent: AgentDetail; onClose: () => void }) {
  const rename = useRenameAgent();
  const [name, setName] = useState(agent.name);
  return (
    <Dialog title="Rename account" onClose={onClose} footer={<><button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
      <button type="button" className={btnPrimary} disabled={!name.trim() || name.trim() === agent.name || rename.isPending} onClick={() => rename.mutate({ id: agent.id, value: name.trim() }, { onSuccess: onClose })}>{rename.isPending ? "Saving…" : "Save name"}</button></>}>
      <Field label="Account name"><input value={name} maxLength={255} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
      {rename.error && <p role="alert" className="mt-3 text-sm text-[var(--danger-text)]">{err(rename.error, "Could not rename.")}</p>}
    </Dialog>
  );
}

function SuspendDialog({ agent, onClose }: { agent: AgentDetail; onClose: () => void }) {
  const suspend = useSuspendAgent();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <Dialog title={`Suspend ${agent.name}?`} description="Every member of this organization immediately loses access until you restore it." onClose={onClose}
      footer={<><button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
        <button type="button" className={btnDanger} disabled={confirm.trim() !== agent.name || suspend.isPending} onClick={() => suspend.mutate({ id: agent.id, value: reason.trim() }, { onSuccess: onClose })}>{suspend.isPending ? "Suspending…" : "Suspend agent"}</button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Reason (recorded in platform activity)"><textarea value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)} className={inputClass} /></Field>
        <Field label={`Type "${agent.name}" to confirm`}><input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} /></Field>
        {suspend.error && <p role="alert" className="text-sm text-[var(--danger-text)]">{err(suspend.error, "Could not suspend.")}</p>}
      </div>
    </Dialog>
  );
}

function RestoreDialog({ agent, onClose }: { agent: AgentDetail; onClose: () => void }) {
  const restore = useRestoreAgent();
  return (
    <Dialog title={`Restore ${agent.name}?`} description="Members regain access with the permissions they had before." onClose={onClose}
      footer={<><button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={restore.isPending} onClick={() => restore.mutate({ id: agent.id, value: undefined }, { onSuccess: onClose })}>{restore.isPending ? "Restoring…" : "Restore access"}</button></>}>
      {restore.error && <p role="alert" className="text-sm text-[var(--danger-text)]">{err(restore.error, "Could not restore.")}</p>}
    </Dialog>
  );
}

function ChangePlanDialog({ agent, onClose }: { agent: AgentDetail; onClose: () => void }) {
  const plans = usePlatformPlans("ACTIVE");
  const change = useChangeAgentPlan();
  const [planId, setPlanId] = useState(agent.plan?.id ?? "");
  const chosen = plans.data?.results.find((p) => p.id === planId);
  const over = chosen?.maxPlaces != null && agent.placeCount > chosen.maxPlaces;
  return (
    <Dialog title={`Change plan for ${agent.name}`} description="A lower limit doesn't remove existing places or routers. It only blocks adding new ones. A first plan issues the first invoice." onClose={onClose}
      footer={<><button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={!planId || planId === agent.plan?.id || change.isPending} onClick={() => change.mutate({ id: agent.id, value: planId }, { onSuccess: onClose })}>{change.isPending ? "Saving…" : "Change plan"}</button></>}>
      <Field label="New plan">
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass} disabled={plans.isLoading}>
          <option value="" disabled>Select a plan</option>
          {plans.data?.results.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.price, p.currency)} · {p.maxPlaces ?? "unlimited"} places</option>)}
        </select>
      </Field>
      {over && <p role="status" className="mt-3 text-sm text-[var(--foreground-secondary)]">This agent has {agent.placeCount} places, above this plan's {chosen?.maxPlaces}. They keep them but can't add more.</p>}
      {change.error && <p role="alert" className="mt-3 text-sm text-[var(--danger-text)]">{err(change.error, "Could not change the plan.")}</p>}
    </Dialog>
  );
}
