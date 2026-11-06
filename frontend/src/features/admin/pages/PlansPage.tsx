// Route: /admin/plans. The platform's billing catalog (limits, integrations, price).
// No delete: retire a plan by archiving it.
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
import type { PlatformPlan, PlatformPlanInput, VendorCode } from "../../../types/admin";
import { usePlatformPlans, useSavePlan } from "../hooks/useAdmin";

const VENDORS: Array<{ code: VendorCode; label: string }> = [{ code: "MIKROTIK", label: "MikroTik" }, { code: "WIZYFI", label: "Wizyfi" }];
const lim = (n: number | null) => (n === null ? "Unlimited" : String(n));

export function PlansPage() {
  const { data, isLoading, isError, error, refetch } = usePlatformPlans();
  const [editing, setEditing] = useState<PlatformPlan | "new" | null>(null);

  const columns: Column<PlatformPlan>[] = [
    { key: "name", header: "Plan", mobile: "title", cell: (p) => p.name },
    { key: "price", header: "Price", align: "right", cell: (p) => `${formatMoney(p.price, p.currency)} / ${p.billingPeriod === "MONTHLY" ? "mo" : "yr"}` },
    { key: "places", header: "Places", align: "right", cell: (p) => lim(p.maxPlaces) },
    { key: "routers", header: "Routers", align: "right", cell: (p) => lim(p.maxNetworks) },
    { key: "vendors", header: "Integrations", cell: (p) => (p.allowedVendors.length ? p.allowedVendors.map((v) => VENDORS.find((x) => x.code === v)?.label ?? v).join(", ") : "All") },
    { key: "status", header: "Status", mobile: "badge", cell: (p) => <StatusBadge label={p.status === "ACTIVE" ? "Active" : "Archived"} tone={p.status === "ACTIVE" ? "success" : "muted"} /> },
  ];
  const add = <button type="button" className={btnPrimary} onClick={() => setEditing("new")}>New plan</button>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Platform plans" description="Plans agents are placed on. Active plans are published on the website pricing section. Archive a plan to retire it." actions={add} />
      {isLoading && <TableSkeleton columns={6} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load plans."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && <EmptyState title="No plans yet" description="Create a plan so you can assign agents to it." action={add} />}
      {data && data.results.length > 0 && <DataTable caption="Platform plans" rows={data.results} columns={columns} rowKey={(p) => p.id} onRowOpen={(p) => setEditing(p)} />}
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
  const [vendors, setVendors] = useState<VendorCode[]>(plan?.allowedVendors ?? ["MIKROTIK", "WIZYFI"]);
  const [price, setPrice] = useState(plan?.price ?? "0.00");
  const [period, setPeriod] = useState<PlatformPlanInput["billingPeriod"]>(plan?.billingPeriod ?? "MONTHLY");
  const [status, setStatus] = useState<PlatformPlanInput["status"]>(plan?.status ?? "ACTIVE");

  const fe = save.error instanceof ApiError ? save.error.fieldErrors : undefined;
  const nn = (s: string) => s === "" || Number(s) >= 0;
  const valid = name.trim() !== "" && Number(price) >= 0 && nn(maxPlaces) && nn(maxNetworks);
  const toggle = (v: VendorCode) => setVendors((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));

  const submit = () =>
    save.mutate(
      { id: plan?.id, input: { name: name.trim(), description: description.trim(), maxPlaces: maxPlaces === "" ? null : Number(maxPlaces), maxNetworks: maxNetworks === "" ? null : Number(maxNetworks), allowedVendors: vendors, price: Number(price).toFixed(2), currency: "USD", billingPeriod: period, status } },
      { onSuccess: onClose }
    );

  return (
    <Dialog title={plan ? `Edit ${plan.name}` : "New plan"} onClose={onClose}
      footer={<><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button type="button" className={btnPrimary} disabled={!valid || save.isPending} onClick={submit}>{save.isPending ? "Saving…" : "Save plan"}</button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Name" error={fe?.name?.[0]}><input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <Field label="Description (shown on the website)" error={fe?.description?.[0]}><input value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} className={inputClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Places limit" hint="Blank = unlimited." error={fe?.maxPlaces?.[0]}><input type="number" min="0" value={maxPlaces} onChange={(e) => setMaxPlaces(e.target.value)} className={inputClass} /></Field>
          <Field label="Routers limit" hint="Blank = unlimited." error={fe?.maxNetworks?.[0]}><input type="number" min="0" value={maxNetworks} onChange={(e) => setMaxNetworks(e.target.value)} className={inputClass} /></Field>
          <Field label="Price (USD)" error={fe?.price?.[0]}><input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={inputClass} /></Field>
          <Field label="Billing period"><select value={period} onChange={(e) => setPeriod(e.target.value as PlatformPlanInput["billingPeriod"])} className={inputClass}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Integrations included</legend>
          <div className="flex gap-4">{VENDORS.map((v) => <label key={v.code} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={vendors.includes(v.code)} onChange={() => toggle(v.code)} />{v.label}</label>)}</div>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">None ticked means every supported integration.</p>
        </fieldset>
        <Field label="Status"><select value={status} onChange={(e) => setStatus(e.target.value as PlatformPlanInput["status"])} className={inputClass}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></Field>
        {save.error && !fe && <p role="alert" className="text-sm text-[var(--danger-text)]">{save.error instanceof Error ? save.error.message : "Could not save the plan."}</p>}
      </div>
    </Dialog>
  );
}
