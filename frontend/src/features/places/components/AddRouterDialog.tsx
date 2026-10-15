// Add router = (existing OR new connector) + router. doc02 §5: "Add Router ->
// router verification". Two API calls; if the router call fails after a NEW
// connector was saved, the connector id is kept so a retry doesn't create a
// duplicate. Secrets are write-only: never shown again, cleared after use.
//
// ASSUMPTION (confirm): credential fields per vendor below. MikroTik matches
// the adapter (username/password); Wizyfi's "api_key" is this project's own
// stub contract.

import { useState } from "react";
import { Dialog } from "../../../components/ui/Dialog";
import { Field } from "../../../components/ui/Field";
import { btnGhost, btnPrimary, inputClass } from "../../../components/ui/styles";
import { ApiError } from "../../../lib/api/client";
import type { VendorCode } from "../../../types/network";
import { useConnectors, useCreateConnector, useCreateRouter } from "../../network/hooks/useNetwork";

const VENDORS: Array<{ code: VendorCode; label: string; fields: Array<{ key: string; label: string; secret: boolean }> }> = [
  {
    code: "MIKROTIK",
    label: "MikroTik",
    fields: [
      { key: "username", label: "Username", secret: false },
      { key: "password", label: "Password", secret: true },
    ],
  },
  { code: "WIZYFI", label: "Wizyfi", fields: [{ key: "api_key", label: "API key", secret: true }] },
];

const NEW = "__new__";

export function AddRouterDialog({ placeId, canManageConnectors, onClose }: { placeId: string; canManageConnectors: boolean; onClose: () => void }) {
  const connectors = useConnectors(placeId);
  const createConnector = useCreateConnector();
  const createRouter = useCreateRouter();

  const [choice, setChoice] = useState<string>("");
  const [vendor, setVendor] = useState<VendorCode>("MIKROTIK");
  const [connectorName, setConnectorName] = useState("");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [savedConnectorId, setSavedConnectorId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const vendorDef = VENDORS.find((v) => v.code === vendor)!;
  const isNew = choice === NEW;
  const existing = connectors.data?.results ?? [];

  const connectorReady = isNew
    ? savedConnectorId !== null || (connectorName.trim() !== "" && vendorDef.fields.every((f) => (creds[f.key] ?? "").trim() !== ""))
    : choice !== "";
  const valid = connectorReady && name.trim() !== "" && identity.trim() !== "";

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let connectorId = isNew ? savedConnectorId : choice;
      if (!connectorId) {
        const c = await createConnector.mutateAsync({
          place: placeId,
          vendorCode: vendor,
          name: connectorName.trim(),
          credentials: creds,
        });
        connectorId = c.id;
        setSavedConnectorId(c.id);
        setCreds({}); // secrets never linger in state after they're sent
      }
      await createRouter.mutateAsync({ place: placeId, connector: connectorId, name: name.trim(), identity: identity.trim() });
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.fieldErrors ? Object.values(e.fieldErrors).flat()[0] : undefined) ?? e.message
          : e instanceof Error
            ? e.message
            : "Could not add the router."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Add router"
      description="Routers are managed through a connector. After adding, run Test connection to verify it."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} disabled={!valid || busy} onClick={submit}>
            {busy ? "Adding…" : "Add router"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Connector">
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className={inputClass} disabled={savedConnectorId !== null}>
            <option value="" disabled>
              Select a connector
            </option>
            {existing.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.vendorCode === "WIZYFI" ? "Wizyfi" : "MikroTik"})
              </option>
            ))}
            {canManageConnectors && <option value={NEW}>New connector…</option>}
          </select>
        </Field>

        {isNew && savedConnectorId === null && (
          <div className="flex flex-col gap-4 rounded-md border border-[var(--border)] p-4">
            <Field label="Vendor">
              <select
                value={vendor}
                onChange={(e) => {
                  setVendor(e.target.value as VendorCode);
                  setCreds({});
                }}
                className={inputClass}
              >
                {VENDORS.map((v) => (
                  <option key={v.code} value={v.code}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Connector name">
              <input value={connectorName} onChange={(e) => setConnectorName(e.target.value)} className={inputClass} />
            </Field>
            {vendorDef.fields.map((f) => (
              <Field key={f.key} label={f.label} hint={f.secret ? "Stored encrypted. It can't be viewed again." : undefined}>
                <input
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  value={creds[f.key] ?? ""}
                  onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        )}
        {isNew && savedConnectorId !== null && (
          <p role="status" className="text-sm text-[var(--foreground-secondary)]">
            Connector saved. Fix the router details and retry — the connector won't be created twice.
          </p>
        )}

        <Field label="Router name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Front desk router" />
        </Field>
        <Field label="Address / identity" hint="The router's host or vendor-side identity the connector will talk to.">
          <input value={identity} onChange={(e) => setIdentity(e.target.value)} className={inputClass} placeholder="e.g. 10.0.0.1" />
        </Field>

        {error && (
          <p role="alert" className="text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
