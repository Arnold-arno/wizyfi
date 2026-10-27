// Route: /app/hard-logout/recurring — rules that keep the next resets scheduled.
// A rule never disconnects anyone itself: it creates ordinary scheduled events
// (visible in Wizyfi history), each cancellable on its own. Rules are immutable:
// to change one, pause it and create a new one.
import { useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { Dialog } from "../../../components/ui/Dialog";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Field } from "../../../components/ui/Field";
import { PageHeader } from "../../../components/ui/PageHeader";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { TableSkeleton } from "../../../components/ui/TableSkeleton";
import { btnGhost, btnPrimary, btnSecondary, inputClass } from "../../../components/ui/styles";
import { usePermissions } from "../../../hooks/usePermissions";
import { ApiError } from "../../../lib/api/client";
import { formatInZone } from "../../../lib/wizyfiTime";
import type { RecurringReset } from "../../../types/recurring";
import type { HardLogoutScope } from "../../../types/wizyfi";
import { useCreateRecurring, useRecurringResets, useToggleRecurring } from "../hooks/useRecurring";
import { usePlacesLite, useRoutersLite } from "../hooks/useWizyfi";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SCOPE: Record<HardLogoutScope, string> = { ROUTER: "One router", ROUTERS: "Selected routers", PLACE: "Whole place" };

const describe = (r: RecurringReset) =>
  `${r.weekdays.length === 0 ? "Every day" : r.weekdays.map((d) => DAYS[d]).join(", ")} at ${r.timeOfDay.slice(0, 5)} (${r.timezone})`;

