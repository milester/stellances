"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchContracts, type Contract, type ContractStatus } from "@/lib/api/contracts";

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<ContractStatus, string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  DISPUTED: "Disputed",
  CANCELLED: "Cancelled",
};

const STATUS_COLOUR: Record<ContractStatus, { bg: string; text: string }> = {
  ACTIVE: { bg: "rgba(61,169,252,0.12)", text: "#3DA9FC" },
  COMPLETED: { bg: "rgba(45,212,191,0.12)", text: "#2DD4BF" },
  DISPUTED: { bg: "rgba(248,113,113,0.12)", text: "#F87171" },
  CANCELLED: { bg: "rgba(100,116,139,0.15)", text: "#94A3B8" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function totalAmount(contract: Contract): string {
  const sum = contract.milestones.reduce(
    (acc, m) => acc + parseFloat(m.amount),
    0,
  );
  return sum.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function completedMilestones(contract: Contract): number {
  return contract.milestones.filter((m) => m.status === "PAID" || m.status === "APPROVED").length;
}

// ─── Contract card ────────────────────────────────────────────────────────────

function ContractCard({ contract }: { contract: Contract }) {
  const statusColour = STATUS_COLOUR[contract.status];
  const statusLabel = STATUS_LABEL[contract.status];
  const jobTitle = contract.job?.title ?? `Contract ${contract.id.slice(0, 8)}`;
  const counterparty = contract.client?.name ?? contract.freelancer?.name ?? "Unknown";
  const done = completedMilestones(contract);
  const total = contract.milestones.length;

  return (
    <article
      className="card-surface p-5 flex flex-col gap-3 hover:border-accent/30 transition-colors"
      aria-label={`Contract: ${jobTitle}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2
            className="text-base font-semibold text-white truncate"
            style={{ fontFamily: "var(--font-space-grotesk)" }}
            title={jobTitle}
          >
            {jobTitle}
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            with{" "}
            <span className="text-text-primary">{counterparty}</span>
          </p>
        </div>

        {/* Status badge */}
        <span
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
          style={{ background: statusColour.bg, color: statusColour.text }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: statusColour.text,
              display: "inline-block",
            }}
          />
          {statusLabel}
        </span>
      </div>

      {/* Amount + milestones */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <div className="flex items-center gap-1.5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "#2DD4BF" }}
            aria-hidden
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v12M9 9h4.5a2.5 2.5 0 0 1 0 5H9" />
          </svg>
          <span className="font-semibold" style={{ color: "#2DD4BF" }}>
            {totalAmount(contract)} XLM
          </span>
        </div>

        {total > 0 && (
          <div className="flex items-center gap-1.5 text-text-muted">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <polyline points="9 11 12 14 22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            <span>
              {done}/{total} milestone{total !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-text-muted ml-auto">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="text-xs">{timeAgo(contract.createdAt)}</span>
        </div>
      </div>

      {/* Milestone progress bar */}
      {total > 0 && (
        <div className="space-y-1">
          <div
            className="w-full rounded-full overflow-hidden"
            style={{ height: 4, background: "var(--color-slate-border)" }}
            aria-label={`${done} of ${total} milestones completed`}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(done / total) * 100}%`,
                background: done === total ? "#2DD4BF" : "var(--color-accent)",
              }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div
        className="flex items-center justify-between pt-3"
        style={{ borderTop: "1px solid var(--color-slate-border)" }}
      >
        <span className="text-xs font-mono text-text-muted" title={contract.id}>
          {contract.id.length > 16
            ? `${contract.id.slice(0, 8)}…${contract.id.slice(-6)}`
            : contract.id}
        </span>
        {contract.jobId && (
          <Link
            href={`/jobs/${contract.jobId}`}
            className="text-xs font-medium text-accent hover:text-accent-bright transition-colors"
          >
            View job →
          </Link>
        )}
      </div>
    </article>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ContractCardSkeleton() {
  return (
    <div className="card-surface p-5 animate-pulse space-y-3" aria-hidden="true">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <div className="h-4 rounded w-3/4" style={{ background: "rgba(36,53,84,0.8)" }} />
          <div className="h-3 rounded w-1/3" style={{ background: "rgba(36,53,84,0.6)" }} />
        </div>
        <div className="h-5 rounded-full w-20" style={{ background: "rgba(36,53,84,0.7)" }} />
      </div>
      <div className="flex gap-4">
        <div className="h-4 rounded w-24" style={{ background: "rgba(36,53,84,0.7)" }} />
        <div className="h-4 rounded w-28" style={{ background: "rgba(36,53,84,0.6)" }} />
      </div>
      <div className="h-1 rounded-full w-full" style={{ background: "rgba(36,53,84,0.6)" }} />
      <div className="h-px w-full" style={{ background: "rgba(36,53,84,0.8)" }} />
      <div className="flex justify-between">
        <div className="h-3 rounded w-24" style={{ background: "rgba(36,53,84,0.6)" }} />
        <div className="h-3 rounded w-16" style={{ background: "rgba(36,53,84,0.5)" }} />
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "rgba(61,169,252,0.08)" }}
        aria-hidden
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--color-accent)" }}
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </div>
      <h2
        className="text-lg font-semibold text-white mb-2"
        style={{ fontFamily: "var(--font-space-grotesk)" }}
      >
        No contracts yet
      </h2>
      <p className="text-sm text-text-muted max-w-sm mb-6">
        Once you agree on a project with a client or freelancer, your contracts
        will appear here.
      </p>
      <Link
        href="/jobs"
        className="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-accent"
        style={{ background: "var(--color-accent)" }}
      >
        Browse jobs
      </Link>
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div
        className="mb-5 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "rgba(248,113,113,0.08)" }}
        aria-hidden
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "var(--color-error)" }}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h2
        className="text-lg font-semibold text-white mb-2"
        style={{ fontFamily: "var(--font-space-grotesk)" }}
      >
        Failed to load contracts
      </h2>
      <p className="text-sm text-text-muted mb-6">
        Could not reach the server. Please check your connection and try again.
      </p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-md text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-accent"
        style={{ background: "var(--color-accent)" }}
      >
        Retry
      </button>
    </div>
  );
}

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTER_STATUSES: Array<ContractStatus | "ALL"> = [
  "ALL",
  "ACTIVE",
  "COMPLETED",
  "DISPUTED",
  "CANCELLED",
];

