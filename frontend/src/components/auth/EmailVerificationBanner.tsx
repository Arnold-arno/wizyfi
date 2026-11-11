// Shown at the top of the signed-in app until the email is verified. The backend
// blocks adding connectors and routers for unverified accounts (assert_email_verified),
// so people need a visible way to fix that and resend the link.
import { MailWarning } from "lucide-react";
import { useState } from "react";
import { ApiError } from "../../lib/api/client";
import { authApi } from "../../lib/api/authApi";
import { useSessionStore } from "../../state/sessionStore";

export function EmailVerificationBanner() {
  const user = useSessionStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!user || user.emailVerified) return null;

  const resend = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await authApi.resendVerification();
      if (res.sent) {
        setNote(`Verification email sent to ${user.email}.`);
      } else {
        const store = useSessionStore.getState();
        store.setProfile(await authApi.me(), store.memberships); // already verified elsewhere
      }
    } catch (err) {
      setNote(err instanceof ApiError && err.status === 429 ? "Too many requests. Try again later." : "Could not send the email. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--info)] bg-[var(--info-soft)] px-4 py-2.5 text-sm text-[var(--info-text)]">
      <MailWarning className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        Verify your email to add routers and connect networks. We sent a link to <span className="font-medium">{user.email}</span>.
        {note && <span className="ml-2 font-medium">{note}</span>}
      </span>
      <button
        type="button"
        onClick={resend}
        disabled={busy}
        className="rounded-md px-2 py-1 font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] disabled:opacity-60"
      >
        {busy ? "Sending…" : "Resend email"}
      </button>
    </div>
  );
}
