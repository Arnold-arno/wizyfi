// Route: /admin/agents/:id — suspend / restore / change plan.
// Destructive action contract (doc02 §7): exact object, scope, consequence,
// explicit confirm. Suspension requires typing the agent's name because
// Membership.has_permission denies EVERY permission while the organization is
// SUSPENDED — all of its members lose access.

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
import { formatDateTime, formatNumber } from "../../../lib/format";
import type { AgentDetail } from "../../../types/admin";
import { useAgent, useChangeAgentPlan, usePlatformPlans, useRestoreAgent, useSuspendAgent } from "../hooks/useAdmin";

type Modal = "suspend" | "restore" | "plan" | null;

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const [modal, setModal] = useState<Modal>(null);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !agent) {
    return <ErrorState message={error instanceof Error ? error.message : "Could not load this agent."} onRetry={() => refetch()} />;
  }

  const suspended = agent.status === "SUSPENDED";

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/agents" className="text-sm text-[var(--primary)] hover:underline">
        ← All agents
      </Link>
      <PageHeader
        title={agent.name}
        description={`Joined ${formatDateTime(agent.createdAt)}`}
        actions={
          <>
            <StatusBadge label={suspended ? "Suspended" : "Active"} tone={suspended ? "danger" : "success"} />
            <button type="button" className={btnSecondary} onClick={() => setModal("plan")}>
              Change plan
            </button>
            {suspended ? (
              <button type="button" className={btnPrimary} onClick={() => setModal("restore")}>
                Restore access
              </button>
            ) : (
              <button type="button" className={btnDanger} onClick={() => setModal("suspend")}>
                Suspend
              </button>
            )}
          </>
        }
      />

      <section aria-label="Agent figures" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Connected networks" value={formatNumber(agent.placeCount)} hint="Count only" />
        <StatCard label="Customers" value={formatNumber(agent.customerCount)} hint="Count only — identities are private" />
        <StatCard label="Active sessions" value={formatNumber(agent.activeSessionCount)} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Subscription">
          {agent.plan ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-[var(--foreground-secondary)]">Plan</dt>
              <dd className="text-[var(--foreground)]">{agent.plan.name}</dd>
              <dt className="text-[var(--foreground-secondary)]">Network limit</dt>
              <dd className="text-[var(--foreground)]">{agent.plan.maxPlaces ?? "Unlimited"}</dd>
              <dt className="text-[var(--foreground-secondary)]">Price</dt>
              <dd className="text-[var(--foreground)]">
                {formatNumber(agent.plan.price)} / {agent.plan.billingPeriod === "MONTHLY" ? "month" : "year"}
              </dd>
            </dl>
          ) : (
            <p className="text-sm text-[var(--foreground-secondary)]">No plan assigned — this account has no network limit.</p>
          )}
        </Panel>
        <Panel title="Account owner">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-[var(--foreground-secondary)]">Name</dt>
            <dd className="text-[var(--foreground)]">{agent.ownerName ?? "—"}</dd>
            <dt className="text-[var(--foreground-secondary)]">Email</dt>
            <dd className="break-all text-[var(--foreground)]">{agent.ownerEmail ?? "—"}</dd>
          </dl>
        </Panel>
      </div>

      {modal === "suspend" && <SuspendDialog agent={agent} onClose={() => setModal(null)} />}
      {modal === "restore" && <RestoreDialog agent={agent} onClose={() => setModal(null)} />}
      {modal === "plan" && <ChangePlanDialog agent={agent} onClose={() => setModal(null)} />}
    </div>
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
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnDanger}
            disabled={!ok || suspend.isPending}
            onClick={() => suspend.mutate({ id: agent.id, value: reason.trim() }, { onSuccess: onClose })}
          >
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
        {suspend.error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {suspend.error instanceof Error ? suspend.error.message : "Could not suspend this agent."}
          </p>
        )}
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
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={restore.isPending}
            onClick={() => restore.mutate({ id: agent.id, value: undefined }, { onSuccess: onClose })}
          >
            {restore.isPending ? "Restoring…" : "Restore access"}
          </button>
        </>
      }
    >
      {restore.error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {restore.error instanceof Error ? restore.error.message : "Could not restore this agent."}
        </p>
      )}
    </Dialog>
  );
}

function ChangePlanDialog({ agent, onClose }: { agent: AgentDetail; onClose: () => void }) {
  const plans = usePlatformPlans("ACTIVE");
  const change = useChangeAgentPlan();
  const [planId, setPlanId] = useState(agent.plan?.id ?? "");

  return (
    <Dialog
      title={`Change plan for ${agent.name}`}
      description="A lower network limit doesn't remove existing networks — it only blocks adding new ones."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={!planId || planId === agent.plan?.id || change.isPending}
            onClick={() => change.mutate({ id: agent.id, value: planId }, { onSuccess: onClose })}
          >
            {change.isPending ? "Saving…" : "Change plan"}
          </button>
        </>
      }
    >
      <Field label="New plan">
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={inputClass} disabled={plans.isLoading}>
          <option value="" disabled>
            Select a plan
          </option>
          {plans.data?.results.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.maxPlaces ?? "unlimited"} networks
            </option>
          ))}
        </select>
      </Field>
      {change.error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {change.error instanceof Error ? change.error.message : "Could not change the plan."}
        </p>
      )}
    </Dialog>
  );
}
