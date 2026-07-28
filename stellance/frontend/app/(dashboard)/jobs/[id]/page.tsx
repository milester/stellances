"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchJob, JobsApiError, type Job } from "@/lib/api/jobs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBudget(budget: string): string {
  const n = parseFloat(budget);
  if (isNaN(n)) return budget;
  return n.toLocaleString("en-US", { maximumFractionDigits: 7 }) + " XLM";
}

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

const STATUS_LABEL: Record<Job["status"], string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const STATUS_COLOUR: Record<Job["status"], { bg: string; text: string }> = {
  OPEN: { bg: "rgba(45,212,191,0.12)", text: "#2dd4bf" },
  IN_PROGRESS: { bg: "rgba(61,169,252,0.12)", text: "#3da9fc" },
  COMPLETED: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8" },
  CANCELLED: { bg: "rgba(248,113,113,0.12)", text: "#f87171" },
};

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function JobDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden role="presentation">
      <div className="h-8 rounded w-2/3" style={{ background: "rgba(36,53,84,0.8)" }} />
      <div className="flex gap-3">
        <div className="h-6 rounded-full w-24" style={{ background: "rgba(36,53,84,0.7)" }} />
        <div className="h-6 rounded-full w-20" style={{ background: "rgba(36,53,84,0.7)" }} />
      </div>
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-4 rounded" style={{ background: "rgba(36,53,84,0.6)", width: `${80 + (i % 3) * 7}%` }} />
        ))}
      </div>
      <div className="h-10 rounded-md w-32" style={{ background: "rgba(36,53,84,0.7)" }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const {
    data: job,
    isLoading,
    isError,
    error,
  } = useQuery<Job>({
    queryKey: ["job", id],
    queryFn: () => fetchJob(id!),
    enabled: !!id,
  });

  // Surface 404 as a redirect to the listing
  useEffect(() => {
    if (error instanceof JobsApiError && error.status === 404) {
      toast.error("Job not found.");
      router.replace("/dashboard/jobs");
    }
  }, [error, router]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* Back link */}
      <Link
        href="/dashboard/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-white transition-colors mb-6"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Browse jobs
      </Link>

      {isLoading && <JobDetailSkeleton />}

      {isError && !(error instanceof JobsApiError && error.status === 404) && (
        <div className="card-surface p-8 text-center">
          <p className="text-text-muted text-sm mb-4">
            Could not load this job. Please try again.
          </p>
          <button
            onClick={() => router.refresh()}
            className="px-4 py-2 rounded-md text-sm font-medium text-white bg-accent hover:bg-accent-hover transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {job && (
        <div className="space-y-6">
          {/* ── Header card ───────────────────────────────────────────────── */}
          <div className="card-surface p-6 sm:p-8">
            {/* Category + status */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  background: "rgba(61,169,252,0.1)",
                  color: "#3da9fc",
                  border: "1px solid rgba(61,169,252,0.2)",
                }}
              >
                {job.category}
              </span>

              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={{
                  background: STATUS_COLOUR[job.status].bg,
                  color: STATUS_COLOUR[job.status].text,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    backgroundColor: STATUS_COLOUR[job.status].text,
                    display: "inline-block",
                  }}
                />
                {STATUS_LABEL[job.status]}
              </span>
            </div>

            {/* Title */}
            <h1
              className="text-2xl sm:text-3xl font-semibold text-white mb-4"
              style={{ fontFamily: "var(--font-space-grotesk)" }}
            >
              {job.title}
            </h1>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text-muted mb-6">
              {/* Budget */}
              <div className="flex items-center gap-1.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                  style={{ color: "#2dd4bf" }}
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v12M9 9h4.5a2.5 2.5 0 0 1 0 5H9" />
                </svg>
                <span className="font-semibold" style={{ color: "#2dd4bf" }}>
                  {formatBudget(job.budget)}
                </span>
              </div>

              {/* Client */}
              {job.client?.name && (
                <div className="flex items-center gap-1.5">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                    aria-hidden
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>{job.client.name}</span>
                </div>
              )}

              {/* Posted */}
              <div className="flex items-center gap-1.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                  aria-hidden
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <time dateTime={job.createdAt}>Posted {timeAgo(job.createdAt)}</time>
              </div>
            </div>

            {/* Description */}
            <div
              className="prose prose-sm max-w-none pt-6"
              style={{ borderTop: "1px solid var(--color-slate-border)" }}
            >
              <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
                Project description
              </h2>
              <p className="text-text-primary text-sm leading-relaxed whitespace-pre-wrap">
                {job.description}
              </p>
            </div>
          </div>

          {/* ── Apply / action placeholder ─────────────────────────────────── */}
          {job.status === "OPEN" && (
            <div className="card-surface p-6 sm:p-8">
              <h2
                className="text-lg font-semibold text-white mb-2"
                style={{ fontFamily: "var(--font-space-grotesk)" }}
              >
                Interested in this project?
              </h2>
              <p className="text-sm text-text-muted mb-5">
                Apply to this job or reach out to the client. Once agreed,
                the client will fund the escrow contract and work can begin.
              </p>
              <button
                disabled
                className="px-5 py-2.5 rounded-md text-sm font-semibold text-white bg-accent opacity-50 cursor-not-allowed"
                aria-label="Apply to this job — coming soon"
                title="Applications coming soon"
              >
                Apply — coming soon
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
