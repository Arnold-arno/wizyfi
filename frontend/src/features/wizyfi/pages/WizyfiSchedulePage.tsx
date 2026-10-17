// Route: /app/hard-logout/schedule — doc02 §6 contract:
// Scope -> Time (+timezone) -> Impact & consequence -> Review -> Schedule.
// No ambiguous "all": the whole-place scope needs the place name typed back.

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorState } from "../../../components/ui/ErrorState";
import { Field } from "../../../components/ui/Field";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel } from "../../../components/ui/Panel";
import { btnGhost, btnPrimary, btnSecondary, inputClass } from "../../../components/ui/styles";
import { usePermissions } from "../../../hooks/usePermissions";
import { ApiError } from "../../../lib/api/client";
import { formatInZone, zonedWallTimeToUtc } from "../../../lib/wizyfiTime";
import type { HardLogoutScope } from "../../../types/wizyfi";
import { useImpactEstimate, usePlacesLite, useRoutersLite, useScheduleHardLogout } from "../hooks/useWizyfi";

type Step = "scope" | "time" | "impact" | "review";
const STEPS: Array<{ id: Step; label: string }> = [
  { id: "scope", label: "Scope" },
  { id: "time", label: "Time" },
  { id: "impact", label: "Impact" },
  { id: "review", label: "Review" },
];

