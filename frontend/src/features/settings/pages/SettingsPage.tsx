// Route: /app/settings — account, organization (read-only: the API has no update
// endpoints yet), appearance, and sign-out.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Panel } from "../../../components/ui/Panel";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { btnSecondary } from "../../../components/ui/styles";
import { usePermissions } from "../../../hooks/usePermissions";
import { authApi } from "../../../lib/api/authApi";
import { formatDateTime } from "../../../lib/format";
import { queryClient } from "../../../lib/queryClient";
import { getPreference, setPreference, type ThemePreference } from "../../../lib/theme";
import { useSessionStore } from "../../../state/sessionStore";

const ROLE: Record<string, string> = { OWNER: "Owner", ADMIN: "Admin", AGENT: "Agent", READ_ONLY: "Read-only operator" };
const THEMES: Array<{ value: ThemePreference; label: string; hint: string }> = [
  { value: "system", label: "System", hint: "Match this device" },
  { value: "light", label: "Light", hint: "Bright surfaces" },
  { value: "dark", label: "Dark", hint: "Low-light friendly" },
];

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--foreground-secondary)]">{k}</dt>
      <dd className="break-words text-[var(--foreground)]">{children}</dd>
    </>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user);
  const { membership, permissions } = usePermissions();
  const [theme, setTheme] = useState<ThemePreference>(getPreference);

  const choose = (t: ThemePreference) => {
    setPreference(t);
    setTheme(t);
  };

  const signOut = async () => {
    const refresh = useSessionStore.getState().refreshToken;
    try {
      if (refresh) await authApi.logout(refresh);
    } catch {
      /* sign out locally regardless */
    }
    useSessionStore.getState().clear();
    queryClient.clear();
    navigate("/sign-in", { replace: true });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Your account, your organization and how Wizyfi Bridge looks for you." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Your account">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <Row k="Name">{user?.fullName ?? "—"}</Row>
            <Row k="Email">{user?.email ?? "—"}</Row>
            <Row k="Member since">{user ? formatDateTime(user.createdAt) : "—"}</Row>
          </dl>
          <p className="mt-4 text-xs text-[var(--foreground-muted)]">Changing your name, email or password isn't available yet.</p>
        </Panel>

        <Panel title="Organization">
          {membership ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <Row k="Name">{membership.organization.name}</Row>
              <Row k="Status">
                <StatusBadge label={membership.organization.status === "ACTIVE" ? "Active" : "Suspended"} tone={membership.organization.status === "ACTIVE" ? "success" : "danger"} />
              </Row>
              <Row k="Your role">{ROLE[membership.role] ?? membership.role}</Row>
              <Row k="Access">{permissions.includes("*") ? "Full access (owner)" : `${permissions.length} permissions from your role`}</Row>
            </dl>
          ) : (
            <p className="text-sm text-[var(--foreground-secondary)]">No organization selected.</p>
          )}
          <p className="mt-4 text-xs text-[var(--foreground-muted)]">Renaming the organization and inviting teammates aren't available yet.</p>
        </Panel>

        <Panel title="Appearance" description="Saved on this device.">
          <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.value} type="button" role="radio" aria-checked={theme === t.value} onClick={() => choose(t.value)}
                className={`rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] ${
                  theme === t.value ? "border-[var(--primary)] bg-[var(--info-soft)] text-[var(--info-text)]" : "border-[var(--border)] hover:bg-[var(--surface-elevated)]"
                }`}
              >
                <span className="block font-semibold">{t.label}</span>
                <span className="block text-xs text-[var(--foreground-muted)]">{t.hint}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Session" description="Signing out also revokes your refresh token on the server.">
          <button type="button" className={btnSecondary} onClick={signOut}>Sign out</button>
        </Panel>
      </div>
    </div>
  );
}
