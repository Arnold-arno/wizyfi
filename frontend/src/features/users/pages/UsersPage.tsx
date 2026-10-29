// Route: /app/users — Wi-Fi customers (doc04 §7). Search/filter above the table,
// server-side pagination, permission-gated "Add customer". Customers are fully
// separate from staff accounts. Phone numbers are personal data: shown only to
// members holding customers:view (the backend enforces it).
import { useState } from "react";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { Dialog } from "../../../components/ui/Dialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Field } from "../../../components/ui/Field";
import { FilterChips } from "../../../components/ui/FilterChips";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Pagination } from "../../../components/ui/Pagination";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { btnGhost, btnPrimary, inputClass } from "../../../components/ui/styles";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { usePermissions } from "../../../hooks/usePermissions";
import { ApiError } from "../../../lib/api/client";
import { formatDateTime } from "../../../lib/format";
import type { Customer, CustomerStatus } from "../../../lib/api/directoryApi";
import { useCreateCustomer, useCustomers } from "../../directory/hooks";

type Filter = CustomerStatus | "ALL";
const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Blocked", value: "BLOCKED" },
];

export function UsersPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("customers:manage");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const [status, setStatus] = useState<Filter>("ALL");
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Customer | null>(null);

  const { data, isLoading, isError, error, refetch } = useCustomers({
    page, search: q || undefined, status: status === "ALL" ? undefined : status,
  });

  const columns: Column<Customer>[] = [
    { key: "name", header: "Customer", mobile: "title", cell: (c) => c.fullName || c.macAddress || c.phone || "Unnamed" },
    { key: "phone", header: "Phone", cell: (c) => c.phone || "—" },
    { key: "mac", header: "Device (MAC)", cell: (c) => <span className="font-mono text-xs">{c.macAddress || "—"}</span> },
    { key: "joined", header: "First seen", cell: (c) => formatDateTime(c.createdAt) },
    {
      key: "status", header: "Status", mobile: "badge",
      cell: (c) => <StatusBadge label={c.status === "ACTIVE" ? "Active" : "Blocked"} tone={c.status === "ACTIVE" ? "success" : "danger"} />,
    },
  ];
  const filtered = q !== "" || status !== "ALL";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="People who use your networks. Customers are kept separate from your staff accounts."
        actions={canManage && <button type="button" className={btnPrimary} onClick={() => setAdding(true)}>Add customer</button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          aria-label="Search customers by name, phone or MAC address"
          placeholder="Search by name, phone or MAC"
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
          className={`${inputClass} sm:max-w-sm`}
        />
        <FilterChips label="Filter by status" options={FILTERS} value={status} onChange={(v) => { setPage(1); setStatus(v); }} />
      </div>

      {isLoading && <TableSkeleton columns={5} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load customers."} onRetry={() => refetch()} />}
      {data && data.results.length === 0 && (
        <EmptyState
          title={filtered ? "No customers match" : "No customers yet"}
          description={filtered ? "Try a different search or status." : "Customers appear here when they redeem a voucher or when you add them."}
          action={!filtered && canManage ? <button type="button" className={btnPrimary} onClick={() => setAdding(true)}>Add customer</button> : undefined}
        />
      )}
      {data && data.results.length > 0 && (
        <>
          <DataTable caption="Customers" rows={data.results} columns={columns} rowKey={(c) => c.id} onRowOpen={setOpen} />
          <Pagination page={page} total={data.count} hasNext={Boolean(data.next)} hasPrevious={Boolean(data.previous)} onChange={setPage} />
        </>
      )}

      {adding && <AddCustomerDialog onClose={() => setAdding(false)} />}
      {open && (
        <Dialog title={open.fullName || open.macAddress || "Customer"} description="Customer details" onClose={() => setOpen(null)} footer={<button type="button" className={btnGhost} onClick={() => setOpen(null)}>Close</button>}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-[var(--foreground-secondary)]">Name</dt><dd>{open.fullName || "—"}</dd>
            <dt className="text-[var(--foreground-secondary)]">Phone</dt><dd>{open.phone || "—"}</dd>
            <dt className="text-[var(--foreground-secondary)]">Device (MAC)</dt><dd className="font-mono text-xs">{open.macAddress || "—"}</dd>
            <dt className="text-[var(--foreground-secondary)]">Status</dt><dd>{open.status === "ACTIVE" ? "Active" : "Blocked"}</dd>
            <dt className="text-[var(--foreground-secondary)]">First seen</dt><dd>{formatDateTime(open.createdAt)}</dd>
          </dl>
        </Dialog>
      )}
    </div>
  );
}

function AddCustomerDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateCustomer();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [mac, setMac] = useState("");
  const fe = create.error instanceof ApiError ? create.error.fieldErrors : undefined;
  const general = create.error && !fe ? (create.error instanceof Error ? create.error.message : "Could not add the customer.") : null;
  const valid = fullName.trim() !== "" || phone.trim() !== "" || mac.trim() !== "";

  return (
    <Dialog
      title="Add customer"
      description="Provide at least a name, a phone number or a device address."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>Cancel</button>
          <button
            type="button" className={btnPrimary} disabled={!valid || create.isPending}
            onClick={() => create.mutate({ fullName: fullName.trim(), phone: phone.trim(), macAddress: mac.trim().toUpperCase() }, { onSuccess: onClose })}
          >
            {create.isPending ? "Adding…" : "Add customer"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Full name" error={fe?.fullName?.[0]}><input value={fullName} maxLength={255} onChange={(e) => setFullName(e.target.value)} className={inputClass} /></Field>
        <Field label="Phone" hint="Include the country code, e.g. +256…" error={fe?.phone?.[0]}><input value={phone} maxLength={32} inputMode="tel" onChange={(e) => setPhone(e.target.value)} className={inputClass} /></Field>
        <Field label="Device MAC address" hint="Format AA:BB:CC:DD:EE:FF" error={fe?.macAddress?.[0]}><input value={mac} maxLength={17} onChange={(e) => setMac(e.target.value)} className={`${inputClass} font-mono`} /></Field>
        {general && <p role="alert" className="text-sm text-[var(--danger-text)]">{general}</p>}
      </div>
    </Dialog>
  );
}
