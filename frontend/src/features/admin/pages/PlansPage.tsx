// Route: /admin/plans — the platform's own billing catalog. There is no delete button
// on purpose: a plan with subscribers can't be deleted, so retiring a plan means setting
// it to Archived (hides it from "change plan").
// CHANGED (Round 23): description, USD price, place AND network limits, allowed vendors
// (backend Round 20 PlanSerializer).

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
import { formatMoney } from "../../../lib/format";
import type { PlatformPlan, PlatformPlanInput } from "../../../types/admin";
import type { VendorCode } from "../../../types/network";
import { usePlatformPlans, useSavePlan } from "../hooks/useAdmin";

const VENDORS: Array<{ code: VendorCode; label: string }> = [
  { code: "MIKROTIK", label: "MikroTik" },
  { code: "WIZYFI", label: "Wizyfi" },
];
const limit = (n: number | null) => (n === null ? "Unlimited" : String(n));

export function PlansPage() {
  const { data, isLoading, isError, error, refetch } = usePlatformPlans();
  const [editing, setEditing] = useState<PlatformPlan | "new" | null>(null);

  const columns: Column<PlatformPlan>[] = [
    { key: "name", header: "Plan", mobile: "title", cell: (p) => p.name },
    { key: "places", header: "Places", align: "right", cell: (p) => limit(p.maxPlaces) },
    { key: "networks", header: "Networks", align: "right", cell: (p) => limit(p.maxNetworks) },
    { key: "vendors", header: "Integrations", cell: (p) => (p.allowedVendors.length ? p.allowedVendors.join(", ") : "—") },
    {
      key: "price", header: "Price", align: "right",
      cell: (p) => `${formatMoney(p.price, p.currency)} / ${p.billingPeriod === "MONTHLY" ? "mo" : "yr"}`,
    },
    {
      key: "status", header: "Status", mobile: "badge",
      cell: (p) => <StatusBadge label={p.status === "ACTIVE" ? "Active" : "Archived"} tone={p.status === "ACTIVE" ? "success" : "muted"} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Platform plans"
        description="Subscription plans agents are placed on. Archive a plan to retire it."
        actions={<button type="button" className={btnPrimary} onClick={() => setEditing("new")}>New plan</button>}
      />

      {isLoading && <TableSkeleton columns={6} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load plans."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && (
        <EmptyState
          title="No plans yet"
          description="Create a plan so you can assign agents to it."
          action={<button type="button" className={btnPrimary} onClick={() => setEditing("new")}>New plan</button>}
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
  const [description, setDescription] = useState(plan?.description ?? "");
  const [maxPlaces, setMaxPlaces] = useState(plan?.maxPlaces?.toString() ?? "");
  const [maxNetworks, setMaxNetworks] = useState(plan?.maxNetworks?.toString() ?? "");
  const [price, setPrice] = useState(plan?.price ?? "0.00");
  const [billingPeriod, setBillingPeriod] = useState<PlatformPlanInput["billingPeriod"]>(plan?.billingPeriod ?? "MONTHLY");
  const [status, setStatus] = useState<PlatformPlanInput["status"]>(plan?.status ?? "ACTIVE");
  // New plans start with every known integration allowed; narrow it deliberately.
  const [vendors, setVendors] = useState<VendorCode[]>(
    () => (plan ? (plan.allowedVendors as VendorCode[]) : VENDORS.map((v) => v.code))
  );

  const fe = save.error instanceof ApiError ? save.error.fieldErrors : undefined;
  const okLimit = (v: string) => v === "" || (Number.isInteger(Number(v)) && Number(v) >= 0);
  const valid = name.trim() !== "" && Number(price) >= 0 && okLimit(maxPlaces) && okLimit(maxNetworks);

  const toggleVendor = (code: VendorCode) =>
    setVendors((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));

  const submit = () =>
    save.mutate(
      {
        id: plan?.id,
        input: {
          name: name.trim(),
          description: description.trim(),
          maxPlaces: maxPlaces === "" ? null : Number(maxPlaces),
          maxNetworks: maxNetworks === "" ? null : Number(maxNetworks),
          price: Number(price).toFixed(2),
          currency: "USD",
          billingPeriod,
          allowedVendors: vendors,
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
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
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
        <Field label="Description (optional)" error={fe?.description?.[0]}>
          <textarea value={description} rows={2} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Place limit" hint="Blank = unlimited." error={fe?.maxPlaces?.[0]}>
            <input type="number" min="0" value={maxPlaces} onChange={(e) => setMaxPlaces(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Network (router) limit" hint="Blank = unlimited." error={fe?.maxNetworks?.[0]}>
            <input type="number" min="0" value={maxNetworks} onChange={(e) => setMaxNetworks(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Price (USD)" error={fe?.price?.[0]}>
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
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">Allowed integrations</legend>
          <div className="flex flex-wrap gap-4">
            {VENDORS.map((v) => (
              <label key={v.code} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input type="checkbox" checked={vendors.includes(v.code)} onChange={() => toggleVendor(v.code)} />
                {v.label}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">Agents on this plan can only connect the integrations ticked here.</p>
        </fieldset>
        {save.error && !fe && (
          <p role="alert" className="text-sm text-[var(--danger-text)]">
            {save.error instanceof Error ? save.error.message : "Could not save the plan."}
          </p>
        )}
      </div>
    </Dialog>
  );
}
