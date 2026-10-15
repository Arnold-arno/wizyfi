// Route: /app/places/new — the dashboard's "Add place" quick action points here.
// On success: straight to the place detail, where "Add router" is the next step.
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel } from "../../../components/ui/Panel";
import { ApiError } from "../../../lib/api/client";
import { useCreatePlace } from "../../network/hooks/useNetwork";
import { PlaceForm } from "../components/PlaceForm";

export function PlaceFormPage() {
  const navigate = useNavigate();
  const create = useCreatePlace();
  const err = create.error;
  const fieldErrors = err instanceof ApiError ? err.fieldErrors : undefined;
  const general = err && !fieldErrors ? (err instanceof Error ? err.message : "Could not add the place.") : null;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/app/places" className="text-sm text-[var(--primary)] hover:underline">
        ← Places
      </Link>
      <PageHeader title="Add place" description="Next you'll add a router and verify it." />
      <Panel title="Place details" className="max-w-xl">
        <PlaceForm
          submitLabel="Add place"
          submitting={create.isPending}
          fieldErrors={fieldErrors}
          generalError={general}
          onSubmit={(input) => create.mutate(input, { onSuccess: (p) => navigate(`/app/places/${p.id}`, { replace: true }) })}
          onCancel={() => navigate("/app/places")}
        />
      </Panel>
    </div>
  );
}
