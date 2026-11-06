// Route: /admin/invoices. Every agent's platform invoices; record a payment or void.
import { useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { Dialog } from "../../../components/ui/Dialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Field } from "../../../components/ui/Field";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { StatusBadge, type Tone } from "../../../components/ui/StatusBadge";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { btnDanger, btnGhost, btnPrimary, inputClass } from "../../../components/ui/styles";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { formatDateTime, formatMoney } from "../../../lib/format";
import type { PaymentMethod, PlatformInvoice } from "../../../types/admin";
import { useInvoices, useMarkInvoicePaid, useVoidInvoice } from "../hooks/useAdmin";

type Filter = "ALL" | "OPEN" | "OVERDUE" | "PAID" | "VOID";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" }, { label: "Open", value: "OPEN" }, { label: "Overdue", value: "OVERDUE" }, { label: "Paid", value: "PAID" }, { label: "Void", value: "VOID" },
];
const METHODS: Array<[PaymentMethod, string]> = [["MOBILE_MONEY", "Mobile money"], ["BANK_TRANSFER", "Bank transfer"], ["CARD", "Card"], ["MANUAL", "Other / manual"]];

export const invoiceBadge = (i: { status: string; isOverdue: boolean }): { label: string; tone: Tone } =>
  i.status === "PAID" ? { label: "Paid", tone: "success" } : i.status === "VOID" ? { label: "Void", tone: "muted" } : i.isOverdue ? { label: "Overdue", tone: "danger" } : { label: "Open", tone: "info" };

export function InvoicesPage() {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [paying, setPaying] = useState<PlatformInvoice | null>(null);
  const [voiding, setVoiding] = useState<PlatformInvoice | null>(null);
  const { data, isLoading, isError, error, refetch } = useInvoices({
    page, search: q || undefined,
    status: filter === "OPEN" || filter === "PAID" || filter === "VOID" ? filter : filter === "OVERDUE" ? "OPEN" : undefined,
    overdue: filter === "OVERDUE",
  });

  const columns: Column<PlatformInvoice>[] = [
    { key: "number", header: "Invoice", mobile: "title", cell: (i) => <span className="font-mono text-xs">{i.number}</span> },
    { key: "org", header: "Agent", cell: (i) => <Link to={`/admin/agents/${i.organizationId}`} className="text-[var(--primary)] hover:underline">{i.organizationName}</Link> },
    { key: "amount", header: "Amount", align: "right", cell: (i) => formatMoney(i.amount, i.currency) },
    { key: "due", header: "Due", cell: (i) => formatDateTime(i.dueAt) },
    { key: "paid", header: "Paid", cell: (i) => (i.paidAt ? formatDateTime(i.paidAt) : "—") },
    { key: "status", header: "Status", mobile: "badge", cell: (i) => { const b = invoiceBadge(i); return <StatusBadge label={b.label} tone={b.tone} />; } },
    {
      key: "actions", header: "Actions",
      cell: (i) => i.status === "OPEN" ? (
        <span className="flex justify-end gap-3 text-sm">
          <button type="button" onClick={() => setPaying(i)} className="text-[var(--primary)] hover:underline">Mark paid</button>
          <button type="button" onClick={() => setVoiding(i)} className="text-[var(--danger-text)] hover:underline">Void</button>
        </span>
      ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Billing" description="Subscription invoices for every agent. Record a payment when money is received; revenue figures count only recorded payments." />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input aria-label="Search by invoice number or agent" placeholder="Search invoice or agent" value={search} onChange={(e) => { setPage(1); setSearch(e.target.value); }} className={`${inputClass} sm:max-w-xs`} />
        <FilterChips label="Filter invoices" options={FILTERS} value={filter} onChange={(v) => { setPage(1); setFilter(v); }} />
      </div>
      {isLoading && <TableSkeleton columns={7} />}
      {isError && !data && <ErrorState message={error instanceof Error ? error.message : "Could not load invoices."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && <EmptyState title="No invoices" description="Invoices are issued automatically when an agent is placed on a priced plan." />}
      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Invoices" rows={data.results} columns={columns} rowKey={(i) => i.id} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}
      {paying && <PayDialog invoice={paying} onClose={() => setPaying(null)} />}
      {voiding && <VoidDialog invoice={voiding} onClose={() => setVoiding(null)} />}
    </div>
  );
}

function PayDialog({ invoice, onClose }: { invoice: PlatformInvoice; onClose: () => void }) {
  const pay = useMarkInvoicePaid();
  const [method, setMethod] = useState<PaymentMethod>("MOBILE_MONEY");
  const [reference, setReference] = useState("");
  return (
    <Dialog title="Record payment" description={`${invoice.number} · ${invoice.organizationName} · ${formatMoney(invoice.amount, invoice.currency)}`} onClose={onClose}
      footer={<><button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
        <button type="button" className={btnPrimary} disabled={pay.isPending} onClick={() => pay.mutate({ id: invoice.id, method, reference: reference.trim() }, { onSuccess: onClose })}>{pay.isPending ? "Recording…" : "Mark as paid"}</button></>}>
      <div className="flex flex-col gap-4">
        <Field label="How was it paid?"><select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputClass}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Reference (optional)" hint="For example a mobile-money transaction ID."><input value={reference} maxLength={255} onChange={(e) => setReference(e.target.value)} className={inputClass} /></Field>
        <p className="text-xs text-[var(--foreground-muted)]">This can't be undone. If the agent was past due and nothing else is late, their subscription returns to Active.</p>
        {pay.error && <p role="alert" className="text-sm text-[var(--danger-text)]">{pay.error instanceof Error ? pay.error.message : "Could not record the payment."}</p>}
      </div>
    </Dialog>
  );
}

function VoidDialog({ invoice, onClose }: { invoice: PlatformInvoice; onClose: () => void }) {
  const v = useVoidInvoice();
  return (
    <Dialog title="Void this invoice?" description={`${invoice.number} · ${invoice.organizationName} · ${formatMoney(invoice.amount, invoice.currency)}`} onClose={onClose}
      footer={<><button type="button" className={btnGhost} onClick={onClose}>Keep it</button>
        <button type="button" className={btnDanger} disabled={v.isPending} onClick={() => v.mutate(invoice.id, { onSuccess: onClose })}>{v.isPending ? "Voiding…" : "Void invoice"}</button></>}>
      <p className="text-sm text-[var(--foreground-secondary)]">The amount is no longer owed and is removed from outstanding totals. This can't be undone.</p>
      {v.error && <p role="alert" className="mt-3 text-sm text-[var(--danger-text)]">{v.error instanceof Error ? v.error.message : "Could not void."}</p>}
    </Dialog>
  );
}
