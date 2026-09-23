// src/features/access/components/PlanEditorForm.tsx
//
// Step order per doc04 §7 "Plan editor": basics → pricing/duration →
// limits → availability → review. Per doc05 §7 form contract: labels
// always visible, inline validation, submit state prevents duplicate
// requests, destructive/network mutation reviewed explicitly before commit.

import { useMemo, useState } from "react";
import type { AccessPlanInput, AccessPlanStatus } from "../../../types/accessPlan";
import { PlanPreview } from "./PlanPreview";

type Step = "basics" | "pricing" | "limits" | "availability" | "review";
const STEPS: Step[] = ["basics", "pricing", "limits", "availability", "review"];
const STEP_LABELS: Record<Step, string> = {
  basics: "Basics",
  pricing: "Pricing & duration",
  limits: "Limits",
  availability: "Availability",
  review: "Review",
};

const EMPTY: AccessPlanInput = {
  name: "",
  description: "",
  price: 0,
  currency: "UGX",
  durationMinutes: 60,
  quota: { dataCapMb: null, maxConcurrentDevices: 1 },
  availability: { isPubliclyListed: true },
  status: "DRAFT",
};

interface PlanEditorFormProps {
  initialValue?: AccessPlanInput;
  submitting?: boolean;
  fieldErrors?: Record<string, string[]>;
  onSubmit: (input: AccessPlanInput) => void;
  onCancel: () => void;
}

export function PlanEditorForm({
  initialValue,
  submitting,
  fieldErrors,
  onSubmit,
  onCancel,
}: PlanEditorFormProps) {
  const [step, setStep] = useState<Step>("basics");
  const [value, setValue] = useState<AccessPlanInput>(initialValue ?? EMPTY);

  const stepIndex = STEPS.indexOf(step);

  const basicsValid = value.name.trim().length > 0;
  const pricingValid = value.price >= 0 && value.durationMinutes > 0;
  const canGoNext = step === "basics" ? basicsValid : step === "pricing" ? pricingValid : true;

  const errorFor = (field: string) => fieldErrors?.[field]?.[0];

  const goNext = () => canGoNext && setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)]);
  const goBack = () => setStep(STEPS[Math.max(stepIndex - 1, 0)]);

  const previewPlan = useMemo(
    () => ({
      id: "preview",
      providerId: "preview",
      createdAt: "",
      updatedAt: "",
      ...value,
    }),
    [value]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Step indicator — reflects real sequence, not decorative numbering */}
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => setStep(s)}
              disabled={i > stepIndex && !canGoNext}
              className={`rounded-full border px-3 py-1.5 font-medium transition-colors ${
                s === step
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]"
              }`}
            >
              {STEP_LABELS[s]}
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        {step === "basics" && (
          <div className="flex flex-col gap-4">
            <Field label="Plan name" error={errorFor("name")}>
              <input
                value={value.name}
                onChange={(e) => setValue({ ...value, name: e.target.value })}
                placeholder="e.g. 1-Day Unlimited"
                className={inputClass}
              />
            </Field>
            <Field label="Description (optional)">
              <textarea
                value={value.description}
                onChange={(e) => setValue({ ...value, description: e.target.value })}
                rows={3}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {step === "pricing" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Price" error={errorFor("price")}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={value.price}
                onChange={(e) => setValue({ ...value, price: Number(e.target.value) })}
                className={inputClass}
              />
            </Field>
            <Field label="Currency">
              <input
                value={value.currency}
                onChange={(e) => setValue({ ...value, currency: e.target.value.toUpperCase() })}
                maxLength={3}
                className={inputClass}
              />
            </Field>
            <Field label="Duration (minutes)" error={errorFor("durationMinutes")}>
              <input
                type="number"
                min={1}
                value={value.durationMinutes}
                onChange={(e) =>
                  setValue({ ...value, durationMinutes: Number(e.target.value) })
                }
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {step === "limits" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Data cap (MB, blank = unlimited)">
              <input
                type="number"
                min={0}
                value={value.quota.dataCapMb ?? ""}
                onChange={(e) =>
                  setValue({
                    ...value,
                    quota: {
                      ...value.quota,
                      dataCapMb: e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
                className={inputClass}
              />
            </Field>
            <Field label="Max concurrent devices (blank = unlimited)">
              <input
                type="number"
                min={0}
                value={value.quota.maxConcurrentDevices ?? ""}
                onChange={(e) =>
                  setValue({
                    ...value,
                    quota: {
                      ...value.quota,
                      maxConcurrentDevices:
                        e.target.value === "" ? null : Number(e.target.value),
                    },
                  })
                }
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {step === "availability" && (
          <div className="flex flex-col gap-4">
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={value.availability.isPubliclyListed}
                onChange={(e) =>
                  setValue({
                    ...value,
                    availability: { ...value.availability, isPubliclyListed: e.target.checked },
                  })
                }
              />
              Show this plan on the captive portal
            </label>
            <Field label="Status">
              <select
                value={value.status}
                onChange={(e) =>
                  setValue({ ...value, status: e.target.value as AccessPlanStatus })
                }
                className={inputClass}
              >
                <option value="DRAFT">Draft — hidden, not billable</option>
                <option value="ACTIVE">Active</option>
                <option value="PAUSED">Paused</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </Field>
          </div>
        )}

        {step === "review" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--foreground-secondary)]">
              This preview must match what customers see on the captive portal.
            </p>
            <PlanPreview plan={previewPlan} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-4 py-2 text-sm font-medium text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]"
        >
          Cancel
        </button>
        <div className="flex gap-2">
          {stepIndex > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-elevated)]"
            >
              Back
            </button>
          )}
          {step !== "review" ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => onSubmit(value)}
              className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save plan"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[var(--foreground)]">{label}</span>
      {children}
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </label>
  );
}
