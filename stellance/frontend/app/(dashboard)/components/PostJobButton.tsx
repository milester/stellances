"use client";

import { useState, useEffect, startTransition } from "react";
import Link from "next/link";

// ─── JWT role helper ──────────────────────────────────────────────────────────

function getRoleFromSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const token = sessionStorage.getItem("access_token");
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64)) as {
      role?: string;
      exp?: number;
    };

    // Treat expired tokens as if logged out
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload.role ?? null;
  } catch {
    return null;
  }
}

// ─── Shared button markup ─────────────────────────────────────────────────────

function PostJobLink({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <Link
        href="/jobs/new"
        aria-label="Post a job"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-white transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent"
        style={{ background: "var(--color-accent)" }}
      >
        <PlusIcon size={14} />
        <span className="hidden sm:inline">Post Job</span>
      </Link>
    );
  }

  return (
    <Link
      href="/jobs/new"
      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md text-sm font-medium text-white transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-slate-panel"
      style={{ background: "var(--color-accent)" }}
    >
      <PlusIcon size={16} />
      Post a Job
    </Link>
  );
}

function PlusIcon({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

// ─── Post Job Button ──────────────────────────────────────────────────────────

/**
 * Renders a "Post Job" CTA only when the current user's JWT identifies them
 * as a CLIENT.
 *
 * Uses useState + useEffect to defer the sessionStorage read until after
 * hydration, avoiding a server/client mismatch and the resulting button flash.
 */
export function PostJobButton() {
  const [isClientRole, setIsClientRole] = useState(false);

  useEffect(() => {
    startTransition(() => setIsClientRole(getRoleFromSession() === "CLIENT"));
  }, []);

  if (!isClientRole) return null;

  return <PostJobLink />;
}

/**
 * Compact icon-only variant for the mobile top bar.
 */
export function PostJobButtonCompact() {
  const [isClientRole, setIsClientRole] = useState(false);

  useEffect(() => {
    startTransition(() => setIsClientRole(getRoleFromSession() === "CLIENT"));
  }, []);

  if (!isClientRole) return null;

  return <PostJobLink compact />;
}
