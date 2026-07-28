"use client";

/**
 * DashboardAuthGuard
 *
 * Client component that checks for a valid, non-expired JWT in sessionStorage
 * and redirects unauthenticated visitors to /login?next=<current-path>.
 *
 * Rendered as a wrapper inside DashboardLayout (which is a Server Component).
 * Shows a full-screen spinner for the one render cycle before the check
 * resolves, preventing a flash of the protected content.
 */

import { useEffect, useState, startTransition } from "react";
import { useRouter, usePathname } from "next/navigation";

// ─── JWT helper ───────────────────────────────────────────────────────────────

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  exp: number;
}

function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as JwtPayload;
  } catch {
    return null;
  }
}

function hasValidToken(): boolean {
  if (typeof window === "undefined") return false;
  const token = sessionStorage.getItem("access_token");
  if (!token) return false;
  const payload = decodeJwt(token);
  if (!payload) return false;
  return payload.exp > Math.floor(Date.now() / 1000);
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function FullPageSpinner() {
  return (
    <div
      className="flex items-center justify-center min-h-dvh bg-navy"
      aria-label="Checking authentication…"
      aria-busy="true"
    >
      <svg
        className="h-7 w-7 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden
        style={{ color: "var(--color-accent)" }}
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

// ─── Guard ────────────────────────────────────────────────────────────────────

export default function DashboardAuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  // "checking" | "authenticated" | "redirecting"
  const [authState, setAuthState] = useState<
    "checking" | "authenticated" | "redirecting"
  >("checking");

  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hasValidToken()) {
      startTransition(() => setAuthState("authenticated"));
    } else {
      startTransition(() => setAuthState("redirecting"));
      // Encode the current path so the login form can redirect back after sign-in
      const next = encodeURIComponent(pathname ?? "/dashboard/jobs");
      router.replace(`/login?next=${next}`);
    }
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (authState === "checking" || authState === "redirecting") {
    return <FullPageSpinner />;
  }

  return <>{children}</>;
}
