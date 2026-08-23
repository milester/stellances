/**
 * API client for the /users endpoints.
 *
 * Thin wrappers around fetch. All functions read the access_token from
 * sessionStorage so they can be called from client components without
 * prop-drilling the token.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = "CLIENT" | "FREELANCER" | "ADMIN";

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  stellarPublicKey: string | null;
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfilePayload {
  name?: string;
  stellarPublicKey?: string | null;
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class UsersApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "UsersApiError";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAuthHeaders(): HeadersInit {
  const token =
    typeof window !== "undefined"
      ? sessionStorage.getItem("access_token")
      : null;

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText || "An unexpected error occurred.";
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) {
        message = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
      }
    } catch {
      // non-JSON error body
    }
    throw new UsersApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

// ─── Users API ────────────────────────────────────────────────────────────────

/**
 * GET /users/me
 *
 * Returns the authenticated user's profile (password excluded).
 * Requires a valid JWT in sessionStorage.
 */
export async function fetchMe(): Promise<UserProfile> {
  const res = await fetch(`${BASE_URL}/users/me`, {
    method: "GET",
    credentials: "include",
    headers: getAuthHeaders(),
  });
  return handleResponse<UserProfile>(res);
}

/**
 * PATCH /users/me
 *
 * Update the authenticated user's name and/or Stellar public key.
 * Returns the updated profile.
 */
export async function updateProfile(
  payload: UpdateProfilePayload,
): Promise<UserProfile> {
  const res = await fetch(`${BASE_URL}/users/me`, {
    method: "PATCH",
    credentials: "include",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  return handleResponse<UserProfile>(res);
}
