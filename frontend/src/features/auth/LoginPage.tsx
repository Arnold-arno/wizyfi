// Sign-in (routes /login and /sign-in). Post-login goes to /start, which decides
// dashboard / admin / onboarding. No "forgot password" or provider buttons yet:
// the backend has no reset endpoint or OAuth, and inactive options must not be shown.

import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Field } from "../../components/ui/Field";
import { PasswordField } from "../../components/ui/PasswordField";
import { btnPrimary, inputClass } from "../../components/ui/styles";
import { ApiError } from "../../lib/api/client";
import { authApi } from "../../lib/api/authApi";
import { queryClient } from "../../lib/queryClient";
import { useSessionStore } from "../../state/sessionStore";
import { AuthShell } from "./AuthShell";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasToken = useSessionStore((s) => s.accessToken !== null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hasToken) return <Navigate to="/start" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { access, refresh } = await authApi.login(email.trim(), password);
      queryClient.clear();
      useSessionStore.getState().setTokens(access, refresh);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith("/") ? from : "/start", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "Email or password is incorrect."
          : err instanceof Error
            ? err.message
            : "Could not sign in."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your Places and networks."
      footer={
        <p>
          New to Wizyfi Bridge?{" "}
          <Link to="/sign-up" className="font-medium text-[var(--primary)] underline-offset-2 hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate aria-busy={pending}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2.5 text-sm text-[var(--danger-text)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <Field label="Email">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <PasswordField label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
        <button type="submit" className={`${btnPrimary} w-full`} disabled={pending || !email || !password}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
