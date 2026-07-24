import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  PostJobButton,
  PostJobButtonCompact,
} from "./components/PostJobButton";
import { WalletConnect } from "@/components/wallet/WalletConnect";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s | Stellance",
  },
};

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    href: "/jobs",
    label: "Browse Jobs",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      </svg>
    ),
  },
  {
    href: "/dashboard/contracts",
    label: "My Contracts",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: "/dashboard/payments",
    label: "Payments",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
  },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar() {
  return (
    <aside
      className="hidden md:flex flex-col w-56 shrink-0"
      style={{
        background: "var(--color-slate-panel)",
        borderRight: "1px solid var(--color-slate-border)",
        minHeight: "100dvh",
      }}
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-5 h-14 shrink-0"
        style={{ borderBottom: "1px solid var(--color-slate-border)" }}
      >
        <Image
          src="/logo.png"
          alt="Stellance"
          width={26}
          height={26}
          style={{ borderRadius: "6px" }}
        />
        <span
          className="font-semibold text-white tracking-tight"
          style={{ fontFamily: "var(--font-space-grotesk)", fontSize: "1rem" }}
        >
          Stellance
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-text-muted hover:text-white hover:bg-white/5 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-slate-panel"
          >
            <span className="shrink-0">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        {/* CLIENT-only: Post a Job CTA */}
        <div className="pt-2">
          <PostJobButton />
        </div>
      </nav>

      {/* Footer: wallet connect */}
      <div
        className="px-4 py-4 shrink-0"
        style={{ borderTop: "1px solid var(--color-slate-border)" }}
      >
        <WalletConnect variant="full" />
      </div>
    </aside>
  );
}

// ─── Mobile top bar ───────────────────────────────────────────────────────────

function TopBar() {
  return (
    <header
      className="md:hidden flex items-center justify-between px-4 h-14 shrink-0"
      style={{
        background: "var(--color-slate-panel)",
        borderBottom: "1px solid var(--color-slate-border)",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <Link href="/" className="flex items-center gap-2">
        <Image src="/logo.png" alt="Stellance" width={24} height={24} style={{ borderRadius: "5px" }} />
        <span
          className="font-semibold text-white text-sm"
          style={{ fontFamily: "var(--font-space-grotesk)" }}
        >
          Stellance
        </span>
      </Link>

      {/* Mobile nav — simple horizontal scroll row */}
      <nav className="flex items-center gap-1" aria-label="Mobile navigation">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-text-muted hover:text-white hover:bg-white/5 transition-colors"
            aria-label={item.label}
          >
            {item.icon}
            <span className="hidden sm:inline">{item.label}</span>
          </Link>
        ))}
        {/* CLIENT-only: Post a Job CTA */}
        <PostJobButtonCompact />
        {/* Wallet connect (compact pill for mobile) */}
        <WalletConnect variant="compact" />
      </nav>
    </header>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-navy">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
