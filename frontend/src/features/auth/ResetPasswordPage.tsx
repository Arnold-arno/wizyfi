// Route: /reset-password?uid=...&token=... (the link in the reset email).
// The uid/token are read once into state and then removed from the address bar, so they
// don't linger in history. The server link is single-use and expiring; on success the
// server has revoked every refresh token, so any local session is cleared too.
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { PasswordChecklist } from "../../components/ui/PasswordChecklist";
import { PasswordField } from "../../components/ui/PasswordField";
import { btnPrimary } from "../../components/ui/styles";
import { ApiError } from "../../lib/api/client";
import { authApi } from "../../lib/api/authApi";
import { evaluatePassword, passwordAcceptable } from "../../lib/passwordPolicy";
import { queryClient } from "../../lib/queryClient";
import { useSessionStore } from "../../state/sessionStore";
import { AuthShell } from "./AuthShell";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [link] = useState(() => ({ uid: params.get("uid") ?? "", token: params.get("token") ?? "" }));
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkBad, setLinkBad] = useState(false);

  // Keep the one-time credentials out of the address bar and browser history.
  useEffect(() => {
    if (params.has("token") || params.has("uid")) navigate("/reset-password", { replace: true });
  }, [params, navigate]);

  const hasLink = link.uid !== "" && link.token !== "";
  const valid = passwordAcceptable(evaluatePassword(password));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !valid || !hasLink) return;
    setPending(true);
    setError(null);
    try {
      await authApi.confirmPasswordReset(link.uid, link.token, password);
      useSessionStore.getState().clear(); // every refresh token was revoked server-side
      queryClient.clear();
      setPassword("");
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.token) setLinkBad(true);
      else if (err instanceof ApiError && err.fieldErrors?.password) setError(err.fieldErrors.password[0]);
      else if (err instanceof ApiError && err.status === 429) setError("Too many attempts. Wait a while, then try again.");
      else setError(err instanceof Error ? err.message : "Could not reset the password.");
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password updated">
        <div role="status" className="flex items-start gap-2 rounded-md border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success-text)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Your password was changed and you were signed out everywhere. Sign in with the new one.</span>
        </div>
        <Link to="/sign-in" className={`${btnPrimary} mt-5 w-full`}>Sign in</Link>
      </AuthShell>
    );
  }

  if (!hasLink || linkBad) {
    return (
      <AuthShell title="This link doesn't work">
        <div role="alert" className="flex items-start gap-2 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-text)]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>This reset link is invalid, has expired or was already used. Request a new one.</span>
        </div>
        <Link to="/forgot-password" className={`${btnPrimary} mt-5 w-full`}>Request a new link</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="You'll be signed out on every device.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate aria-busy={pending}>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2.5 text-sm text-[var(--danger-text)]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <PasswordField label="New password" autoComplete="new-password" value={password} onChange={setPassword} />
        <PasswordChecklist password={password} />
        <button type="submit" className={`${btnPrimary} w-full`} disabled={pending || !valid}>
          {pending ? "Saving…" : "Set new password"}
        </button>
      </form>
    </AuthShell>
  );
}
