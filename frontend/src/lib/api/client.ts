// src/lib/api/client.ts
//
// CHANGED (Round 23) — one real bug fixed:
//  The 401 -> refresh -> retry path was skipped for EVERY path under /auth/. That
//  includes /auth/me/, which the app calls on each page load. Access tokens live
//  15 minutes, so after that a reload got a 401 from /auth/me/, no refresh was tried,
//  and the session was cleared: people were signed out on every reload after 15 min.
//  Now only the genuinely unauthenticated endpoints (login, refresh, register, reset,
//  verify, logout) skip the refresh; signed-in calls under /auth/ (me, change-password,
//  resend-verification) refresh like everything else.
//
// Earlier rounds (unchanged): X-Organization-Id is sent for tenant-scoped paths; refresh is
// single-flight (refresh tokens rotate and are blacklisted, so parallel refreshes would
// invalidate each other); a network failure becomes a normal ApiError.

import {
  clearSession,
  getAccessToken,
  getActiveOrganizationId,
  getRefreshToken,
  setTokens,
} from "./session";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export class ApiError extends Error {
  code: string;
  status: number;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;

  constructor(
    message: string,
    code: string,
    status: number,
    fieldErrors?: Record<string, string[]>,
    requestId?: string
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.requestId = requestId;
  }
}

interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

// Endpoints that are not tenant-scoped on the server.
const NO_ORG_PREFIXES = ["/auth/", "/platform-admin/", "/organizations/"];

// A 401 from these is a real answer (wrong password, bad token), never an expired
// session, so it must not trigger a token refresh.
const NO_REFRESH_PREFIXES = [
  "/auth/login/",
  "/auth/refresh/",
  "/auth/register/",
  "/auth/password-reset/", // also covers /confirm/
  "/auth/verify-email/",
  "/auth/logout/",
];

function buildQuery(params?: RequestOptions["params"]): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (entries.length === 0) return "";
  const search = new URLSearchParams();
  entries.forEach(([k, v]) => search.set(k, String(v)));
  return `?${search.toString()}`;
}

async function send(
  method: Method,
  path: string,
  body: unknown,
  options: RequestOptions | undefined,
  token: string | null
): Promise<Response> {
  const orgId = getActiveOrganizationId();
  const scoped = orgId && !NO_ORG_PREFIXES.some((p) => path.startsWith(p));

  return fetch(`${BASE_URL}${path}${buildQuery(options?.params)}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": crypto.randomUUID(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(scoped ? { "X-Organization-Id": orgId } : {}),
      ...options?.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access: string; refresh?: string };
    setTokens(data.access, data.refresh ?? refresh);
    return data.access;
  } catch {
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, body, options, getAccessToken());

    if (res.status === 401 && !NO_REFRESH_PREFIXES.some((p) => path.startsWith(p))) {
      const fresh = await refreshAccessToken();
      if (fresh) {
        res = await send(method, path, body, options, fresh);
      } else {
        clearSession(); // RequireAuth sends the user to /login
      }
    }
  } catch {
    throw new ApiError(
      "Can't reach the server. Check your connection and try again.",
      "NETWORK_UNAVAILABLE",
      0
    );
  }

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    // Error contract per doc09: stable code + message + field errors.
    throw new ApiError(
      payload?.message ?? "Request failed",
      payload?.code ?? "INTERNAL_ERROR",
      res.status,
      payload?.fieldErrors ?? undefined,
      payload?.requestId
    );
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, undefined, options),
};
