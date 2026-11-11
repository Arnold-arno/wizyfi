// Shapes returned by /auth/me/ and /organizations/ (camelCased by the backend renderer).
// CHANGED (Round 23): phone, country, emailVerified (MeSerializer, Round 20).

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  /** ISO 3166-1 alpha-2, e.g. "UG"; empty when not set. */
  country: string;
  isActive: boolean;
  isPlatformStaff: boolean;
  emailVerified: boolean;
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