export function WizyfiRecurringPage() {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("hard_logout:schedule");
  const canPause = hasPermission("hard_logout:cancel");
  const { data, isLoading, isError, error, refetch } = useRecurringResets();
  const places = usePlacesLite();
  const toggle = useToggleRecurring();
  const [creating, setCreating] = useState(false);
  const [pausing, setPausing] = useState<RecurringReset | null>(null);

  const placeName = (id: string) => places.data?.results.find((p) => p.id === id)?.name ?? "Unknown place";

  const columns: Column<RecurringReset>[] = [
    { key: "place", header: "Place", mobile: "title", cell: (r) => placeName(r.place) },
    { key: "when", header: "Repeats", cell: describe },
    { key: "scope", header: "Scope", cell: (r) => SCOPE[r.scopeType] },
    { key: "next", header: "Next reset", cell: (r) => (r.nextOccurrence ? formatInZone(r.nextOccurrence, r.timezone) : "—") },
    {
      key: "status",
      header: "Status",
      mobile: "badge",
      cell: (r) => <StatusBadge label={r.isActive ? "Active" : "Paused"} tone={r.isActive ? "success" : "muted"} />,
    },
    {
      key: "actions",
      header: "Actions",
      cell: (r) =>
        r.isActive ? (
          canPause && (
            <button type="button" className={`${btnSecondary} !px-3 !py-1.5`} onClick={() => setPausing(r)}>
              Pause
            </button>
          )
        ) : (
          canCreate && (
            <button
              type="button"
              className={`${btnSecondary} !px-3 !py-1.5`}
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ id: r.id, activate: true })}
            >
              Resume
            </button>
          )
        ),
    },
  ];

  const rows = data?.results ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Link to="/app/hard-logout" className="text-sm text-[var(--primary)] hover:underline">
        ← Wizyfi
      </Link>
      <PageHeader
        title="Recurring resets"
        description="Reset a place at the same time every day or on chosen weekdays. Each occurrence appears in history and can be cancelled on its own."
        actions={
          canCreate && (
            <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
              New recurring reset
            </button>
          )
        }
      />

      {toggle.error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {toggle.error instanceof Error ? toggle.error.message : "Could not update the rule."}
        </p>
      )}
      {isLoading && <TableSkeleton columns={6} />}
      {isError && <ErrorState message={error instanceof Error ? error.message : "Could not load recurring resets."} onRetry={() => refetch()} />}
      {data && rows.length === 0 && (
        <EmptyState
          title="No recurring resets"
          description="Create one so access that lasts until the next reset always has a reset to end at."
          action={
            canCreate ? (
              <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
                New recurring reset
              </button>
            ) : undefined
          }
        />
      )}
      {rows.length > 0 && <DataTable caption="Recurring resets" rows={rows} columns={columns} rowKey={(r) => r.id} />}

      {creating && <CreateDialog onClose={() => setCreating(false)} />}
      {pausing && <PauseDialog rule={pausing} placeName={placeName(pausing.place)} onClose={() => setPausing(null)} />}
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateRecurring();
  const places = usePlacesLite();
  const [placeId, setPlaceId] = useState("");
  const [mode, setMode] = useState<"PLACE" | "ROUTERS">("PLACE");
  const [routerIds, setRouterIds] = useState<string[]>([]);
  const [time, setTime] = useState("00:00");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [confirm, setConfirm] = useState("");
  const routers = useRoutersLite(placeId || undefined);

  const place = places.data?.results.find((p) => p.id === placeId);
  const scopeValid = Boolean(place) && (mode === "PLACE" || routerIds.length > 0);
  const confirmOk = mode !== "PLACE" || confirm.trim() === place?.name;
  const valid = scopeValid && /^\d{2}:\d{2}$/.test(time) && confirmOk;

  const toggleDay = (d: number) => setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  const toggleRouter = (id: string) => setRouterIds((cur) => (cur.includes(id) ? cur.filter((r) => r !== id) : [...cur, id]));

  const fe = create.error instanceof ApiError ? create.error.fieldErrors : undefined;
  const msg = create.error ? (fe?.detail?.[0] ?? (create.error instanceof Error ? create.error.message : "Could not create the rule.")) : null;

  const submit = () =>
    create.mutate(
      {
        place: placeId,
        scopeType: mode === "PLACE" ? "PLACE" : routerIds.length === 1 ? "ROUTER" : "ROUTERS",
        routerIds: mode === "PLACE" ? [] : routerIds,
        timeOfDay: time,
        weekdays,
      },
      { onSuccess: onClose }
    );

  return (
    <Dialog
      title="New recurring reset"
      description="Everyone in scope is disconnected at this time on each chosen day and must sign in again."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={!valid || create.isPending} onClick={submit}>
            {create.isPending ? "Creating…" : "Create recurring reset"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Place">
          <select
            value={placeId}
            onChange={(e) => {
              setPlaceId(e.target.value);
              setRouterIds([]);
              setConfirm("");
            }}
            className={inputClass}
          >
            <option value="">Select a place</option>
            {places.data?.results.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        {place && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">What should be disconnected?</legend>
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input type="radio" name="rr-mode" checked={mode === "PLACE"} onChange={() => setMode("PLACE")} />
              Every router in {place.name}
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input type="radio" name="rr-mode" checked={mode === "ROUTERS"} onChange={() => setMode("ROUTERS")} />
              Selected routers
            </label>
            {mode === "ROUTERS" && (
              <div className="ml-6 flex flex-col gap-2">
                {routers.data?.results.length === 0 && <p className="text-sm text-[var(--foreground-secondary)]">This place has no routers yet.</p>}
                {routers.data?.results.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                    <input type="checkbox" checked={routerIds.includes(r.id)} disabled={r.status === "DISABLED"} onChange={() => toggleRouter(r.id)} />
                    {r.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}

        <Field label="Time (24-hour)" hint={place ? `In the place's time zone: ${place.timezone}.` : "Uses the place's time zone."}>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </Field>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">Days</legend>
          <div role="group" className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={weekdays.includes(i)}
                onClick={() => toggleDay(i)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${
                  weekdays.includes(i)
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "border-[var(--border)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-[var(--foreground-muted)]">{weekdays.length === 0 ? "No day selected means every day." : "Only on the selected days."}</p>
        </fieldset>

        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] p-3 text-xs text-[var(--foreground-secondary)]">
          Plans set to end at the next reset will end at each occurrence. Customers who connect in the last hour before a reset get
          their voucher back so they can use it again afterwards.
        </div>

        {mode === "PLACE" && place && (
          <Field label={`Type "${place.name}" to confirm this affects the whole place`}>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </Field>
        )}
        {msg && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {msg}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function PauseDialog({ rule, placeName, onClose }: { rule: RecurringReset; placeName: string; onClose: () => void }) {
  const toggle = useToggleRecurring();
  return (
    <Dialog
      title="Pause this recurring reset?"
      description={`${placeName} · ${describe(rule)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>
            Keep it
          </button>
          <button
            type="button"
            className={btnPrimary}
            disabled={toggle.isPending}
            onClick={() => toggle.mutate({ id: rule.id, activate: false }, { onSuccess: onClose })}
          >
            {toggle.isPending ? "Pausing…" : "Pause"}
          </button>
        </>
      }
    >
      <p className="text-sm text-[var(--foreground-secondary)]">
        Its upcoming resets are cancelled and no new ones are created. Customers whose access was set to end at those resets move to the next
        scheduled reset, or get a fresh full fallback duration if none is scheduled. You can resume it later.
      </p>
      {toggle.error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {toggle.error instanceof Error ? toggle.error.message : "Could not pause."}
        </p>
      )}
    </Dialog>
  );
}
