// Records a real-world payment (e.g. a walk-in paying cash). Distinct from
// voucher redemption (apps.commercial.services docstring). The server creates
// the Sale and its backing Transaction together.
//
// Place is intentionally not offered here: no places hook exists in the
// delivered tree. Add a <select> once your Places feature exposes one — the
// API already accepts placeId.

import { useState } from "react";
import { Dialog } from "../../../components/ui/Dialog";
import { Field } from "../../../components/ui/Field";
import { btnGhost, btnPrimary, inputClass } from "../../../components/ui/styles";
import { ApiError } from "../../../lib/api/client";
import { usePlans } from "../../access/hooks/usePlans";
import { useRecordSale } from "../hooks/useSales";

export function RecordSaleDialog({ onClose }: { onClose: () => void }) {
  const [total, setTotal] = useState("");
  const [currency, setCurrency] = useState("UGX");
  const [planId, setPlanId] = useState("");
  const [reference, setReference] = useState("");

  const { data: plans } = usePlans({ status: "ACTIVE", pageSize: 100 });
  const record = useRecordSale();

  const amount = Number(total);
  const valid = total.trim() !== "" && Number.isFinite(amount) && amount > 0 && /^[A-Za-z]{3}$/.test(currency);

  const fieldErrors = record.error instanceof ApiError ? record.error.fieldErrors : undefined;
  const generalError =
    record.error && !fieldErrors ? (record.error instanceof Error ? record.error.message : "Could not record the sale.") : null;

  const onPlanChange = (id: string) => {
    setPlanId(id);
    const plan = plans?.results.find((p) => p.id === id);
    if (plan) {
      setTotal(String(plan.price));
      setCurrency(plan.currency);
    }
  };

  const submit = () =>
    record.mutate(
      {
        total: amount.toFixed(2),
        currency: currency.toUpperCase(),
        accessPlanId: planId || undefined,
        paymentReference: reference.trim() || undefined,
      },
      { onSuccess: onClose }
    );

  return (
    <Dialog
      title="Record sale"
      description="Log a payment you received. This creates a sale and a ledger transaction together."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={!valid || record.isPending} onClick={submit}>
            {record.isPending ? "Recording…" : "Record sale"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Access plan (optional)">
          <select value={planId} onChange={(e) => onPlanChange(e.target.value)} className={inputClass}>
            <option value="">No plan</option>
            {plans?.results.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Amount received" error={fieldErrors?.total?.[0]}>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Currency" error={fieldErrors?.currency?.[0]}>
            <input
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Payment reference (optional)" hint="For example a mobile-money transaction ID." error={fieldErrors?.paymentReference?.[0]}>
          <input value={reference} maxLength={255} onChange={(e) => setReference(e.target.value)} className={inputClass} />
        </Field>
        {generalError && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {generalError}
          </p>
        )}
      </div>
    </Dialog>
  );
}
