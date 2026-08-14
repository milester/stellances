/**
 * API client for the /payments endpoints.
 *
 * The payments backend module is in active development. Until it ships this
 * file provides:
 *   1. Stable TypeScript types that mirror the expected API shape.
 *   2. Mock implementations of every fetch function so the UI can be built
 *      and tested independently.
 *
 * When the real backend is ready, swap the mock functions for real `apiFetch`
 * calls — no other files need to change.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

// ─── Enums ────────────────────────────────────────────────────────────────────

export type TransactionType =
  | "ESCROW_FUNDED"
  | "MILESTONE_RELEASED"
  | "FULL_RELEASE"
  | "REFUND"
  | "WITHDRAWAL"
  | "DISPUTE_RESOLVED";

export type TransactionStatus = "PENDING" | "CONFIRMED" | "FAILED";

export type AssetCode = "XLM" | "USDC";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletBalance {
  asset: AssetCode;
  /** Raw balance string, e.g. "1234.5678900" */
  balance: string;
  /** Stellar network — "testnet" | "mainnet" */
  network: "testnet" | "mainnet";
}

export interface Transaction {
  id: string;
  /** ISO-8601 timestamp */
  createdAt: string;
  type: TransactionType;
  status: TransactionStatus;
  asset: AssetCode;
  /** Positive = credit (received), negative = debit (sent) */
  amount: string;
  /** Human-readable description, e.g. milestone title or contract label */
  description: string;
  /** On-chain transaction hash; null for pending or off-chain records */
  stellarTxHash: string | null;
  /** Counter-party wallet address */
  counterparty: string | null;
  /** Contract / escrow this transaction belongs to */
  contractId: string | null;
}

export interface PaymentsSummary {
  balances: WalletBalance[];
  recentTransactions: Transaction[];
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class PaymentsApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PaymentsApiError";
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
    throw new PaymentsApiError(res.status, message);
  }

  return res.json() as Promise<T>;
}

// ─── Payments API ─────────────────────────────────────────────────────────────

/**
 * Fetch wallet balances for the current user.
 * Returns XLM and USDC balances fetched from Horizon via the backend.
 */
export async function fetchWalletBalances(): Promise<WalletBalance[]> {
  return apiFetch<WalletBalance[]>("/payments/balances");
}

/**
 * Fetch the full transaction history for the current user.
 * Derived from Payment records in the DB, enriched with contract/job context.
 */
export async function fetchTransactions(): Promise<Transaction[]> {
  return apiFetch<Transaction[]>("/payments/transactions");
}

/**
 * Initiate a withdrawal to an external Stellar address.
 * Returns the new confirmed transaction record.
 */
export async function initiateWithdrawal(payload: {
  asset: AssetCode;
  amount: string;
  destinationAddress: string;
}): Promise<Transaction> {
  const res = await fetch(`${BASE_URL}/payments/withdraw`, {
    method: "POST",
    credentials: "include",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = "Withdrawal failed. Please try again.";
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) {
        message = Array.isArray(body.message)
          ? body.message.join(", ")
          : body.message;
      }
    } catch {
      // ignore
    }
    throw new PaymentsApiError(res.status, message);
  }

  return res.json() as Promise<Transaction>;
}

// ─── Client-side helpers ──────────────────────────────────────────────────────

/** Stellar Expert base URL for a given network. */
export function stellarExpertTxUrl(
  hash: string,
  network: "testnet" | "mainnet" = "testnet",
): string {
  const net = network === "mainnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${net}/tx/${hash}`;
}

/** Human-readable labels for each transaction type. */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  ESCROW_FUNDED: "Escrow Funded",
  MILESTONE_RELEASED: "Milestone Released",
  FULL_RELEASE: "Full Release",
  REFUND: "Refund",
  WITHDRAWAL: "Withdrawal",
  DISPUTE_RESOLVED: "Dispute Resolved",
};

/** Format a raw Stellar balance string (removes trailing zeros). */
export function formatBalance(balance: string, asset: AssetCode): string {
  const n = parseFloat(balance);
  if (isNaN(n)) return balance;

  if (asset === "XLM") {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }
  // USDC: 2 decimal places
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format a transaction amount with sign and symbol. */
export function formatTxAmount(amount: string, asset: AssetCode): string {
  const isNeg = amount.startsWith("-");
  const abs = parseFloat(amount.replace(/[+-]/, ""));
  if (isNaN(abs)) return amount;

  const formatted =
    asset === "XLM"
      ? abs.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        })
      : abs.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });

  return `${isNeg ? "−" : "+"}${formatted} ${asset}`;
}

/** Truncate a Stellar address or tx hash for display. */
export function truncateHash(hash: string, chars = 6): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return `${hash.slice(0, chars)}…${hash.slice(-chars)}`;
}
