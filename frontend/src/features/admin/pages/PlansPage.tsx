// Route: /admin/plans — the platform's own billing catalog. There is no
// delete button on purpose: a plan with subscribers can't be deleted, so
// retiring a plan means setting it to Archived (hides it from "change plan").
// Note the Plan model has no currency field yet; prices are shown as plain
// numbers.

import { useState } from "react";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { Dialog } from "../../../components/ui/Dialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Field } from "../../../components/ui/Field";
import { PageHeader } from "../../../components/ui/PageHeader";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { btnGhost, btnPrimary, inputClass } from "../../../components/ui/styles";
import { ApiError } from "../../../lib/api/client";
import { formatNumber } from "../../../lib/format";
import type { PlatformPlan, PlatformPlanInput } from "../../../types/admin";
import { usePlatformPlans, useSavePlan } from "../hooks/useAdmin";

export function PlansPage() {
  const { data, isLoading, isError, error, refetch } = usePlatformPlans();
  const [editing, setEditing] = useState<PlatformPlan | "new" | null>(null);

  const columns: Column<PlatformPlan>[] = [
    { key: "name", header: "Plan", mobile: "title", cell: (p) => p.name },
    { key: "limit", header: "Network limit", align: "right", cell: (p) => (p.maxPlaces ?? "Unlimited") },
    { key: "price", header: "Price", align: "right", cell: (p) => formatNumber(p.price) },
    { key: "period", header: "Billing", cell: (p) => (p.billingPeriod === "MONTHLY" ? "Monthly" : "Annual") },
    {
      key: "status",
      header: "Status",
      mobile: "badge",
      cell: (p) => <StatusBadge label={p.status === "ACTIVE" ? "Active" : "Archived"} tone={p.status === "ACTIVE" ? "success" : "muted"} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform plans"
        description="Subscription plans agents are placed on. Archive a plan to retire it."
        actions={
          <button type="button" className={btnPrimary} onClick={() => setEditing("new")}>
            New plan
          </button>
        }
      />

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load plans."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && (
        <EmptyState
          title="No plans yet"
          description="Create a plan so you can assign agents to it."
          action={
            <button type="button" className={btnPrimary} onClick={() => setEditing("new")}>
              New plan
            </button>
          }
        />
      )}
      {data && data.results.length > 0 && (
        <DataTable caption="Platform plans" rows={data.results} columns={columns} rowKey={(p) => p.id} onRowOpen={(p) => setEditing(p)} />
      )}

      {editing && <PlanDialog plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlanDialog({ plan, onClose }: { plan: PlatformPlan | null; onClose: () => void }) {
  const save = useSavePlan();
  const [name, setName] = useState(plan?.name ?? "");
  const [maxPlaces, setMaxPlaces] = useState(plan?.maxPlaces?.toString() ?? "");
  const [price, setPrice] = useState(plan?.price ?? "0.00");
  const [billingPeriod, setBillingPeriod] = useState<PlatformPlanInput["billingPeriod"]>(plan?.billingPeriod ?? "MONTHLY");
  const [status, setStatus] = useState<PlatformPlanInput["status"]>(plan?.status ?? "ACTIVE");

  const fe = save.error instanceof ApiError ? save.error.fieldErrors : undefined;
  const valid = name.trim() !== "" && Number(price) >= 0 && (maxPlaces === "" || Number(maxPlaces) >= 0);

  const submit = () =>
    save.mutate(
      {
        id: plan?.id,
        input: {
          name: name.trim(),
          maxPlaces: maxPlaces === "" ? null : Number(maxPlaces),
          price: Number(price).toFixed(2),
          billingPeriod,
          status,
        },
      },
      { onSuccess: onClose }
    );

  return (
    <Dialog
      title={plan ? `Edit ${plan.name}` : "New plan"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={!valid || save.isPending} onClick={submit}>
            {save.isPending ? "Saving…" : "Save plan"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" error={fe?.name?.[0]}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Network limit" hint="Leave blank for unlimited." error={fe?.maxPlaces?.[0]}>
            <input type="number" min="0" value={maxPlaces} onChange={(e) => setMaxPlaces(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Price" error={fe?.price?.[0]}>
            <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Billing period">
            <select value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value as PlatformPlanInput["billingPeriod"])} className={inputClass}>
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as PlatformPlanInput["status"])} className={inputClass}>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </Field>
        </div>
        {save.error && !fe && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {save.error instanceof Error ? save.error.message : "Could not save the plan."}
          </p>
        )}
      </div>
    </Dialog>
  );
}
