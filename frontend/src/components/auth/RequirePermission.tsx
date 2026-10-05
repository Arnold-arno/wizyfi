import type { ReactNode } from "react";
import { usePermissions } from "../../hooks/usePermissions";
import { EmptyState } from "../ui/EmptyState";

/** Permission state per doc02 §7: explain the missing capability without
 *  revealing anything about the hidden page. */
export function RequirePermission({ code, children }: { code: string; children: ReactNode }) {
  const { hasPermission } = usePermissions();
  if (!hasPermission(code)) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="Ask an owner or admin of this organization to grant you access."
      />
    );
  }
  return <>{children}</>;
}
