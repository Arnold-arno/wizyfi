// GET /audit-events/ — append-only, read-only (requires audit:view).
import { apiClient } from "./client";
import type { Paginated } from "../../types/common";

export type ActorType = "STAFF" | "SYSTEM" | "CUSTOMER";

export interface AuditEvent {
  id: string;
  actorType: ActorType;
  actor: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const auditApi = {
  list: (p: { page?: number; search?: string; actorType?: ActorType } = {}) =>
    apiClient.get<Paginated<AuditEvent>>("/audit-events/", {
      params: { page: p.page, search: p.search, actor_type: p.actorType },
    }),
};
