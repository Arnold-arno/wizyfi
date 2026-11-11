// Edit account (Client/Administration spec §10): name, phone, country. Email is shown
// read-only with its verification state; changing it isn't offered because the backend
// profile endpoint deliberately doesn't accept it.
import { useState, type FormEvent } from "react";
import { Field } from "../../../components/ui/Field";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { btnPrimary, inputClass } from "../../../components/ui/styles";
import { ApiError } from "../../../lib/api/client";
import { authApi } from "../../../lib/api/authApi";
import { useSessionStore } from "../../../state/sessionStore";

export function ProfileForm() {
  const user = useSessionStore((s) => s.user);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [country, setCountry] = useState(user?.country ?? "");
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fe, setFe] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const dirty = fullName.trim() !== user.fullName || phone.trim() !== user.phone || country.trim().toUpperCase() !== user.country;
  const valid = fullName.trim() !== "" && (country.trim() === "" || /^[A-Za-z]{2}$/.test(country.trim()));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending || !dirty || !valid) return;
    setPending(true);
    setSaved(false);
    setError(null);
    setFe({});
    try {
      const updated = await authApi.updateProfile({
        fullName: fullName.trim(),
        phone: phone.trim(),
        country: country.trim().toUpperCase(),
      });
      const store = useSessionStore.getState();
      store.setProfile(updated, store.memberships);
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) setFe(err.fieldErrors);
      else setError(err instanceof Error ? err.message : "Could not save your details.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate aria-busy={pending}>
      <Field label="Full name" error={fe.fullName?.[0]}>
        <input value={fullName} maxLength={255} autoComplete="name" onChange={(e) => { setSaved(false); setFullName(e.target.value); }} className={inputClass} />
      </Field>

      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-[var(--foreground)]">Email</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all text-[var(--foreground)]">{user.email}</span>
          <StatusBadge label={user.emailVerified ? "Verified" : "Not verified"} tone={user.emailVerified ? "success" : "warning"} />
        </div>
        <span className="text-xs text-[var(--foreground-muted)]">Changing your email isn't available yet.</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <Field label="Phone (optional)" hint="Include the country code, e.g. +256…" error={fe.phone?.[0]}>
            <input value={phone} maxLength={32} inputMode="tel" autoComplete="tel" onChange={(e) => { setSaved(false); setPhone(e.target.value); }} className={inputClass} />
          </Field>
        </div>
        <Field label="Country (optional)" hint="Two letters, e.g. UG" error={fe.country?.[0]}>
          <input value={country} maxLength={2} onChange={(e) => { setSaved(false); setCountry(e.target.value.toUpperCase()); }} className={`${inputClass} uppercase`} />
        </Field>
      </div>

      {error && <p role="alert" className="text-sm text-[var(--danger-text)]">{error}</p>}
      {saved && <p role="status" className="text-sm text-[var(--success-text)]">Saved.</p>}
      <div>
        <button type="submit" className={btnPrimary} disabled={pending || !dirty || !valid}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
