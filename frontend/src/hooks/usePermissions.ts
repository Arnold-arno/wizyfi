// src/hooks/usePermissions.ts
//
// REPLACES the Round-10 placeholder (which read window.__WIZYFI_PERMISSIONS__
// and therefore failed closed for everyone). Same signature —
// hasPermission(code): boolean — so AccessPlansPage / VouchersPage are
// unchanged. Reads the effective codes the backend now returns on each
// membership (MembershipSerializer.permissions).
//
// UX convenience only: it hides/shows controls. Every request is still
// authorised server-side by HasPermissionCode (doc07).

import { useCallback } from "react";
import { useActiveMembership } from "../state/sessionStore";

export function usePermissions() {
  const membership = useActiveMembership();

  const hasPermission = useCallback(
    (code: string): boolean => {
      if (!membership) return false;
      if (membership.revokedPermissions.includes(code)) return false; // revocation wins
      return membership.permissions.includes("*") || membership.permissions.includes(code);
    },
    [membership]
  );

  return { hasPermission, membership, permissions: membership?.permissions ?? [] };
}
