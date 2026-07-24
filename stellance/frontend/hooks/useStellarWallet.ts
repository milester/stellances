/**
 * useStellarWallet
 *
 * React hook that wires the Freighter browser extension to the Zustand wallet
 * store.  All side-effectful operations (connecting, disconnecting, balance
 * fetches) live here; the store is kept as pure state.
 *
 * Freighter does not ship its own @types package, so the browser API is
 * typed via the FreighterApi interface below using the Freighter JS API docs.
 *
 * Horizon balance fetch uses @stellar/stellar-sdk already in the project.
 */

"use client";

import { useCallback, useEffect } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import { useWalletStore } from "@/lib/stores/walletStore";

// ─── Freighter browser API types ──────────────────────────────────────────────

interface FreighterApi {
  /** Returns the public key of the connected account. */
  getPublicKey(): Promise<string>;
  /** Returns true when the user has granted the site permission. */
  isConnected(): Promise<boolean | { isConnected: boolean }>;
  /** Prompts the user to grant the site permission to read their public key. */
  requestAccess(): Promise<string>;
  /** Returns the network the wallet is on ("TESTNET" | "PUBLIC" | …). */
  getNetwork(): Promise<string>;
}

declare global {
  interface Window {
    freighter?: FreighterApi;
  }
}

// ─── Horizon server ───────────────────────────────────────────────────────────

// Use testnet by default; swap for PUBLIC_HORIZON_URL in production.
const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: false });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely detect whether Freighter is installed in the current browser. */
function isFreighterInstalled(): boolean {
  return typeof window !== "undefined" && typeof window.freighter !== "undefined";
}

/**
 * Normalise isConnected() return value.
 *
 * Freighter's JS SDK ≥ 1.7 returns `{ isConnected: boolean }`.
 * Older versions return a plain boolean.  Handle both.
 */
function parseIsConnected(result: boolean | { isConnected: boolean }): boolean {
  if (typeof result === "boolean") return result;
  return result.isConnected;
}

/** Format a raw XLM balance string to 7 decimal places maximum. */
function formatXlm(raw: string): string {
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  // Strip trailing zeros but keep at least 2 decimal places
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStellarWallet() {
  const {
    publicKey,
    balance,
    status,
    isLoadingBalance,
    error,
    setConnected,
    setBalance,
    setStatus,
    setLoadingBalance,
    setError,
    disconnect,
  } = useWalletStore();

  // ── Fetch XLM balance from Horizon ────────────────────────────────────────

  const fetchBalance = useCallback(
    async (key: string) => {
      setLoadingBalance(true);
      try {
        const account = await horizon.loadAccount(key);
        const xlmBalance = account.balances.find(
          (b) => b.asset_type === "native"
        );
        setBalance(xlmBalance ? formatXlm(xlmBalance.balance) : "0.00");
      } catch {
        // Non-fatal: wallet can be connected even if Horizon is unreachable
        setBalance("—");
      } finally {
        setLoadingBalance(false);
      }
    },
    [setBalance, setLoadingBalance]
  );

  // ── Connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (!isFreighterInstalled()) {
      setError(
        "Freighter wallet not found. Install it at freighter.app and reload."
      );
      setStatus("disconnected");
      return;
    }

    setStatus("checking");
    setError(null);

    try {
      // requestAccess() shows the Freighter permission modal if needed and
      // returns the public key on success.
      const key = await window.freighter!.requestAccess();
      if (!key) throw new Error("Access denied.");
      setConnected(key);
      await fetchBalance(key);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to connect wallet.";
      setError(msg);
      setStatus("disconnected");
    }
  }, [setConnected, setStatus, setError, fetchBalance]);

  // ── Disconnect ────────────────────────────────────────────────────────────

  const handleDisconnect = useCallback(() => {
    // Freighter has no programmatic disconnect; we just clear local state.
    disconnect();
  }, [disconnect]);

  // ── Refresh balance ───────────────────────────────────────────────────────

  const refreshBalance = useCallback(async () => {
    if (publicKey) await fetchBalance(publicKey);
  }, [publicKey, fetchBalance]);

  // ── Auto-reconnect on mount ───────────────────────────────────────────────
  // If the user already granted access in a previous session, silently
  // restore their public key without showing the Freighter modal again.

  useEffect(() => {
    if (status !== "idle") return;
    if (!isFreighterInstalled()) {
      setStatus("disconnected");
      return;
    }

    let cancelled = false;

    (async () => {
      setStatus("checking");
      try {
        const result = await window.freighter!.isConnected();
        if (cancelled) return;

        if (parseIsConnected(result)) {
          const key = await window.freighter!.getPublicKey();
          if (cancelled) return;
          if (key) {
            setConnected(key);
            await fetchBalance(key);
          } else {
            setStatus("disconnected");
          }
        } else {
          setStatus("disconnected");
        }
      } catch {
        if (!cancelled) setStatus("disconnected");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, setConnected, setStatus, fetchBalance]);

  // ── Derived helpers ───────────────────────────────────────────────────────

  /** Truncated address for display: "GABCD…WXYZ" */
  const truncatedAddress = publicKey
    ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
    : null;

  const isConnected = status === "connected";
  const isChecking = status === "checking";

  return {
    // State
    publicKey,
    truncatedAddress,
    balance,
    status,
    isConnected,
    isChecking,
    isLoadingBalance,
    error,
    // Actions
    connect,
    disconnect: handleDisconnect,
    refreshBalance,
  };
}
