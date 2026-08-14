/**
 * WalletConnect
 *
 * "Connect Wallet" button for the dashboard navbar.
 *
 * States:
 *  - idle / disconnected → blue "Connect Wallet" button
 *  - checking            → spinner (non-interactive)
 *  - connected           → pill showing truncated address + dropdown with
 *                          full address, XLM balance, copy, and disconnect
 *
 * Renders nothing on the server (wallet state is browser-only), so it is
 * wrapped in a no-SSR guard via useEffect + mounted flag.
 */

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useStellarWallet } from "@/hooks/useStellarWallet";
import { WalletBalance } from "./WalletBalance";

// ─── Icons ────────────────────────────────────────────────────────────────────

function WalletIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CopyIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DisconnectIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
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

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "2px solid rgba(61,169,252,0.3)",
        borderTopColor: "#3DA9FC",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}

// ─── Connected dropdown ───────────────────────────────────────────────────────

interface ConnectedDropdownProps {
  publicKey: string;
  truncatedAddress: string;
  onDisconnect: () => void;
  onRefresh: () => void;
}

function ConnectedDropdown({
  publicKey,
  truncatedAddress,
  onDisconnect,
  onRefresh,
}: ConnectedDropdownProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const copyAddress = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  }, [publicKey]);

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Trigger pill */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Wallet options"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.375rem 0.75rem",
          borderRadius: "9999px",
          background: "rgba(61,169,252,0.12)",
          border: "1px solid rgba(61,169,252,0.3)",
          color: "#3DA9FC",
          fontSize: "0.75rem",
          fontWeight: 600,
          fontFamily: "var(--font-space-grotesk)",
          cursor: "pointer",
          transition: "background 150ms",
          letterSpacing: "0.01em",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(61,169,252,0.2)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(61,169,252,0.12)";
        }}
      >
        {/* Connected dot */}
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#2DD4BF",
            boxShadow: "0 0 6px rgba(45,212,191,0.8)",
            flexShrink: 0,
          }}
        />
        <span>{truncatedAddress}</span>
        <span
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0)",
            transition: "transform 150ms",
            display: "inline-flex",
          }}
        >
          <ChevronDownIcon />
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="menu"
          aria-label="Wallet menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            minWidth: 260,
            background: "var(--color-slate-panel)",
            border: "1px solid var(--color-slate-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(61,169,252,0.06)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          {/* Address section */}
          <div
            style={{
              padding: "0.875rem 1rem",
              borderBottom: "1px solid var(--color-slate-border)",
            }}
          >
            <p
              style={{
                fontSize: "0.65rem",
                fontWeight: 600,
                letterSpacing: "0.08em",
                color: "var(--color-text-muted)",
                marginBottom: "0.3rem",
                textTransform: "uppercase",
              }}
            >
              Connected wallet
            </p>
            <p
              style={{
                fontSize: "0.7rem",
                fontFamily: "monospace",
                color: "var(--color-text-primary)",
                wordBreak: "break-all",
                lineHeight: 1.5,
              }}
              title={publicKey}
            >
              {publicKey}
            </p>
          </div>

          {/* Balance */}
          <div
            style={{
              padding: "0.75rem 1rem",
              borderBottom: "1px solid var(--color-slate-border)",
            }}
          >
            <WalletBalance layout="inline" />
          </div>

          {/* Actions */}
          <div style={{ padding: "0.375rem" }}>
            <DropdownItem
              icon={<CopyIcon />}
              label={copied ? "Copied!" : "Copy address"}
              onClick={copyAddress}
            />
            <DropdownItem
              icon={<RefreshIcon />}
              label="Refresh balance"
              onClick={() => {
                onRefresh();
                setOpen(false);
              }}
            />
            <DropdownItem
              icon={<DisconnectIcon />}
              label="Disconnect"
              onClick={() => {
                onDisconnect();
                setOpen(false);
              }}
              danger
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dropdown item ────────────────────────────────────────────────────────────

function DropdownItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    width: "100%",
    padding: "0.5rem 0.625rem",
    background: "transparent",
    border: "none",
    borderRadius: "var(--radius-sm)",
    color: danger ? "var(--color-error)" : "var(--color-text-primary)",
    fontSize: "0.8125rem",
    cursor: "pointer",
    textAlign: "left",
    transition: "background 120ms",
  };

  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={base}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = danger
          ? "rgba(248,113,113,0.08)"
          : "rgba(255,255,255,0.05)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <span style={{ color: danger ? "var(--color-error)" : "var(--color-text-muted)" }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

