// Route: /portal/:placeId — the customer-facing captive portal (doc04 §11).
// Opened from the router's sign-in redirect as /portal/<place>?router=<id>&mac=<mac>.
// Flow: welcome + plans (what you can get) -> voucher entry -> session result.
//
// Honesty rules:
//  * no payments exist yet, so plans are informational: access comes from a voucher;
//  * "Voucher accepted" only after the backend returns a session;
//  * without router + mac the form is disabled and says why (never a silent failure);
//  * a voucher code is never stored in the browser.
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ErrorState } from "../../components/ui/ErrorState";
import { Field } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/Skeleton";
import { btnPrimary, inputClass } from "../../components/ui/styles";
import { ApiError } from "../../lib/api/client";
import { portalApi, type PortalPlan } from "../../lib/api/portalApi";
import { formatDateTime, formatMoney } from "../../lib/format";
import { PRODUCT } from "../../lib/brand";

/** "abcd1234" -> "ABCD-1234". Prefixed or already-hyphenated codes pass through upper-cased. */
export function normalizeCode(raw: string): string {
  const c = raw.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z0-9]{8}$/.test(c) ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

export function formatDuration(minutes: number): string {
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? "day" : "days"}`;
  if (minutes % 60 === 0) return `${minutes / 60} ${minutes === 60 ? "hour" : "hours"}`;
  return `${minutes} minutes`;
}

function PlanCard({ plan }: { plan: PortalPlan }) {
  const untilReset = plan.validityMode === "UNTIL_NEXT_RESET";
  const limits = [
    plan.dataCapMb ? `${(plan.dataCapMb / 1024).toFixed(1)} GB data` : "Unlimited data",
    plan.maxConcurrentDevices ? `${plan.maxConcurrentDevices} ${plan.maxConcurrentDevices === 1 ? "device" : "devices"}` : null,
  ].filter(Boolean);
  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold">{plan.name}</h3>
        <p className="text-base font-bold tabular-nums">{formatMoney(plan.price, plan.currency)}</p>
      </div>
      <p className="mt-1 text-sm text-[var(--foreground-secondary)]">
        {untilReset
          ? plan.accessEndsAt
            ? `Access until ${formatDateTime(plan.accessEndsAt)}`
            : `Access until the next network reset (up to ${formatDuration(plan.durationMinutes)})`
          : formatDuration(plan.durationMinutes)}
      </p>
      <p className="mt-1 text-xs text-[var(--foreground-muted)]">{limits.join(" · ")}</p>
      {plan.description && <p className="mt-2 text-sm text-[var(--foreground-secondary)]">{plan.description}</p>}
    </li>
  );
}

export function PortalPage() {
  const { placeId = "" } = useParams<{ placeId: string }>();
  const [search] = useSearchParams();
  const routerId = search.get("router") ?? "";
  const mac = (search.get("mac") ?? "").toUpperCase();
  const canRedeem = routerId !== "" && /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/.test(mac);

  const welcome = useQuery({ queryKey: ["portal", "welcome", placeId], queryFn: () => portalApi.welcome(placeId), retry: false });
  const plans = useQuery({
    queryKey: ["portal", "plans", placeId, routerId],
    queryFn: () => portalApi.plans(placeId, routerId || undefined),
    enabled: welcome.isSuccess,
  });

  const [code, setCode] = useState("");
  const redeem = useMutation({
    mutationFn: () => portalApi.redeem(placeId, { code: normalizeCode(code), macAddress: mac.replace(/-/g, ":"), routerId }),
    onSuccess: () => setCode(""), // never keep a redeemed code around
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!redeem.isPending && canRedeem && code.trim() !== "") redeem.mutate();
  };

  const err = redeem.error;
  const errMsg =
    err instanceof ApiError
      ? err.status === 429
        ? "Too many attempts. Wait a minute, then try again."
        : (err.fieldErrors ? Object.values(err.fieldErrors).flat()[0] : undefined) ?? err.message
      : err instanceof Error
        ? err.message
        : null;

  if (welcome.isLoading) {
    return (
      <div className="mx-auto max-w-md p-6" role="status" aria-label="Loading">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    );
  }
  if (welcome.isError || !welcome.data) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState
          title="This network isn't available"
          message="The sign-in page for this location is switched off or the link is wrong. Ask the venue staff for help."
          onRetry={() => welcome.refetch()}
        />
      </div>
    );
  }

  const w = welcome.data;
  const session = redeem.data;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <header className="wz-brand-panel px-4 py-6 text-center text-white">
        <img src="/brand/icon-192.png" alt="" aria-hidden="true" className="mx-auto h-14 w-14 rounded-xl" />
        <h1 className="mt-3 text-xl font-bold">{w.placeName}</h1>
        <p className="mt-1 text-sm text-slate-300">{w.welcomeMessage || "Welcome. Enter your voucher code to get online."}</p>
      </header>

      <main className="wz-page mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
        {session ? (
          <section role="status" className="rounded-xl border border-[var(--success)] bg-[var(--success-soft)] p-5 text-[var(--success-text)]">
            <h2 className="text-lg font-semibold">Voucher accepted</h2>
            <p className="mt-1 text-sm">
              {session.planName ? `${session.planName}. ` : ""}
              {session.expiresAt ? `Your access runs until ${formatDateTime(session.expiresAt)}.` : "Your access has no end time."}
            </p>
          </section>
        ) : (
          <section aria-labelledby="voucher-h" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <h2 id="voucher-h" className="text-base font-semibold">Enter your voucher</h2>
            {!canRedeem && (
              <p role="alert" className="mt-2 text-sm text-[var(--danger-text)]">
                Open this page from the Wi-Fi sign-in screen so your device can be identified. Voucher entry is switched off until then.
              </p>
            )}
            <form onSubmit={submit} className="mt-4 flex flex-col gap-4" noValidate aria-busy={redeem.isPending}>
              <Field label="Voucher code" hint="For example ABCD-1234">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={!canRedeem}
                  className={`${inputClass} py-3 font-mono text-base tracking-wider`}
                />
              </Field>
              {errMsg && (
                <p role="alert" className="text-sm text-[var(--danger-text)]">
                  {errMsg}
                </p>
              )}
              <button type="submit" className={`${btnPrimary} w-full py-3`} disabled={!canRedeem || code.trim() === "" || redeem.isPending}>
                {redeem.isPending ? "Checking…" : "Connect"}
              </button>
            </form>
          </section>
        )}

        <section aria-labelledby="plans-h">
          <h2 id="plans-h" className="text-base font-semibold">Access plans</h2>
          <p className="mt-1 text-sm text-[var(--foreground-secondary)]">
            Get a voucher from {w.supportContact ? <span className="font-medium text-[var(--foreground)]">{w.supportContact}</span> : "the venue staff"}.
          </p>
          {plans.isLoading && <Skeleton className="mt-3 h-24 w-full" />}
          {plans.isError && <p className="mt-3 text-sm text-[var(--foreground-secondary)]">Couldn't load the plans right now.</p>}
          {plans.data && plans.data.length === 0 && (
            <p className="mt-3 text-sm text-[var(--foreground-secondary)]">No plans are on offer at the moment.</p>
          )}
          {plans.data && plans.data.length > 0 && (
            <ul className="mt-3 flex flex-col gap-3">
              {plans.data.map((p) => (
                <PlanCard key={p.id} plan={p} />
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="px-4 pb-8 text-center text-xs text-[var(--foreground-muted)]">
        {w.termsUrl.startsWith("http") && (
          <a href={w.termsUrl} target="_blank" rel="noopener noreferrer" className="underline">
            Terms of use
          </a>
        )}
        <p className="mt-1">Powered by {PRODUCT}</p>
      </footer>
    </div>
  );
}
