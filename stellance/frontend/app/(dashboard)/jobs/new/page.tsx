"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { JobPostForm } from "./JobPostForm";

// ─── JWT helpers ──────────────────────────────────────────────────────────────

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tv: number;
  typ: string;
  exp: number;
}

/**
 * Decode the payload of a JWT without verifying the signature.
 * Safe to use client-side for display / guard logic only — do not trust this
 * for anything security-critical (the server validates the signature).
 */
function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    // Base64url → Base64 → JSON
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(base64);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

type AccessResult = "ok" | "unauthenticated" | "wrong-role";

/**
 * Read the JWT from sessionStorage and return the access decision.
 * Returns "unauthenticated" during SSR (window is undefined).
 */
function checkAccess(): AccessResult {
  if (typeof window === "undefined") return "unauthenticated";

  const token = sessionStorage.getItem("access_token");
  if (!token) return "unauthenticated";

  const payload = decodeJwt(token);
  if (!payload) return "unauthenticated";

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return "unauthenticated";

  return payload.role === "CLIENT" ? "ok" : "wrong-role";
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div
      className="flex items-center justify-center min-h-[60vh]"
      aria-label="Checking access…"
      aria-busy="true"
    >
      <svg
        className="h-6 w-6 animate-spin text-accent"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewJobPage() {
  const router = useRouter();

  // Evaluate access synchronously — sessionStorage is available on the client
  // immediately after hydration, so no async effect is needed.
  const access = checkAccess();

  // The effect only handles the navigation side-effect; no setState.
  useEffect(() => {
    if (access === "unauthenticated") {
      router.replace("/login");
    } else if (access === "wrong-role") {
      router.replace("/jobs");
    }
  }, [access, router]);

  // Show spinner while the redirect is in flight
  if (access !== "ok") {
    return <Spinner />;
  }

  // ── Authenticated CLIENT ────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-2xl sm:text-3xl font-semibold text-white mb-1"
          style={{ fontFamily: "var(--font-space-grotesk)" }}
        >
          Post a Job
        </h1>
        <p className="text-sm text-text-muted">
          Describe your project and set a budget. Freelancers on Stellance will
          apply and you can fund escrow directly on-chain.
        </p>
      </div>

      {/* Form */}
      <JobPostForm />
    </div>
  );
}