// ─── Contracts page ───────────────────────────────────────────────────────────

export default function ContractsPage() {
  const [activeFilter, setActiveFilter] = useState<ContractStatus | "ALL">("ALL");

  const { data: contracts, isLoading, isError, refetch } = useQuery<Contract[]>({
    queryKey: ["contracts", "mine"],
    queryFn: () => fetchContracts(),
    meta: {
      onError: () => toast.error("Failed to load contracts. Please retry."),
    },
  });

  const filtered =
    activeFilter === "ALL"
      ? (contracts ?? [])
      : (contracts ?? []).filter((c) => c.status === activeFilter);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Page header */}
      <div className="mb-6">
        <h1
          className="text-2xl sm:text-3xl font-semibold text-white mb-1"
          style={{ fontFamily: "var(--font-space-grotesk)" }}
        >
          My Contracts
        </h1>
        <p className="text-sm text-text-muted">
          {isLoading
            ? "Loading your contracts…"
            : contracts
              ? `${contracts.length} contract${contracts.length !== 1 ? "s" : ""} total`
              : "Track your active, pending, and completed escrow contracts."}
        </p>
      </div>

      {/* Status filter tabs — only when there is data */}
      {!isLoading && !isError && contracts && contracts.length > 0 && (
        <div
          className="flex gap-1 p-1 rounded-lg mb-6 overflow-x-auto"
          style={{
            background: "var(--color-slate-panel)",
            border: "1px solid var(--color-slate-border)",
          }}
          role="tablist"
          aria-label="Filter contracts by status"
        >
          {FILTER_STATUSES.map((s) => {
            const count =
              s === "ALL"
                ? contracts.length
                : contracts.filter((c) => c.status === s).length;
            if (s !== "ALL" && count === 0) return null;
            return (
              <button
                key={s}
                role="tab"
                aria-selected={activeFilter === s}
                onClick={() => setActiveFilter(s)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent"
                style={{
                  background:
                    activeFilter === s ? "var(--color-accent)" : "transparent",
                  color:
                    activeFilter === s ? "#fff" : "var(--color-text-muted)",
                }}
              >
                {s === "ALL" ? "All" : STATUS_LABEL[s]}
                <span
                  className="text-xs px-1.5 py-0.5 rounded-full"
                  style={{
                    background:
                      activeFilter === s
                        ? "rgba(255,255,255,0.2)"
                        : "rgba(123,144,178,0.15)",
                    color:
                      activeFilter === s ? "#fff" : "var(--color-text-muted)",
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          aria-label="Loading contracts…"
          aria-busy="true"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <ContractCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          role="list"
          aria-label="Contract list"
        >
          {filtered.map((contract) => (
            <div key={contract.id} role="listitem">
              <ContractCard contract={contract} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
