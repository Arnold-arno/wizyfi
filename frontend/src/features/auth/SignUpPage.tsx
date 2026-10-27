// Sign-up (route /sign-up). Live password checklist mirrors the backend policy
// (lib/passwordPolicy.ts <-> apps/accounts/validators.py). The checklist uses
// text + icon, never colour alone, and is announced politely to screen readers.
// After registering, the user is signed in and sent to /start -> onboarding.
//
// Known gap (spec §12, "error privacy"): the backend answers "email already
// exists" on registration, which reveals that an account exists. Fixing it needs
// the email-verification flow, which doesn't exist yet.

import { Check, Circle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Field } from "../../components/ui/Field";
import { btnPrimary, inputClass } from "../../components/ui/styles";
import { ApiError, apiClient } from "../../lib/api/client";
import { authApi } from "../../lib/api/authApi";
import { evaluatePassword, MIN_PASSWORD_LENGTH, passwordAcceptable } from "../../lib/passwordPolicy";
import { queryClient } from "../../lib/queryClient";
import { useSessionStore } from "../../state/sessionStore";
import { AuthShell } from "./AuthShell";

function Rule({ ok, label, info }: { ok: boolean; label: string; info?: boolean }) {
  return (
    <li className="flex items-center gap-2 text-xs text-[var(--foreground-secondary)]">
      {ok ? <Check className="h-3.5 w-3.5 text-[var(--success)]" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 text-[var(--foreground-muted)]" aria-hidden="true" />}
      <span>
        {label}
        <span className="sr-only">{ok ? " — met" : info ? " — recommended" : " — not met yet"}</span>
      </span>
    </li>
  );
}

export function SignUpPage() {
  const navigate = useNavigate();
  const hasToken = useSessionStore((s) => s.accessToken !== null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  if (hasToken) return <Navigate to="/start" replace />;

  const checks = evaluatePassword(password);
  const valid = fullName.trim() !== "" && email.trim() !== "" && passwordAcceptable(checks);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !valid) return;
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      await apiClient.post("/auth/register/", { email: email.trim(), fullName: fullName.trim(), password });
      const { access, refresh } = await authApi.login(email.trim(), password);
      queryClient.clear();
      useSessionStore.getState().setTokens(access, refresh);
      navigate("/start", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setFieldErrors(err.fieldErrors);
      else setError(err instanceof Error ? err.message : "Could not create the account.");
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Set up a workspace for your Places and networks."
      footer={
        <p>
          Already have an account?{" "}
          <Link to="/sign-in" className="font-medium text-[var(--primary)] hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Full name" error={fieldErrors.fullName?.[0]}>
          <input autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Email" error={fieldErrors.email?.[0]}>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password" error={fieldErrors.password?.[0]}>
          <input type={show ? "text" : "password"} autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-[var(--foreground-secondary)]">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show password
        </label>
        <ul aria-live="polite" aria-label="Password requirements" className="flex flex-col gap-1">
          <Rule ok={checks.length} label={`At least ${MIN_PASSWORD_LENGTH} characters`} />
          <Rule ok={checks.letter} label="Includes a letter" />
          <Rule ok={checks.number} label="Includes a number" />
          <Rule ok={checks.special} label="Includes a special character" />
          <Rule ok={checks.uppercase} label="Uppercase letter recommended" info />
        </ul>
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <button type="submit" className={btnPrimary} disabled={pending || !valid}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
