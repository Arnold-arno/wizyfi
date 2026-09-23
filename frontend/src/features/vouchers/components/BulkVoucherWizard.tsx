// src/features/vouchers/components/BulkVoucherWizard.tsx
//
// Flow per doc02 §5 / doc04 §7: quantity → plan/rules → review → generate
// → result. Must "prevent accidental large generation" — enforced here
// via a hard client-side ceiling plus a typed confirmation for any batch
// above the everyday threshold. The server remains the actual authority.

import { useMemo, useState } from "react";
import { usePlans } from "../../access/hooks/usePlans";
import { useCreateVoucherBatch } from "../hooks/useVoucherBatch";
import type { VoucherBatchRules } from "../../../types/voucher";

const MAX_BATCH_SIZE = 5000;
const CONFIRMATION_THRESHOLD = 500; // above this, require typed confirmation

type Step = "quantity" | "review" | "result";

interface BulkVoucherWizardProps {
  onClose: () => void;
}

export function BulkVoucherWizard({ onClose }: BulkVoucherWizardProps) {
  const [step, setStep] = useState<Step>("quantity");
  const [rules, setRules] = useState<VoucherBatchRules>({
    planId: "",
    quantity: 10,
  });
  const [confirmationText, setConfirmationText] = useState("");

  const { data: plansPage } = usePlans({ status: "ACTIVE", pageSize: 100 });
  const createBatch = useCreateVoucherBatch();

  const idempotencyKey = useMemo(() => crypto.randomUUID(), []); // stable for this wizard session

  const requiresTypedConfirmation = rules.quantity > CONFIRMATION_THRESHOLD;
  const confirmationSatisfied =
    !requiresTypedConfirmation || confirmationText.trim() === String(rules.quantity);

  const quantityValid =
    rules.planId.length > 0 && rules.quantity > 0 && rules.quantity <= MAX_BATCH_SIZE;

  const handleGenerate = () => {
    createBatch.mutate(
      { ...rules, idempotencyKey },
      { onSuccess: () => setStep("result") }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-md)]">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Generate vouchers</h2>

        {step === "quantity" && (
          <div className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--foreground)]">Plan</span>
              <select
                value={rules.planId}
                onChange={(e) => setRules({ ...rules, planId: e.target.value })}
                className={inputClass}
              >
                <option value="">Select a plan</option>
                {plansPage?.results.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--foreground)]">
                Quantity (max {MAX_BATCH_SIZE.toLocaleString()})
              </span>
              <input
                type="number"
                min={1}
                max={MAX_BATCH_SIZE}
                value={rules.quantity}
                onChange={(e) => setRules({ ...rules, quantity: Number(e.target.value) })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-[var(--foreground)]">Expiry (optional)</span>
              <input
                type="date"
                onChange={(e) =>
                  setRules({
                    ...rules,
                    expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  })
                }
                className={inputClass}
              />
            </label>
          </div>
        )}

        {step === "review" && (
          <div className="mt-4 flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-[var(--foreground-secondary)]">Plan</dt>
              <dd className="text-[var(--foreground)]">
                {plansPage?.results.find((p) => p.id === rules.planId)?.name ?? rules.planId}
              </dd>
              <dt className="text-[var(--foreground-secondary)]">Quantity</dt>
              <dd className="text-[var(--foreground)]">{rules.quantity.toLocaleString()}</dd>
              <dt className="text-[var(--foreground-secondary)]">Expiry</dt>
              <dd className="text-[var(--foreground)]">{rules.expiresAt ?? "No expiry"}</dd>
            </dl>

            {requiresTypedConfirmation && (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-[var(--danger)]">
                  This generates {rules.quantity.toLocaleString()} vouchers. Type the quantity to
                  confirm.
                </span>
                <input
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  className={inputClass}
                  placeholder={String(rules.quantity)}
                />
              </label>
            )}

            {createBatch.isError && (
              <p className="text-sm text-[var(--danger)]">
                Generation failed. No vouchers were created — you can retry safely.
              </p>
            )}
          </div>
        )}

        {step === "result" && createBatch.data && (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-[var(--foreground)]">
              {createBatch.data.quantity.toLocaleString()} vouchers generated.
            </p>
            <p className="text-xs text-[var(--foreground-secondary)]">
              Codes are shown once. Export or copy them now — they will be masked everywhere else.
            </p>
            <textarea
              readOnly
              value={createBatch.data.codes.join("\n")}
              rows={8}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-[var(--foreground-secondary)] hover:bg-[var(--surface-elevated)]"
          >
            {step === "result" ? "Done" : "Cancel"}
          </button>

          {step === "quantity" && (
            <button
              type="button"
              disabled={!quantityValid}
              onClick={() => setStep("review")}
              className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Continue
            </button>
          )}
          {step === "review" && (
            <button
              type="button"
              disabled={!confirmationSatisfied || createBatch.isPending}
              onClick={handleGenerate}
              className="rounded-md bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {createBatch.isPending ? "Generating…" : "Generate vouchers"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]";
