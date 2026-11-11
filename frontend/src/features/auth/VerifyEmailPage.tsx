// Route: /verify-email?token=... (the link in the verification email). Works signed in
// or out: the token is the credential. Verifying twice is harmless on the server.
// When the person is signed in, the profile is refreshed so the banner disappears.
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { btnPrimary, btnSecondary } from "../../components/ui/styles";
import { ApiError } from "../../lib/api/client";
import { authApi } from "../../lib/api/authApi";
import { useSessionStore } from "../../state/sessionStore";
import { AuthShell } from "./AuthShell";

type State = "checking" | "verified" | "invalid" | "missing" | "error";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token] = useState(() => params.get("token") ?? "");
  const signedIn = useSessionStore((s) => s.accessToken !== null);
  const [state, setState] = useState<State>(token ? "checking" : "missing");
  const [resent, setResent] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (params.has("token")) navigate("/verify-email", { replace: true }); // keep the token out of history
  }, [params, navigate]);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    authApi
      .verifyEmail(token)
      .then(async () => {
        setState("verified");
        const store = useSessionStore.getState();
        if (store.accessToken) {
          try {
            store.setProfile(await authApi.me(), store.memberships);
          } catch {
            /* the next page load refreshes it */
          }
        }
      })
      .catch((err: unknown) => setState(err instanceof ApiError && err.status === 400 ? "invalid" : "error"));
  }, [token]);

  const resend = async () => {
    setResent(null);
    try {
      const res = await authApi.resendVerification();
      setResent(res.sent ? "A new verification email is on its way." : "Your email is already verified.");
    } catch (err) {
      setResent(err instanceof ApiError && err.status === 429 ? "Too many requests. Try again later." : "Could not send the email.");
    }
  };

  if (state === "checking") {
    return (
      <AuthShell title="Verifying your email">
        <p role="status" className="text-sm text-[var(--foreground-secondary)]">One moment…</p>
      </AuthShell>
    );
  }

  if (state === "verified") {
    return (
      <AuthShell title="Email verified">
        <div role="status" className="flex items-start gap-2 rounded-md border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success-text)]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Thanks. You can now add routers and connect networks.</span>
        </div>
        <Link to={signedIn ? "/start" : "/sign-in"} className={`${btnPrimary} mt-5 w-full`}>
          {signedIn ? "Continue" : "Sign in"}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={state === "missing" ? "No verification link" : "This link doesn't work"}>
      <div role="alert" className="flex items-start gap-2 rounded-md border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-text)]">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          {state === "error"
            ? "We couldn't reach the server. Try the link again in a moment."
            : "This verification link is invalid or has expired."}
        </span>
      </div>
      {signedIn ? (
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" className={`${btnPrimary} w-full`} onClick={resend}>Send a new link</button>
          {resent && <p role="status" className="text-sm text-[var(--foreground-secondary)]">{resent}</p>}
          <Link to="/start" className={`${btnSecondary} w-full`}>Back to the app</Link>
        </div>
      ) : (
        <Link to="/sign-in" className={`${btnPrimary} mt-5 w-full`}>Sign in to get a new link</Link>
      )}
    </AuthShell>
  );
}
