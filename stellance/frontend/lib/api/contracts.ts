/**
 * API client for the /contracts endpoints.
 *
 * Mirrors the ContractsService/ContractsController on the backend.
 * All functions read the access_token from sessionStorage so they can be
 * called from client components without prop-drilling the token.
 *
 * Decimal amounts come back as strings over JSON (Prisma Decimal serialisation).
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// ─── Enums (mirrored from Prisma schema) ─────────────────────────────────────

export type ContractStatus =
  | "PENDING"
  | "ACTIVE"
  | "COMPLETED"
  | "DISPUTED"
  | "CANCELLED";

export type MilestoneStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "APPROVED"
  | "PAID";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MilestoneInput {
  title: string;
  /** Amount in XLM */
  amount: number;
}

export interface CreateContractPayload {
  jobId: string;
  freelancerId: string;
  milestones: MilestoneInput[];
}

export interface Milestone {
  id: string;
  contractId: string;
  title: string;
  /** Prisma Decimal serialised as a string */
  amount: string;
  status: MilestoneStatus;
  createdAt: string;
  updatedAt: string;
  payment?: Payment | null;
}

export interface Payment {
  id: string;
  contractId: string;
  milestoneId: string | null;
  amount: string;
  stellarTxHash: string;
  createdAt: string;
}

export interface ContractParty {
  id: string;
  name: string;
  stellarPublicKey?: string | null;
}

export interface ContractJob {
  id: string;
  title: string;
}

export interface Contract {
  id: string;
  jobId: string;
  clientId: string;
  freelancerId: string;
  status: ContractStatus;
  escrowTxHash: string | null;
  createdAt: string;
  updatedAt: string;
  milestones: Milestone[];
  payments?: Payment[];
  job?: ContractJob;
  client?: ContractParty;
  freelancer?: ContractParty;
}

export interface CreateContractResponse {
  contract: Contract;
  /** Unsigned XDR for Freighter to sign. Null if Soroban RPC is unavailable. */
  fundXdr: string | null;
}

export type DisputeDecision = "release" | "refund" | "split";

export interface ResolveDisputePayload {
  decision: DisputeDecision;
  /** Basis points for the freelancer (0–10_000). Only used when decision="split". */
  freelancerBps?: number;
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class ContractsApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ContractsApiError";
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
      // non-JSON error body — use statusText
    }
    throw new ContractsApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: getAuthHeaders(),
  });
  return handleResponse<T>(res);
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: getAuthHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    credentials: "include",
    headers: getAuthHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

// ─── Contracts API ────────────────────────────────────────────────────────────

/**
 * POST /contracts
 *
 * Create a new contract with milestones. Returns the contract record and
 * an unsigned fund XDR for Freighter signing (or null if Soroban RPC is down).
 */
export async function createContract(
  payload: CreateContractPayload,
): Promise<CreateContractResponse> {
  return apiPost<CreateContractResponse>("/contracts", payload);
}

/**
 * GET /contracts
 *
 * List contracts for the authenticated user.
 * Pass `as` to filter by role ("client" or "freelancer").
 */
export async function fetchContracts(
  as?: "client" | "freelancer",
): Promise<Contract[]> {
  const qs = as ? `?as=${as}` : "";
  return apiFetch<Contract[]>(`/contracts${qs}`);
}

/**
 * GET /contracts/:id
 */
export async function fetchContract(id: string): Promise<Contract> {
  return apiFetch<Contract>(`/contracts/${id}`);
}

/**
 * POST /contracts/:id/confirm-fund
 *
 * Call after the client has submitted the signed fund() tx to Soroban.
 * Records the tx hash on the contract.
 */
export async function confirmFund(
  contractId: string,
  txHash: string,
): Promise<Contract> {
  return apiPost<Contract>(`/contracts/${contractId}/confirm-fund`, { txHash });
}

/**
 * PATCH /contracts/:id/milestones/:milestoneId/submit
 *
 * Freelancer submits a milestone for client review.
 */
export async function submitMilestone(
  contractId: string,
  milestoneId: string,
): Promise<Milestone> {
  return apiPatch<Milestone>(
    `/contracts/${contractId}/milestones/${milestoneId}/submit`,
  );
}

/**
 * PATCH /contracts/:id/milestones/:milestoneId/approve
 *
 * Client approves a milestone. The backend calls release_milestone() on
 * Soroban and records the Payment on success.
 */
export async function approveMilestone(
  contractId: string,
  milestoneId: string,
): Promise<Milestone> {
  return apiPatch<Milestone>(
    `/contracts/${contractId}/milestones/${milestoneId}/approve`,
  );
}

/**
 * POST /contracts/:id/dispute
 *
 * Raise a dispute on an active contract. Freezes the on-chain escrow.
 */
export async function raiseDispute(
  contractId: string,
  reason: string,
): Promise<{ status: ContractStatus }> {
  return apiPost<{ status: ContractStatus }>(
    `/contracts/${contractId}/dispute`,
    { reason },
  );
}

/**
 * PATCH /contracts/admin/:id/resolve
 *
 * Admin-only: resolve a disputed contract with a decision.
 */
export async function resolveDispute(
  contractId: string,
  payload: ResolveDisputePayload,
): Promise<{ resolved: boolean; txHash: string; status: ContractStatus }> {
  return apiPatch(`/contracts/admin/${contractId}/resolve`, payload);
}

/**
 * POST /contracts/:id/cancel
 *
 * Client (or admin) cancels a contract. Refunds the escrow if funded.
 */
export async function cancelContract(
  contractId: string,
): Promise<{ cancelled: boolean; txHash?: string }> {
  return apiPost(`/contracts/${contractId}/cancel`);
}

// ─── GET /payments/contracts/:contractId ─────────────────────────────────────

/**
 * Fetch all payment records for a contract.
 * This lives in the payments namespace but is co-located here for convenience.
 */
export async function fetchContractPayments(
  contractId: string,
): Promise<Payment[]> {
  return apiFetch<Payment[]>(`/payments/contracts/${contractId}`);
}
