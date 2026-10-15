// Shared by "Add place" (page) and "Edit place" (dialog). Server errors map to
// their fields (doc05 §7); the timezone is a free IANA name with common
// suggestions, and the SERVER validates it.
import { useState } from "react";
import { Field } from "../../../components/ui/Field";
import { btnGhost, btnPrimary, inputClass } from "../../../components/ui/styles";
import type { PlaceInput } from "../../../types/network";

const COMMON_ZONES = [
  "Africa/Kampala", "Africa/Nairobi", "Africa/Dar_es_Salaam", "Africa/Kigali", "Africa/Lagos",
  "Africa/Johannesburg", "Africa/Cairo", "UTC", "Europe/London", "Europe/Paris", "Asia/Dubai",
  "Asia/Kolkata", "America/New_York", "America/Chicago", "America/Los_Angeles",
];

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

interface PlaceFormProps {
  initial?: PlaceInput;
  submitLabel: string;
  submitting?: boolean;
  fieldErrors?: Record<string, string[]>;
  generalError?: string | null;
  onSubmit: (input: PlaceInput) => void;
  onCancel: () => void;
}

export function PlaceForm({ initial, submitLabel, submitting, fieldErrors, generalError, onSubmit, onCancel }: PlaceFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [timezone, setTimezone] = useState(initial?.timezone ?? browserTimeZone());
  const [address, setAddress] = useState(initial?.address ?? "");
  const err = (f: string) => fieldErrors?.[f]?.[0];
  const valid = name.trim() !== "" && timezone.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      <Field label="Place name" error={err("name")}>
        <input value={name} maxLength={255} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Ntinda Branch" />
      </Field>
      <Field label="Time zone" hint="Scheduled actions for this place (like Wizyfi hard logout) use this zone." error={err("timezone")}>
        <input list="place-time-zones" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputClass} />
        <datalist id="place-time-zones">
          {COMMON_ZONES.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </Field>
      <Field label="Address (optional)" error={err("address")}>
        <input value={address} maxLength={500} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
      </Field>
      {generalError && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {generalError}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button type="button" className={btnGhost} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={!valid || submitting}
          onClick={() => onSubmit({ name: name.trim(), timezone: timezone.trim(), address: address.trim() })}
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