export function WizyfiSchedulePage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canEstimate = hasPermission("connections:view");

  const [step, setStep] = useState<Step>("scope");
  const [placeId, setPlaceId] = useState("");
  const [mode, setMode] = useState<"PLACE" | "ROUTERS">("ROUTERS");
  const [routerIds, setRouterIds] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const places = usePlacesLite();
  const routers = useRoutersLite(placeId || undefined);
  const schedule = useScheduleHardLogout();

  const place = places.data?.results.find((p) => p.id === placeId);
  const tz = place?.timezone ?? "UTC";
  const scopeType: HardLogoutScope = mode === "PLACE" ? "PLACE" : routerIds.length === 1 ? "ROUTER" : "ROUTERS";
  const effectiveRouterIds = mode === "PLACE" ? [] : routerIds;

  const scheduledUtc = useMemo(
    () => (date && time && place ? zonedWallTimeToUtc(date, time, tz) : null),
    [date, time, place, tz]
  );
  const timeValid = scheduledUtc !== null && !Number.isNaN(scheduledUtc.getTime()) && scheduledUtc.getTime() > Date.now() + 60_000;
  const scopeValid = Boolean(place) && (mode === "PLACE" || routerIds.length > 0);

  const estimate = useImpactEstimate(
    canEstimate && scopeValid && (step === "impact" || step === "review")
      ? { mode, placeId, routerIds: effectiveRouterIds }
      : null
  );

  const needsTyped = mode === "PLACE";
  const confirmOk = !needsTyped || confirmText.trim() === place?.name;

  const idx = STEPS.findIndex((s) => s.id === step);
  const canContinue = step === "scope" ? scopeValid : step === "time" ? timeValid : true;

  const goBack = () => {
    if (step === "review") setIdempotencyKey(crypto.randomUUID()); // inputs may change -> new intent
    setStep(STEPS[Math.max(idx - 1, 0)].id);
  };

  const submit = () => {
    if (!scheduledUtc || !timeValid) return;
    schedule.mutate(
      {
        place: placeId,
        scopeType,
        routerIds: effectiveRouterIds,
        scheduledAt: scheduledUtc.toISOString(),
        scheduledTimezone: tz,
        impactEstimateConnections: estimate.data ?? null,
        idempotencyKey,
      },
      { onSuccess: (event) => navigate(`/app/hard-logout/${event.id}`, { replace: true }) }
    );
  };

  const err = schedule.error;
  const errMsg =
    err instanceof ApiError ? (err.fieldErrors?.detail?.[0] ?? err.message) : err instanceof Error ? err.message : null;

  const toggleRouter = (id: string) =>
    setRouterIds((cur) => (cur.includes(id) ? cur.filter((r) => r !== id) : [...cur, id]));

  return (
    <div className="flex flex-col gap-6">
      <Link to="/app/hard-logout" className="text-sm text-[var(--primary)] hover:underline">
        ← Wizyfi
      </Link>
      <PageHeader title="Schedule hard logout" description="Disconnect active users at an exact time. They will need to sign in again." />

      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.id === step ? "step" : undefined}
            className={`rounded-full border px-3 py-1.5 font-medium ${
              s.id === step
                ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                : i < idx
                  ? "border-[var(--border)] text-[var(--foreground)]"
                  : "border-[var(--border)] text-[var(--foreground-muted)]"
            }`}
          >
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {places.isError && <ErrorState message="Could not load your places." onRetry={() => places.refetch()} />}

      <Panel title={STEPS[idx].label}>
        {step === "scope" && (
          <div className="flex flex-col gap-4">
            <Field label="Place">
              <select
                value={placeId}
                onChange={(e) => {
                  setPlaceId(e.target.value);
                  setRouterIds([]);
                  setConfirmText("");
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
              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-sm font-medium text-[var(--foreground)]">What should be disconnected?</legend>
                <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <input type="radio" name="mode" checked={mode === "ROUTERS"} onChange={() => setMode("ROUTERS")} />
                  Selected routers
                </label>
                {mode === "ROUTERS" && (
                  <div className="ml-6 flex flex-col gap-2">
                    {routers.isLoading && <p className="text-sm text-[var(--foreground-secondary)]">Loading routers…</p>}
                    {routers.data?.results.length === 0 && (
                      <p className="text-sm text-[var(--foreground-secondary)]">This place has no routers yet.</p>
                    )}
                    {routers.data?.results.map((r) => (
                      <label key={r.id} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                        <input
                          type="checkbox"
                          checked={routerIds.includes(r.id)}
                          disabled={r.status === "DISABLED"}
                          onChange={() => toggleRouter(r.id)}
                        />
                        {r.name}
                        <span className="text-xs text-[var(--foreground-muted)]">
                          {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <input type="radio" name="mode" checked={mode === "PLACE"} onChange={() => setMode("PLACE")} />
                  Every router in {place.name}
                </label>
              </fieldset>
            )}
          </div>
        )}

        {step === "time" && place && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Date">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Time (24-hour)">
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <p className="text-sm text-[var(--foreground-secondary)]">
              Time zone: <span className="font-medium text-[var(--foreground)]">{tz}</span> (the timezone of {place.name}).
            </p>
            {scheduledUtc && !Number.isNaN(scheduledUtc.getTime()) && (
              <p className="text-xs text-[var(--foreground-muted)]">
                Runs at {scheduledUtc.toISOString().replace(".000Z", "Z")} (UTC).
              </p>
            )}
            {date && time && !timeValid && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                Choose a time at least one minute in the future.
              </p>
            )}
          </div>
        )}

        {step === "impact" && (
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-[var(--foreground)]">
              {!canEstimate
                ? "An impact estimate isn't available for your role."
                : estimate.isLoading
                  ? "Estimating affected connections…"
                  : estimate.isError
                    ? "Couldn't estimate the impact. You can still continue."
                    : `About ${estimate.data} active connection(s) are in scope right now.`}
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">
              This is an estimate. Connections change between now and the scheduled time.
            </p>
            <p className="text-xs text-[var(--foreground-muted)]">
              Customers on plans that last until the next reset, and who connect before this time, will end exactly here.
            </p>
            <div className="rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-[var(--foreground)]">
              <p className="font-medium">What users will experience</p>
              <p className="mt-1 text-[var(--foreground-secondary)]">
                Everyone in scope is disconnected at the same moment and must log in again to keep using the network.
                Anyone who got in with a single-use voucher will need a new voucher — a redeemed voucher can't be used twice.
              </p>
            </div>
          </div>
        )}

        {step === "review" && place && scheduledUtc && (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-[var(--foreground-secondary)]">Place</dt>
              <dd className="text-[var(--foreground)]">{place.name}</dd>
              <dt className="text-[var(--foreground-secondary)]">Scope</dt>
              <dd className="text-[var(--foreground)]">
                {mode === "PLACE"
                  ? "Every router in this place (resolved when it runs)"
                  : routers.data?.results.filter((r) => routerIds.includes(r.id)).map((r) => r.name).join(", ")}
              </dd>
              <dt className="text-[var(--foreground-secondary)]">When</dt>
              <dd className="text-[var(--foreground)]">{formatInZone(scheduledUtc.toISOString(), tz)}</dd>
              <dt className="text-[var(--foreground-secondary)]">Estimated impact</dt>
              <dd className="text-[var(--foreground)]">
                {estimate.data !== undefined ? `${estimate.data} connection(s) (estimate)` : "Not available"}
              </dd>
              <dt className="text-[var(--foreground-secondary)]">Consequence</dt>
              <dd className="text-[var(--foreground)]">Everyone logs in again; single-use vouchers need replacing.</dd>
            </dl>

            {needsTyped && (
              <Field label={`Type "${place.name}" to confirm this affects the whole place`}>
                <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={inputClass} />
              </Field>
            )}

            {errMsg && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {errMsg}
              </p>
            )}
          </div>
        )}
      </Panel>

      <div className="flex items-center justify-between">
        <button type="button" className={btnGhost} onClick={() => navigate("/app/hard-logout")}>
          Cancel
        </button>
        <div className="flex gap-2">
          {idx > 0 && (
            <button type="button" className={btnSecondary} onClick={goBack}>
              Back
            </button>
          )}
          {step !== "review" ? (
            <button type="button" className={btnPrimary} disabled={!canContinue} onClick={() => setStep(STEPS[idx + 1].id)}>
              Continue
            </button>
          ) : (
            <button type="button" className={btnPrimary} disabled={!confirmOk || schedule.isPending} onClick={submit}>
              {schedule.isPending ? "Scheduling…" : "Schedule hard logout"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
