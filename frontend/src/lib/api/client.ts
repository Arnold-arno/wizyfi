// src/lib/api/client.ts
//
// CHANGED from the Round-10 reference client. Three real gaps fixed:
//  1. X-Organization-Id is now sent. The backend's OrganizationScopedMixin
//     resolves the tenant from this header; without it every org-scoped
//     endpoint answers 403 (see apps/common/views.py).
//  2. Expired access tokens (15 min) are refreshed once and the request
//     retried. Refresh is single-flight because the backend rotates and
//     blacklists refresh tokens: two parallel refreshes would invalidate
//     each other.
//  3. A network failure becomes a normal ApiError instead of a raw TypeError.
//
// Public surface (get/post/patch/delete, ApiError) is unchanged, so
// accessPlansApi / vouchersApi keep working as-is.

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

    if (res.status === 401 && !path.startsWith("/auth/")) {
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
