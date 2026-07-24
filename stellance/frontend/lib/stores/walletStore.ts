/**
 * Zustand store for Stellar wallet state.
 *
 * Holds the connected wallet's public key, XLM balance, and connection status.
 * Kept deliberately flat — all side-effectful operations (Freighter calls,
 * Horizon balance fetch) live in the useStellarWallet hook, not here.
 */

import { create } from "zustand";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WalletStatus =
  | "idle"        // not yet checked
  | "checking"    // probing Freighter on mount
  | "connected"   // wallet connected, publicKey is set
  | "disconnected"; // user disconnected, or Freighter not installed

export interface WalletState {
  /** Stellar G-address of the connected account, or null when disconnected. */
  publicKey: string | null;
  /** Native XLM balance as a human-readable string (e.g. "42.1234567"), or null. */
  balance: string | null;
  /** Connection lifecycle status. */
  status: WalletStatus;
  /** True while a balance fetch is in flight. */
  isLoadingBalance: boolean;
  /** Error message from the last failed operation, if any. */
  error: string | null;
}

export interface WalletActions {
  setConnected: (publicKey: string) => void;
  setBalance: (balance: string) => void;
  setStatus: (status: WalletStatus) => void;
  setLoadingBalance: (loading: boolean) => void;
  setError: (error: string | null) => void;
  disconnect: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useWalletStore = create<WalletState & WalletActions>()((set) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  publicKey: null,
  balance: null,
  status: "idle",
  isLoadingBalance: false,
  error: null,

  // ── Actions ────────────────────────────────────────────────────────────────

  setConnected: (publicKey) =>
    set({ publicKey, status: "connected", error: null }),

  setBalance: (balance) => set({ balance }),

  setStatus: (status) => set({ status }),

  setLoadingBalance: (isLoadingBalance) => set({ isLoadingBalance }),

  setError: (error) => set({ error }),

  /** Fully reset wallet state to the disconnected baseline. */
  disconnect: () =>
    set({
      publicKey: null,
      balance: null,
      status: "disconnected",
      isLoadingBalance: false,
      error: null,
    }),
}));
