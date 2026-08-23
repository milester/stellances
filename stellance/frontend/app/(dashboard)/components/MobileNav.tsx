"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { PostJobButton } from "./PostJobButton";
import { WalletConnect } from "@/components/wallet/WalletConnect";

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    href: "/jobs",
    label: "Browse Jobs",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      </svg>
    ),
  },
  {
    href: "/contracts",
    label: "My Contracts",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: "/payments",
    label: "Payments",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
        fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function HamburgerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus drawer when opened
  useEffect(() => {
    if (open) drawerRef.current?.focus();
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(11,30,61,0.75)",
          backdropFilter: "blur(3px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 240ms ease",
        }}
      />

      {/* Panel */}
      <div
        ref={drawerRef}
        id="mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        tabIndex={-1}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: "min(82vw, 288px)",
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
          background: "var(--color-slate-panel)",
          borderRight: "1px solid var(--color-slate-border)",
          boxShadow: "8px 0 40px rgba(0,0,0,0.5)",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 260ms cubic-bezier(0.4,0,0.2,1)",
          outline: "none",
        }}
      >
        {/* Header row */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1rem",
          height: 56,
          flexShrink: 0,
          borderBottom: "1px solid var(--color-slate-border)",
        }}>
          <Link href="/" onClick={onClose}
            style={{ display: "flex", alignItems: "center", gap: "0.625rem", textDecoration: "none" }}>
            <Image src="/logo.png" alt="Stellance" width={26} height={26} style={{ borderRadius: "6px" }} />
            <span style={{
              fontFamily: "var(--font-space-grotesk)",
              fontWeight: 600,
              color: "#fff",
              fontSize: "1rem",
            }}>
              Stellance
            </span>
          </Link>

          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-slate-border)",
              background: "transparent",
              color: "var(--color-text-muted)",
              cursor: "pointer",
            }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Nav links */}
        <nav aria-label="Main navigation"
          style={{ flex: 1, padding: "0.75rem", overflowY: "auto" }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.9375rem",
                  fontWeight: 500,
                  color: isActive ? "#fff" : "var(--color-text-muted)",
                  background: isActive ? "rgba(61,169,252,0.1)" : "transparent",
                  textDecoration: "none",
                  marginBottom: "2px",
                  borderLeft: isActive ? "2px solid var(--color-accent)" : "2px solid transparent",
                }}
              >
                <span style={{ flexShrink: 0, color: isActive ? "var(--color-accent)" : "inherit" }}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}

          <div style={{ paddingTop: "0.5rem" }}>
            <PostJobButton />
          </div>
        </nav>

        {/* Wallet footer */}
        <div style={{
          padding: "1rem",
          flexShrink: 0,
          borderTop: "1px solid var(--color-slate-border)",
        }}>
          <WalletConnect variant="full" />
        </div>
      </div>
    </>
  );
}

// ─── MobileNav (top bar + drawer) ─────────────────────────────────────────────

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/*
        Top bar: visible on mobile (flex), hidden on md+ (md:hidden).
        Do NOT put display in the inline style — Tailwind controls it.
      */}
      <header
        className="flex md:hidden items-center justify-between shrink-0"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          padding: "0 1rem",
          height: "56px",
          background: "var(--color-slate-panel)",
          borderBottom: "1px solid var(--color-slate-border)",
        }}
      >
        {/* Logo */}
        <Link href="/"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", textDecoration: "none" }}>
          <Image src="/logo.png" alt="Stellance" width={24} height={24} style={{ borderRadius: "5px" }} />
          <span style={{
            fontFamily: "var(--font-space-grotesk)",
            fontWeight: 600,
            color: "#fff",
            fontSize: "0.9375rem",
          }}>
            Stellance
          </span>
        </Link>

        {/* Hamburger */}
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          aria-controls="mobile-drawer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 42,
            height: 42,
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--color-slate-border)",
            background: "rgba(61,169,252,0.06)",
            color: "var(--color-text-primary)",
            cursor: "pointer",
          }}
        >
          <HamburgerIcon />
        </button>
      </header>

      <Drawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
