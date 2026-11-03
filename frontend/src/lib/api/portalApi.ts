// Captive-portal endpoints (public, unauthenticated):
//   GET  /portal/places/{id}/welcome/
//   GET  /portal/places/{id}/plans/?router=<id>
//   POST /portal/places/{id}/redeem/
//
// Deliberately NOT built on apiClient: that client attaches a staff Bearer token
// and tries to refresh it. A customer's phone has none, and a stale staff token
// in the same browser would turn a public AllowAny call into a 401.
import { ApiError } from "./client";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

export interface PortalWelcome {
  placeName: string;
  welcomeMessage: string;
  supportContact: string;
  termsUrl: string;
}

export interface PortalPlan {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  durationMinutes: number;
  dataCapMb: number | null;
  maxConcurrentDevices: number | null;
  validityMode: "DURATION" | "UNTIL_NEXT_RESET";
  /** Only for "until next reset" plans with a covering reset scheduled. */
  accessEndsAt: string | null;
}

export interface PortalSession {
  sessionId: string;
  status: string;
  expiresAt: string | null;
  planName: string | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/portal${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Can't reach the network. Check your connection and try again.", "NETWORK_UNAVAILABLE", 0);
  }
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
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

export const portalApi = {
  welcome: (placeId: string) => call<PortalWelcome>(`/places/${placeId}/welcome/`),

  plans: (placeId: string, routerId?: string) =>
    call<PortalPlan[]>(`/places/${placeId}/plans/${routerId ? `?router=${encodeURIComponent(routerId)}` : ""}`),

  redeem: (placeId: string, body: { code: string; macAddress: string; routerId: string }) =>
    call<PortalSession>(`/places/${placeId}/redeem/`, { method: "POST", body: JSON.stringify(body) }),
};
