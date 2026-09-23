// src/hooks/usePermissions.ts
//
// ⚠️ RECONCILIATION NOTE
// Expectations_and_workflow confirms the org/membership model already
// carries "role-based membership and granular permission codes" on the
// backend, and the frontend already has a Zustand auth store. This is a
// minimal reference hook so AccessPlansPage / VouchersPage type-check and
// run standalone. Replace the body with a read from the real auth store
// (e.g. `useAuthStore((s) => s.permissions)`), keeping the same
// `hasPermission(code: string): boolean` signature so nothing above needs
// to change. Reminder: this is a UX convenience only — every mutation must
// still be authorized server-side (doc07 §Authentication & Authorization).

import { useMemo } from "react";

export function usePermissions() {
  // Placeholder: reads a flat permission-code array off whatever the
  // existing auth store exposes at window.__WIZYFI_PERMISSIONS__ in dev,
  // or defaults to an empty set (fail-closed) otherwise.
  const permissions = useMemo<string[]>(() => {
    return (globalThis as { __WIZYFI_PERMISSIONS__?: string[] }).__WIZYFI_PERMISSIONS__ ?? [];
  }, []);

  const hasPermission = (code: string) => permissions.includes(code);

  return { permissions, hasPermission };
}