// ─── WalletConnect ────────────────────────────────────────────────────────────

/**
 * variant="full" — used in the sidebar footer (shows icon + label)
 * variant="compact" — used in the mobile topbar (icon + short label)
 */
export interface WalletConnectProps {
  variant?: "full" | "compact";
}

export function WalletConnect({ variant = "full" }: WalletConnectProps) {
  const { publicKey, truncatedAddress, isConnected, isChecking, error, freighterInstalled, connect, disconnect, refreshBalance } =
    useStellarWallet();

  // Avoid SSR mismatch: render nothing until client-side mount.
  // useSyncExternalStore returns false on the server and true on the client,
  // which is both hydration-safe and avoids react-hooks/set-state-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return null;

  // ── Checking / loading state ───────────────────────────────────────────────
  if (isChecking) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: variant === "compact" ? "0.375rem 0.625rem" : "0.5rem 0.875rem",
          borderRadius: "9999px",
          background: "rgba(61,169,252,0.06)",
          border: "1px solid rgba(61,169,252,0.15)",
          color: "var(--color-text-muted)",
          fontSize: "0.75rem",
        }}
        aria-label="Checking wallet connection"
      >
        <Spinner />
        {variant === "full" && <span>Connecting…</span>}
      </div>
    );
  }

  // ── Connected state ────────────────────────────────────────────────────────
  if (isConnected && publicKey && truncatedAddress) {
    return (
      <ConnectedDropdown
        publicKey={publicKey}
        truncatedAddress={truncatedAddress}
        onDisconnect={disconnect}
        onRefresh={refreshBalance}
      />
    );
  }

  // ── Disconnected / idle state ──────────────────────────────────────────────

  // Freighter not installed → show "Install Freighter" button that opens freighter.app
  if (!freighterInstalled && error) {
    return (
      <a
        href="https://freighter.app"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Install Freighter wallet"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
          padding: variant === "compact" ? "0.375rem 0.625rem" : "0.5rem 0.875rem",
          borderRadius: "9999px",
          background: "transparent",
          border: "1px solid rgba(61,169,252,0.4)",
          color: "#3DA9FC",
          fontSize: "0.75rem",
          fontWeight: 700,
          fontFamily: "var(--font-space-grotesk)",
          cursor: "pointer",
          textDecoration: "none",
          transition: "background 150ms, border-color 150ms",
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background =
            "rgba(61,169,252,0.08)";
          (e.currentTarget as HTMLAnchorElement).style.borderColor =
            "rgba(61,169,252,0.7)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
          (e.currentTarget as HTMLAnchorElement).style.borderColor =
            "rgba(61,169,252,0.4)";
        }}
      >
        <WalletIcon size={14} />
        {variant === "compact" ? "Install" : "Install Freighter"}
        {/* External link icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={10}
          height={10}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    );
  }

  // Freighter installed (or not yet checked) → show Connect Wallet button
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <button
        onClick={connect}
        aria-label="Connect Freighter wallet"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
          padding: variant === "compact" ? "0.375rem 0.625rem" : "0.5rem 0.875rem",
          borderRadius: "9999px",
          background: "linear-gradient(135deg, #3DA9FC, #5EE7FF)",
          border: "none",
          color: "#0B1E3D",
          fontSize: "0.75rem",
          fontWeight: 700,
          fontFamily: "var(--font-space-grotesk)",
          cursor: "pointer",
          transition: "opacity 150ms, box-shadow 150ms",
          letterSpacing: "0.01em",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "0.88";
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 0 16px rgba(61,169,252,0.5)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.opacity = "1";
          (e.currentTarget as HTMLButtonElement).style.boxShadow = "none";
        }}
      >
        <WalletIcon size={14} />
        {variant === "compact" ? "Connect" : "Connect Wallet"}
      </button>

      {/* Show non-install errors inline (e.g. user rejected) */}
      {error && freighterInstalled && (
        <p
          role="alert"
          style={{
            fontSize: "0.65rem",
            color: "var(--color-error)",
            lineHeight: 1.4,
            maxWidth: 200,
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

// CSS animation for spinner — injected once at module level
if (typeof document !== "undefined") {
  const id = "stellance-spin-keyframe";
  if (!document.getElementById(id)) {
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }
}
