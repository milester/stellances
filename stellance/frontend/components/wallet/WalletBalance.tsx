/**
 * WalletBalance
 *
 * Displays the connected wallet's XLM balance.
 *
 * layout="card"   — standalone card surface (e.g. dashboard widgets)
 * layout="inline" — compact row for use inside the WalletConnect dropdown
 *
 * Shows a skeleton pulse while loading, a muted dash when disconnected,
 * and a refresh button to pull the latest balance on demand.
 */

"use client";

import { useSyncExternalStore } from "react";
import { useStellarWallet } from "@/hooks/useStellarWallet";

// ─── Icons ────────────────────────────────────────────────────────────────────

function XlmIcon({ size = 18 }: { size?: number }) {
  // Stellar (XLM) logotype approximated as a simple glyph
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.95 6.05-7.07 7.07-1.41-1.41 7.07-7.07zM7.05 8.46l7.07 7.07-1.41 1.42L5.64 9.88z" />
    </svg>
  );
}

function RefreshIcon({ size = 12 }: { size?: number }) {
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
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function BalanceSkeleton({ inline }: { inline: boolean }) {
  if (inline) {
    return (
      <div
        aria-hidden
        style={{
          height: 14,
          width: 72,
          borderRadius: 4,
          background: "rgba(36,53,84,0.8)",
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
    );
  }
  return (
    <div
      aria-hidden
      style={{
        height: 28,
        width: 120,
        borderRadius: 6,
        background: "rgba(36,53,84,0.8)",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

// ─── WalletBalance ────────────────────────────────────────────────────────────

export interface WalletBalanceProps {
  /** "card" renders as a standalone card surface; "inline" is a compact row. */
  layout?: "card" | "inline";
}

export function WalletBalance({ layout = "card" }: WalletBalanceProps) {
  const { balance, isConnected, isLoadingBalance, refreshBalance } =
    useStellarWallet();

  // Prevent SSR mismatch — useSyncExternalStore avoids react-hooks/set-state-in-effect
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // ── Inline layout ─────────────────────────────────────────────────────────

  if (layout === "inline") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{ color: "var(--color-text-muted)" }}>
            <XlmIcon size={14} />
          </span>
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 600,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            XLM Balance
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          {!mounted || isLoadingBalance ? (
            <BalanceSkeleton inline />
          ) : isConnected && balance ? (
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 700,
                fontFamily: "var(--font-space-grotesk)",
                color: "#2DD4BF",
              }}
            >
              {balance} XLM
            </span>
          ) : (
            <span
              style={{
                fontSize: "0.8125rem",
                color: "var(--color-text-muted)",
              }}
            >
              —
            </span>
          )}

          {isConnected && (
            <button
              onClick={refreshBalance}
              disabled={isLoadingBalance}
              aria-label="Refresh XLM balance"
              style={{
                background: "none",
                border: "none",
                padding: "2px",
                cursor: isLoadingBalance ? "not-allowed" : "pointer",
                color: "var(--color-text-muted)",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 4,
                transition: "color 120ms",
                opacity: isLoadingBalance ? 0.4 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isLoadingBalance)
                  (e.currentTarget as HTMLButtonElement).style.color =
                    "var(--color-accent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color =
                  "var(--color-text-muted)";
              }}
            >
              <RefreshIcon />
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Card layout ───────────────────────────────────────────────────────────

  return (
    <section
      className="card-surface"
      style={{ padding: "1.25rem 1.5rem" }}
      aria-label="XLM Balance"
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.875rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "rgba(45,212,191,0.12)",
              color: "#2DD4BF",
            }}
          >
            <XlmIcon size={16} />
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--color-text-muted)",
            }}
          >
            XLM Balance
          </span>
        </div>

        {isConnected && (
          <button
            onClick={refreshBalance}
            disabled={isLoadingBalance}
            aria-label="Refresh XLM balance"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              background: "none",
              border: "none",
              padding: "0.25rem 0.5rem",
              borderRadius: "var(--radius-sm)",
              cursor: isLoadingBalance ? "not-allowed" : "pointer",
              color: "var(--color-text-muted)",
              fontSize: "0.7rem",
              transition: "color 120ms, background 120ms",
              opacity: isLoadingBalance ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isLoadingBalance) {
                const el = e.currentTarget as HTMLButtonElement;
                el.style.color = "var(--color-accent)";
                el.style.background = "rgba(61,169,252,0.08)";
              }
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.color = "var(--color-text-muted)";
              el.style.background = "none";
            }}
          >
            <RefreshIcon size={12} />
            Refresh
          </button>
        )}
      </div>

      {/* Balance value */}
      {!mounted || isLoadingBalance ? (
        <BalanceSkeleton inline={false} />
      ) : isConnected && balance ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
          <span
            style={{
              fontSize: "1.75rem",
              fontWeight: 700,
              fontFamily: "var(--font-space-grotesk)",
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {balance}
          </span>
          <span
            style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#2DD4BF",
              letterSpacing: "0.04em",
            }}
          >
            XLM
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              color: "var(--color-text-muted)",
            }}
          >
            — XLM
          </span>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--color-text-muted)",
              marginTop: "0.25rem",
            }}
          >
            Connect your Freighter wallet to see your balance.
          </p>
        </div>
      )}
    </section>
  );
}

// CSS for skeleton animation — injected once
if (typeof document !== "undefined") {
  const id = "stellance-pulse-keyframe";
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);
  }
}
