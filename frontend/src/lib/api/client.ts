// src/lib/api/client.ts
//
// ⚠️ RECONCILIATION NOTE
// Per Expectations_and_workflow, a typed API client already exists at this
// path with auth handling and request-ID propagation wired in. This file is
// a minimal reference implementation so the Access Plans / Vouchers modules
// are runnable and reviewable in isolation. Do NOT drop this over an
// existing client — merge the `accessPlansApi.ts` / `vouchersApi.ts` calls
// onto whatever `apiClient` already exports (axios instance, fetch wrapper,
// etc.) instead. The only hard requirements those two files rely on are:
//   - apiClient.get<T>(path, { params }) => Promise<T>
//   - apiClient.post<T>(path, body, { headers }) => Promise<T>
//   - apiClient.patch<T>(path, body) => Promise<T>
//   - Authorization header attached automatically from the auth store
//   - Base URL from import.meta.env.VITE_API_BASE_URL (doc10 env table)

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export class ApiError extends Error {
  code: string;
  status: number;
  fieldErrors?: Record<string, string[]>;

  constructor(
    message: string,
    code: string,
    status: number,
    fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

function getAccessToken(): string | null {
  // Reconcile with the real Zustand auth store (see Expectations_and_workflow:
  // "Zustand stores for auth and UI state"). Kept generic here.
  try {
    return localStorage.getItem("wizyfi_access_token");
  } catch {
    return null;
  }
}

interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

function buildQuery(params?: RequestOptions["params"]): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  const search = new URLSearchParams();
  entries.forEach(([k, v]) => search.set(k, String(v)));
  return `?${search.toString()}`;
}

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  options?: RequestOptions
): Promise<T> {
  const token = getAccessToken();
  const requestId = crypto.randomUUID();

  const res = await fetch(`${BASE_URL}${path}${buildQuery(options?.params)}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    // Error contract per doc09: stable code + human message + field errors
    throw new ApiError(
      payload?.message ?? "Request failed",
      payload?.code ?? "INTERNAL_ERROR",
      res.status,
      payload?.fieldErrors
    );
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>("GET", path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, body, options),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, undefined, options),
};
