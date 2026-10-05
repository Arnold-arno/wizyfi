// Minimal sign-in. Expectations_and_workflow lists a Login page in your live
// repo — keep yours if it exists; this exists so the tree runs on its own.

import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Field } from "../../components/ui/Field";
import { btnPrimary, inputClass } from "../../components/ui/styles";
import { ApiError } from "../../lib/api/client";
import { authApi } from "../../lib/api/authApi";
import { queryClient } from "../../lib/queryClient";
import { useSessionStore } from "../../state/sessionStore";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const hasToken = useSessionStore((s) => s.accessToken !== null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hasToken) return <Navigate to="/" replace />;

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
      navigate(from && from.startsWith("/") ? from : "/", { replace: true });
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
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <h1 className="text-xl font-bold text-[var(--foreground)]">Sign in to Wizyfi Bridge</h1>
        <div className="mt-5 flex flex-col gap-4">
          <Field label="Email">
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Password">
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          <button type="submit" className={btnPrimary} disabled={pending || !email || !password}>
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
