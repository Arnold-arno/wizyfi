// Sign-in (routes /login and /sign-in). CHANGED (Round 17): split-screen shell,
// show-password control, link to sign-up, and post-login goes to /start (which
// decides dashboard / admin / onboarding) instead of "/", now the public home.
//
// Not included on purpose: "Forgot password" and provider buttons — the backend
// has no reset endpoint or OAuth yet, and the spec says never show inactive options.

import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Field } from "../../components/ui/Field";
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
  const [show, setShow] = useState(false);
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
          <Link to="/sign-up" className="font-medium text-[var(--primary)] hover:underline">
            Create an account
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Email">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password">
          <input type={show ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-[var(--foreground-secondary)]">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show password
        </label>
        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <button type="submit" className={btnPrimary} disabled={pending || !email || !password}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthShell>
  );
}
