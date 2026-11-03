// Quick lifecycle actions for an access plan, straight from the list:
//   DRAFT/PAUSED -> Activate · ACTIVE -> Pause · any live state -> Archive · ARCHIVED -> Restore (as draft).
// A plan is never deleted from the UI: vouchers, sessions and sales reference it,
// so retiring it means Archive (the API also refuses to delete a plan in use).
import { useState } from "react";
import { Dialog } from "../../../components/ui/Dialog";
import { btnDanger, btnGhost } from "../../../components/ui/styles";
import type { AccessPlan, AccessPlanStatus } from "../../../types/accessPlan";
import { useUpdatePlan } from "../hooks/usePlans";

const small = "!px-2.5 !py-1.5 !text-xs";

export function PlanStatusActions({ plan }: { plan: AccessPlan }) {
  const update = useUpdatePlan();
  const [archiving, setArchiving] = useState(false);

  const set = (status: AccessPlanStatus, done?: () => void) =>
    update.mutate({ id: plan.id, input: { status } }, { onSuccess: done });

  return (
    <>
      {(plan.status === "DRAFT" || plan.status === "PAUSED") && (
        <button type="button" className={`${btnGhost} ${small}`} disabled={update.isPending} onClick={() => set("ACTIVE")}>
          Activate
        </button>
      )}
      {plan.status === "ACTIVE" && (
        <button type="button" className={`${btnGhost} ${small}`} disabled={update.isPending} onClick={() => set("PAUSED")}>
          Pause
        </button>
      )}
      {plan.status === "ARCHIVED" ? (
        <button type="button" className={`${btnGhost} ${small}`} disabled={update.isPending} onClick={() => set("DRAFT")}>
          Restore
        </button>
      ) : (
        <button type="button" className={`${btnGhost} ${small}`} onClick={() => setArchiving(true)}>
          Archive
        </button>
      )}
      {update.isError && !archiving && (
        <span role="alert" className="text-xs text-[var(--danger-text)]">
          {update.error instanceof Error ? update.error.message : "Could not update."}
        </span>
      )}

      {archiving && (
        <Dialog
          title={`Archive ${plan.name}?`}
          description="Customers stop seeing it on the captive portal. Vouchers already generated for it can still be redeemed, and sales history is kept. You can restore it later."
          onClose={() => setArchiving(false)}
          footer={
            <>
              <button type="button" className={btnGhost} onClick={() => setArchiving(false)}>
                Keep it
              </button>
              <button type="button" className={btnDanger} disabled={update.isPending} onClick={() => set("ARCHIVED", () => setArchiving(false))}>
                {update.isPending ? "Archiving…" : "Archive plan"}
              </button>
            </>
          }
        >
          {update.isError && (
            <p role="alert" className="text-sm text-[var(--danger-text)]">
              {update.error instanceof Error ? update.error.message : "Could not archive."}
            </p>
          )}
        </Dialog>
      )}
    </>
  );
}
