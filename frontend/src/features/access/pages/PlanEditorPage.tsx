// src/features/access/pages/PlanEditorPage.tsx
//
// Routes: /app/access-plans/new and /app/access-plans/:id (edit).

import { useNavigate, useParams } from "react-router-dom";
import { usePlan } from "../hooks/usePlan";
import { useCreatePlan, useUpdatePlan } from "../hooks/usePlans";
import { PlanEditorForm } from "../components/PlanEditorForm";
import { ErrorState } from "../../../components/ui/ErrorState";
import type { AccessPlanInput } from "../../../types/accessPlan";
import { ApiError } from "../../../lib/api/client";

export function PlanEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const navigate = useNavigate();

  const { data: existingPlan, isLoading, isError } = usePlan(id);
  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();

  const submitting = createPlan.isPending || updatePlan.isPending;
  const mutationError = createPlan.error ?? updatePlan.error;
  const fieldErrors =
    mutationError instanceof ApiError ? mutationError.fieldErrors : undefined;

  const handleSubmit = (input: AccessPlanInput) => {
    if (isEditing && id) {
      updatePlan.mutate(
        { id, input },
        { onSuccess: () => navigate("/app/access-plans") }
      );
    } else {
      createPlan.mutate(input, {
        onSuccess: () => navigate("/app/access-plans"),
      });
    }
  };

  if (isEditing && isLoading) {
    return <p className="text-sm text-[var(--foreground-secondary)]">Loading plan…</p>;
  }

  if (isEditing && isError) {
    return <ErrorState message="Could not load this plan." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[24px] font-bold text-[var(--foreground)]">
          {isEditing ? "Edit plan" : "Create plan"}
        </h1>
      </header>

      {mutationError && !fieldErrors && (
        <ErrorState
          message={
            mutationError instanceof Error ? mutationError.message : "Could not save this plan."
          }
        />
      )}

      <PlanEditorForm
        initialValue={
          existingPlan
            ? {
                name: existingPlan.name,
                description: existingPlan.description,
                price: existingPlan.price,
                currency: existingPlan.currency,
                durationMinutes: existingPlan.durationMinutes,
                quota: existingPlan.quota,
                availability: existingPlan.availability,
                status: existingPlan.status,
              }
            : undefined
        }
        submitting={submitting}
        fieldErrors={fieldErrors}
        onSubmit={handleSubmit}
        onCancel={() => navigate("/app/access-plans")}
      />
    </div>
  );
}
