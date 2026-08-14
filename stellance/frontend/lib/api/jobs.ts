/**
 * API client for the /jobs endpoints.
 *
 * Thin wrappers around fetch. All functions read the access_token from
 * sessionStorage so they can be called from client components without
 * prop-drilling the token.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// ─── Enums (mirrored from Prisma schema) ─────────────────────────────────────

export type JobStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JobClient {
  id: string;
  name: string;
  stellarPublicKey: string | null;
}

export interface JobContract {
  id: string;
  status: string;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  /** Prisma Decimal is serialised as a string over JSON */
  budget: string;
  category: string;
  status: JobStatus;
  clientId: string;
  createdAt: string;
  updatedAt: string;
  client: JobClient;
  contract: JobContract | null;
}

export interface JobsQueryParams {
  status?: JobStatus;
  /** When true, only return the current user's jobs */
  mine?: boolean;
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class JobsApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "JobsApiError";
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

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: getAuthHeaders(),
  });

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
      // non-JSON error body — use statusText
    }
    throw new JobsApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = res.statusText || "An unexpected error occurred.";
    try {
      const errBody = (await res.json()) as { message?: string | string[] };
      if (errBody.message) {
        message = Array.isArray(errBody.message)
          ? errBody.message.join(", ")
          : errBody.message;
      }
    } catch {
      // non-JSON error body — use statusText
    }
    throw new JobsApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

// ─── Paginated response wrapper (matches JobsService.findAll) ────────────────

export interface PaginatedJobs {
  data: Job[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Jobs API ─────────────────────────────────────────────────────────────────

/**
 * Fetch jobs from GET /jobs.
 * The backend returns a paginated envelope { data, total, page, limit, totalPages }.
 * This function unwraps it and returns just the Job array for backwards compat,
 * since the jobs page does its own client-side pagination on the full result set.
 */
export async function fetchJobs(params?: JobsQueryParams): Promise<Job[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.mine) qs.set("mine", "true");
  // Request a large page so we get all jobs in one shot for client-side filtering
  qs.set("limit", "100");

  const query = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch<PaginatedJobs | Job[]>(`/jobs${query}`);

  // Unwrap paginated envelope if present
  if (res && typeof res === "object" && "data" in res && Array.isArray((res as PaginatedJobs).data)) {
    return (res as PaginatedJobs).data;
  }
  // Fallback: already a plain array
  return res as Job[];
}

/**
 * Fetch a single job by id.
 */
export async function fetchJob(id: string): Promise<Job> {
  return apiFetch<Job>(`/jobs/${id}`);
}

// ─── Create job ───────────────────────────────────────────────────────────────

export interface CreateJobPayload {
  title: string;
  description: string;
  budget: number;
  category: string;
}

/**
 * Create a new job via POST /jobs.
 * Requires a CLIENT role JWT in sessionStorage.
 */
export async function createJob(payload: CreateJobPayload): Promise<Job> {
  return apiPost<Job>("/jobs", payload);
}

// ─── Client-side derived helpers ──────────────────────────────────────────────

/** Available job categories derived from real data (can be expanded over time). */
export const JOB_CATEGORIES = [
  "Smart Contracts",
  "Frontend",
  "Backend",
  "Mobile",
  "Design",
  "DevOps",
  "Writing",
  "Marketing",
  "Data Science",
  "Other",
] as const;

export type JobCategory = (typeof JOB_CATEGORIES)[number];

export interface BudgetRange {
  label: string;
  min: number;
  max: number | null;
}

export const BUDGET_RANGES: BudgetRange[] = [
  { label: "Under $500", min: 0, max: 500 },
  { label: "$500 – $1,000", min: 500, max: 1000 },
  { label: "$1,000 – $5,000", min: 1000, max: 5000 },
  { label: "$5,000 – $10,000", min: 5000, max: 10000 },
  { label: "$10,000+", min: 10000, max: null },
];

/**
 * Apply keyword, category, and budget filters entirely on the client.
 * The backend only supports status + mine filters, so finer filtering is done
 * after the initial fetch.
 */
export function filterJobs(
  jobs: Job[],
  opts: {
    keyword: string;
    category: string;
    budgetRange: BudgetRange | null;
  },
): Job[] {
  const kw = opts.keyword.toLowerCase().trim();

  return jobs.filter((job) => {
    // Keyword match against title, description, or category
    if (kw) {
      const haystack = `${job.title} ${job.description} ${job.category}`.toLowerCase();
      if (!haystack.includes(kw)) return false;
    }

    // Category filter
    if (opts.category && job.category !== opts.category) return false;

    // Budget filter
    if (opts.budgetRange) {
      const budget = parseFloat(job.budget);
      if (budget < opts.budgetRange.min) return false;
      if (opts.budgetRange.max !== null && budget > opts.budgetRange.max)
        return false;
    }

    return true;
  });
}
