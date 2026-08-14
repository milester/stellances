/**
 * useStellarWallet
 *
 * React hook that wires the Freighter browser extension to the Zustand wallet
 * store using the official @stellar/freighter-api package.
 *
 * Using the package instead of window.freighter directly ensures compatibility
 * with Freighter v5+ which no longer injects window.freighter in all browsers.
 */

"use client";

import { useCallback, useEffect } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import { useWalletStore } from "@/lib/stores/walletStore";
import {
  isConnected as freighterIsConnected,
  requestAccess,
  getAddress,
  getNetwork,
} from "@stellar/freighter-api";

// ─── Horizon server ───────────────────────────────────────────────────────────

const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: false });

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a raw XLM balance string to at most 4 decimal places. */
function formatXlm(raw: string): string {
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
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
        setBalance("—");
      } finally {
        setLoadingBalance(false);
      }
    },
    [setBalance, setLoadingBalance]
  );

  // ── Connect ───────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    setStatus("checking");
    setError(null);

    try {
      // Check if Freighter is installed and accessible
      const connectionResult = await freighterIsConnected();

      // freighter-api v6 returns { isConnected: boolean } or throws if not installed
      const installed =
        typeof connectionResult === "boolean"
          ? connectionResult
          : connectionResult?.isConnected ?? false;

      if (!installed) {
        // Freighter is not installed
        setError(
          "Freighter wallet not found. Install it at freighter.app and reload."
        );
        setStatus("disconnected");
        return;
      }

      // Request permission — shows Freighter modal if not yet granted
      const accessResult = await requestAccess();

      // v6 returns { address: string } or { error: string }
      let key: string | null = null;
      if (typeof accessResult === "string") {
        key = accessResult;
      } else if (accessResult && "address" in accessResult) {
        key = (accessResult as { address: string }).address;
      } else if (accessResult && "error" in accessResult) {
        throw new Error((accessResult as { error: string }).error);
      }

      if (!key) throw new Error("No public key returned from Freighter.");

      setConnected(key);
      await fetchBalance(key);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to connect wallet.";

      // Translate common Freighter error messages into user-friendly ones
      const friendlyMsg = msg.includes("not installed") || msg.includes("not found")
        ? "Freighter wallet not found. Install it at freighter.app and reload."
        : msg.includes("User declined") || msg.includes("rejected")
        ? "Connection rejected. Click Connect Wallet to try again."
        : msg;

      setError(friendlyMsg);
      setStatus("disconnected");
    }
  }, [setConnected, setStatus, setError, fetchBalance]);

  // ── Disconnect ────────────────────────────────────────────────────────────

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  // ── Refresh balance ───────────────────────────────────────────────────────

  const refreshBalance = useCallback(async () => {
    if (publicKey) await fetchBalance(publicKey);
  }, [publicKey, fetchBalance]);

  // ── Auto-reconnect on mount ───────────────────────────────────────────────
  // Silently restore the connection if the user already granted access.

  useEffect(() => {
    if (status !== "idle") return;

    let cancelled = false;

    (async () => {
      try {
        const connectionResult = await freighterIsConnected();
        if (cancelled) return;

        const isConn =
          typeof connectionResult === "boolean"
            ? connectionResult
            : connectionResult?.isConnected ?? false;

        if (!isConn) {
          setStatus("disconnected");
          return;
        }

        setStatus("checking");

        // getAddress() returns the key without showing a modal if already permitted
        const addressResult = await getAddress();
        if (cancelled) return;

        let key: string | null = null;
        if (typeof addressResult === "string") {
          key = addressResult;
        } else if (addressResult && "address" in addressResult) {
          key = (addressResult as { address: string }).address;
        }

        if (key) {
          setConnected(key);
          await fetchBalance(key);
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

  const truncatedAddress = publicKey
    ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
    : null;

  const isConnected = status === "connected";
  const isChecking = status === "checking";
  // If we got the specific "not found" error, Freighter is not installed
  const freighterInstalled = !error?.includes("not found") && !error?.includes("Install it");

  // Expose getNetwork for components that need to verify testnet/mainnet
  const getWalletNetwork = useCallback(async (): Promise<string | null> => {
    try {
      const result = await getNetwork();
      if (typeof result === "string") return result;
      if (result && "network" in result) return (result as { network: string }).network;
      return null;
    } catch {
      return null;
    }
  }, []);

  return {
    publicKey,
    truncatedAddress,
    balance,
    status,
    isConnected,
    isChecking,
    isLoadingBalance,
    error,
    freighterInstalled,
    connect,
    disconnect: handleDisconnect,
    refreshBalance,
    getWalletNetwork,
  };
}
