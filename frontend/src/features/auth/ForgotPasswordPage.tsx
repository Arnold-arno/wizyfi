// Route: /forgot-password. The server answers with the same neutral message whether
// or not the address has an account (no account enumeration), and so does this page.
import { AlertCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Field } from "../../components/ui/Field";
import { btnPrimary, inputClass } from "../../components/ui/styles";
import { ApiError } from "../../lib/api/client";
import { authApi } from "../../lib/api/authApi";
import { AuthShell } from "./AuthShell";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !email.trim()) return;
    setPending(true);
    setError(null);
    try {
      const res = await authApi.requestPasswordReset(email.trim());
      setSent(res.detail);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many requests. Wait a while, then try again."
          : err instanceof ApiError && err.fieldErrors?.email
            ? err.fieldErrors.email[0]
            : err instanceof Error
              ? err.message
              : "Could not send the reset link."
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a link."
      footer={
        <p>
          Remembered it?{" "}
          <Link to="/sign-in" className="font-medium text-[var(--primary)] underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {sent ? (
        <div role="status" className="rounded-md border border-[var(--success)] bg-[var(--success-soft)] px-4 py-3 text-sm text-[var(--success-text)]">
          <p className="font-medium">{sent}</p>
          <p className="mt-1">The link works once and expires soon. Check your spam folder if it doesn't arrive.</p>
        </div>
      ) : (
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
          <button type="submit" className={`${btnPrimary} w-full`} disabled={pending || !email.trim()}>
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
