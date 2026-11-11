// Change password. The server checks the current password, applies the same policy as
// sign-up and then revokes EVERY refresh token (all devices, this one included), so on
// success we clear the local session and send the person to sign in again.
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { PasswordChecklist } from "../../../components/ui/PasswordChecklist";
import { PasswordField } from "../../../components/ui/PasswordField";
import { btnPrimary } from "../../../components/ui/styles";
import { ApiError } from "../../../lib/api/client";
import { authApi } from "../../../lib/api/authApi";
import { evaluatePassword, passwordAcceptable } from "../../../lib/passwordPolicy";
import { queryClient } from "../../../lib/queryClient";
import { useSessionStore } from "../../../state/sessionStore";

export function ChangePasswordForm() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, setPending] = useState(false);
  const [fe, setFe] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  const valid = current !== "" && passwordAcceptable(evaluatePassword(next));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !valid) return;
    setPending(true);
    setError(null);
    setFe({});
    try {
      await authApi.changePassword(current, next);
      useSessionStore.getState().clear();
      queryClient.clear();
      navigate("/sign-in", { replace: true, state: { notice: "Password changed. Sign in with your new password." } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) setError("Too many attempts. Wait a while, then try again.");
      else if (err instanceof ApiError && err.fieldErrors) setFe(err.fieldErrors);
      else setError(err instanceof Error ? err.message : "Could not change the password.");
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate aria-busy={pending}>
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        value={current}
        onChange={setCurrent}
        error={fe.currentPassword?.[0] ?? fe.current_password?.[0]}
      />
      <PasswordField label="New password" autoComplete="new-password" value={next} onChange={setNext} error={fe.password?.[0]} />
      <PasswordChecklist password={next} />
      {error && <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p>}
      <p className="text-xs text-[var(--foreground-muted)]">Changing your password signs you out on every device.</p>
      <div>
        <button type="submit" className={btnPrimary} disabled={pending || !valid}>
          {pending ? "Changing…" : "Change password"}
        </button>
      </div>
    </form>
  );
}
