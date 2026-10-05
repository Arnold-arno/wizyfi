// Shapes returned by /auth/me/ and /organizations/ (camelCased by the backend renderer).

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  isPlatformStaff: boolean;
  createdAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
}

export type OrgRole = "OWNER" | "ADMIN" | "AGENT" | "READ_ONLY";

export interface Membership {
  id: string;
  organization: OrganizationSummary;
  role: OrgRole;
  status: string;
  /** Effective codes; ["*"] means the OWNER wildcard. UX hint only. */
  permissions: string[];
  /** Revocation beats every grant, including the wildcard. */
  revokedPermissions: string[];
  createdAt: string;
}
