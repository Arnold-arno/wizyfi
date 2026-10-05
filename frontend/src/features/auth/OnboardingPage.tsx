// A signed-in user with no organization (and not platform staff) lands here.
// POST /organizations/create/ makes them OWNER of a new organization.

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Field } from "../../components/ui/Field";
import { btnPrimary, inputClass } from "../../components/ui/styles";
import { authApi } from "../../lib/api/authApi";
import { useSessionStore } from "../../state/sessionStore";

export function OnboardingPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await authApi.createOrganization(name.trim());
      const [user, memberships] = await Promise.all([authApi.me(), authApi.memberships()]);
      useSessionStore.getState().setProfile(user, memberships);
      navigate("/app/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the organization.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="text-xl font-bold text-[var(--foreground)]">Create your organization</h1>
        <p className="mt-1 text-sm text-[var(--foreground-secondary)]">
          Your places, routers, plans and sales live inside an organization. You'll be its owner.
        </p>
        <div className="mt-5 flex flex-col gap-4">
          <Field label="Organization name">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={255} className={inputClass} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          <button type="submit" className={btnPrimary} disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create organization"}
          </button>
        </div>
      </form>
    </div>
  );
}
