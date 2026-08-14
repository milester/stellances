import Link from "next/link";
import Image from "next/image";
import FeatureCard from "./components/FeatureCard";

// ─── Stats Bar Data ───────────────────────────────────────────────────────────
const STATS = [
  { value: "0%", label: "Platform fee" },
  { value: "~5s", label: "Settlement time" },
  { value: "<$0.01", label: "Transaction cost" },
  { value: "100%", label: "Non-custodial escrow" },
];

// ─── How It Works Data ────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Post your work",
    body: "Clients post the job and agree on milestones with the freelancer. Both parties sign the contract terms on-chain.",
    icon: "📋",
  },
  {
    step: "02",
    title: "Funds go into escrow",
    body: "Client locks funds into the Soroban smart contract. The code holds the money — not Stellance, not anyone else.",
    icon: "🔒",
  },
  {
    step: "03",
    title: "Get paid instantly",
    body: "Milestone approved? Payment releases to the freelancer's Stellar wallet in ~5 seconds. No invoice. No wait.",
    icon: "⚡",
  },
];

// ─── Features Data ────────────────────────────────────────────────────────────
const FEATURES = [
  {
    title: "Trustless escrow",
    body: "Funds are held by a Soroban smart contract, not by Stellance. No platform can freeze, redirect, or touch your money.",
    accent: "#a78bfa",
  },
  {
    title: "Instant settlement",
    body: "Approvals trigger on-chain transfers in ~5 seconds. No bank cycles, no ACH delays, no invoice queues.",
    accent: "#38bdf8",
  },
  {
    title: "Cross-border by default",
    body: "Stellar's anchor network connects to local banking rails in 50+ countries. A client in Berlin, a freelancer in Lagos — same contract.",
    accent: "#34d399",
  },
  {
    title: "Milestone granularity",
    body: "Sub-cent fees mean you can split any project into as many milestones as the work demands — not as few as gas costs force.",
    accent: "#fb923c",
  },
];

export default function Home() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(160deg, #1e0a3c 0%, #0c1a3a 40%, #0c2a40 70%, #0c3050 100%)",
        color: "#C8D6E5",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
      }}
    >
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav style={{ borderBottom: "1px solid rgba(167,139,250,0.15)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 50, backgroundColor: "rgba(15,8,35,0.7)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Image src="/logo.png" alt="Stellance" width={28} height={28} style={{ borderRadius: "6px" }} />
            <span style={{ fontFamily: "var(--font-space-grotesk)", color: "#fff", fontWeight: 700, fontSize: "1.05rem", letterSpacing: "-0.01em" }}>
              Stellance
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-6 md:gap-8 text-sm" style={{ color: "#9ca3af" }}>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#features" className="hover:text-white transition-colors hidden md:inline">Features</a>
            <a
              href="https://github.com/stallance/stellances"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition-colors hidden md:inline"
            >
              ↗ GitHub
            </a>
            <Link href="/login" className="hover:text-white transition-colors">
              Sign in
            </Link>
            <Link
              href="/register"
              style={{
                display: "inline-flex", alignItems: "center",
                background: "linear-gradient(90deg, #7c3aed 0%, #0ea5e9 100%)",
                color: "#fff", fontWeight: 600,
                fontSize: "0.8rem", padding: "0.45rem 1rem", borderRadius: "6px",
                textDecoration: "none",
              }}
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-8 pt-16 sm:pt-24 lg:pt-32 pb-12 sm:pb-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center mb-10 sm:mb-14">
          <div>
            {/* Badge */}
            <p
              className="inline-flex items-center gap-2 text-sm mb-5 px-3 py-1 rounded-full"
              style={{
                background: "rgba(167,139,250,0.12)",
                border: "1px solid rgba(167,139,250,0.25)",
                color: "#c4b5fd",
                letterSpacing: "0.02em",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#a78bfa", display: "inline-block" }} />
              Stellar network · Instant settlement · Open source
            </p>

            {/* Headline */}
            <h1
              style={{
                fontFamily: "var(--font-space-grotesk)",
                fontSize: "clamp(2.2rem, 6vw, 4rem)",
                fontWeight: 700,
                lineHeight: 1.06,
                letterSpacing: "-0.03em",
                color: "#fff",
                marginBottom: "1rem",
              }}
            >
              Freelancers get paid<br />
              the moment work<br />
              <span
                style={{
                  backgroundImage: "linear-gradient(90deg, #a78bfa 0%, #38bdf8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                is approved.
              </span>
            </h1>

            {/* Tagline */}
            <p
              style={{
                fontFamily: "var(--font-space-grotesk)",
                fontSize: "1.05rem",
                fontWeight: 500,
                color: "#c4b5fd",
                marginBottom: "1rem",
                letterSpacing: "-0.01em",
              }}
            >
              Your work, your money, your terms.
            </p>

            <p style={{ fontSize: "clamp(0.95rem, 2vw, 1.05rem)", lineHeight: 1.7, color: "#94a3b8", maxWidth: "36rem" }}>
              On-chain escrow on Stellar holds funds until a milestone is approved — then releases them instantly. No invoice cycles, no platform float, no 20% cut.
            </p>

            {/* CTAs */}
            <div className="flex flex-row gap-3 mt-8 flex-wrap">
              <Link
                href="/register"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  background: "linear-gradient(90deg, #7c3aed 0%, #0ea5e9 100%)",
                  color: "#fff", fontWeight: 600,
                  fontSize: "0.875rem", padding: "0.75rem 1.5rem", borderRadius: "8px",
                  textDecoration: "none", whiteSpace: "nowrap",
                  boxShadow: "0 0 24px rgba(124,58,237,0.4)",
                }}
              >
                Get started free →
              </Link>
              <a
                href="https://github.com/stallance/stellances"
                target="_blank" rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  border: "1px solid rgba(167,139,250,0.3)", color: "#c4b5fd",
                  fontSize: "0.875rem", padding: "0.75rem 1.5rem", borderRadius: "8px",
                  textDecoration: "none", whiteSpace: "nowrap",
                  backgroundColor: "rgba(167,139,250,0.05)",
                }}
              >
                View on GitHub ↗
              </a>
            </div>
          </div>

          {/* Hero image */}
          <div className="hidden lg:block">
            <Image
              src="/free.jpeg"
              alt="Freelancer working"
              width={600}
              height={480}
              style={{
                width: "100%", height: "auto", borderRadius: "12px", objectFit: "cover",
                border: "1px solid rgba(167,139,250,0.2)",
                boxShadow: "0 0 60px rgba(124,58,237,0.15)",
              }}
              priority
            />
          </div>
        </div>

        {/* Mobile hero image */}
        <div className="block lg:hidden mb-8">
          <Image
            src="/free.jpeg"
            alt="Freelancer working"
            width={600}
            height={360}
            style={{
              width: "100%", height: "auto", borderRadius: "10px", objectFit: "cover",
              maxHeight: "260px", border: "1px solid rgba(167,139,250,0.2)",
            }}
          />
        </div>
      </section>

      {/* ── Stats Bar ───────────────────────────────────────────────────────── */}
      <section
        style={{
          borderTop: "1px solid rgba(167,139,250,0.15)",
          borderBottom: "1px solid rgba(167,139,250,0.15)",
          background: "rgba(255,255,255,0.03)",
          backdropFilter: "blur(4px)",
        }}
        className="py-8 sm:py-10"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8">
            {STATS.map((item, i) => (
              <div
                key={item.label}
                className={[
                  "text-center sm:text-left",
                  i < 3 ? "lg:border-r lg:border-r-[rgba(167,139,250,0.15)] lg:pr-8" : "",
                ].join(" ")}
              >
                <p
                  style={{
                    fontFamily: "var(--font-space-grotesk)",
                    fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                    fontWeight: 700,
                    lineHeight: 1,
                    marginBottom: "0.35rem",
                    backgroundImage: "linear-gradient(90deg, #a78bfa 0%, #38bdf8 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {item.value}
                </p>
                <p style={{ fontSize: "0.8rem", color: "#64748b", letterSpacing: "0.02em" }}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-16 sm:py-24" style={{ borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          {/* Section label */}
          <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "#a78bfa", marginBottom: "0.75rem" }}>
            How it works
          </p>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-12 sm:mb-16">
            <h2
              style={{
                fontFamily: "var(--font-space-grotesk)",
                fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)",
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
                maxWidth: "32rem",
              }}
            >
              Three steps.<br />One settlement.
            </h2>
            <p style={{ fontSize: "0.9rem", color: "#64748b", maxWidth: "24rem" }}>
              The whole flow runs on Stellar. No intermediary holds your money at any point.
            </p>
          </div>

          {/* Steps grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 relative">
            {/* Connector line — desktop only */}
            <div
              className="hidden md:block absolute top-10 left-[16.66%] right-[16.66%] h-px"
              style={{ background: "linear-gradient(90deg, rgba(167,139,250,0.3) 0%, rgba(56,189,248,0.3) 100%)" }}
            />

            {HOW_IT_WORKS.map((item, i) => (
              <div
                key={item.step}
                className={[
                  "flex flex-col",
                  "p-6 sm:p-8",
                  i < 2 ? "md:border-r md:border-r-[rgba(167,139,250,0.15)]" : "",
                  i > 0 ? "border-t border-t-[rgba(167,139,250,0.15)] md:border-t-0" : "",
                ].join(" ")}
              >
                {/* Step number bubble */}
                <div
                  style={{
                    width: "2.5rem", height: "2.5rem", borderRadius: "50%",
                    background: "linear-gradient(135deg, rgba(124,58,237,0.3) 0%, rgba(14,165,233,0.3) 100%)",
                    border: "1px solid rgba(167,139,250,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.65rem", fontWeight: 700, color: "#c4b5fd",
                    letterSpacing: "0.04em", marginBottom: "1.25rem", flexShrink: 0,
                    position: "relative", zIndex: 1,
                  }}
                >
                  {item.step}
                </div>

                <div style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>{item.icon}</div>

                <h3
                  style={{
                    fontFamily: "var(--font-space-grotesk)",
                    fontSize: "1.1rem", fontWeight: 600, color: "#f1f5f9",
                    marginBottom: "0.6rem", letterSpacing: "-0.01em",
                  }}
                >
                  {item.title}
                </h3>
                <p style={{ fontSize: "0.875rem", lineHeight: 1.7, color: "#64748b" }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-16 sm:py-24" style={{ borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "#a78bfa", marginBottom: "0.75rem" }}>
            Features
          </p>
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-12">
            <h2
              style={{
                fontFamily: "var(--font-space-grotesk)",
                fontSize: "clamp(1.8rem, 3.5vw, 2.75rem)",
                fontWeight: 700, color: "#fff",
                letterSpacing: "-0.03em", lineHeight: 1.15,
              }}
            >
              Built on Stellar.<br />
              <span
                style={{
                  backgroundImage: "linear-gradient(90deg, #a78bfa 0%, #38bdf8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Designed for freelancers.
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px" style={{ border: "1px solid rgba(167,139,250,0.15)", borderRadius: "12px", overflow: "hidden" }}>
            {FEATURES.map((feature) => (
              <FeatureCard
                key={feature.title}
                title={feature.title}
                body={feature.body}
                accent={feature.accent}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ──────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24" style={{ borderBottom: "1px solid rgba(167,139,250,0.15)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-8 text-center">
          <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "#a78bfa", marginBottom: "1rem" }}>
            Get started
          </p>
          <h2
            style={{
              fontFamily: "var(--font-space-grotesk)",
              fontSize: "clamp(1.6rem, 3.5vw, 2.5rem)",
              fontWeight: 700, color: "#fff",
              letterSpacing: "-0.03em", marginBottom: "1rem",
            }}
          >
            Start getting paid on-chain —<br className="hidden sm:inline" /> in under a minute.
          </h2>
          <p style={{ fontSize: "0.95rem", color: "#64748b", marginBottom: "2rem", maxWidth: "36rem", margin: "0 auto 2rem" }}>
            Create your account, connect your Stellar wallet, and post or accept your first job. No platform custody, no settlement delays.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                background: "linear-gradient(90deg, #7c3aed 0%, #0ea5e9 100%)",
                color: "#fff", fontWeight: 600,
                fontSize: "0.875rem", padding: "0.75rem 2rem", borderRadius: "8px",
                textDecoration: "none", whiteSpace: "nowrap",
                boxShadow: "0 0 24px rgba(124,58,237,0.4)",
              }}
            >
              Create free account →
            </Link>
            <Link
              href="/login"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                border: "1px solid rgba(167,139,250,0.3)", color: "#c4b5fd",
                fontSize: "0.875rem", padding: "0.75rem 2rem", borderRadius: "8px",
                textDecoration: "none", whiteSpace: "nowrap",
                backgroundColor: "rgba(167,139,250,0.05)",
              }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="px-4 sm:px-8 py-8" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
        <div className="max-w-7xl mx-auto">
          {/* Top row: logo + nav links */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6" style={{ borderBottom: "1px solid rgba(167,139,250,0.1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Image src="/logo.png" alt="Stellance" width={22} height={22} style={{ borderRadius: "5px" }} />
              <span style={{ fontFamily: "var(--font-space-grotesk)", color: "#e2e8f0", fontWeight: 700, fontSize: "0.95rem" }}>
                Stellance
              </span>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2" style={{ fontSize: "0.8rem" }}>
              <a href="#how-it-works" className="hover:text-white transition-colors" style={{ color: "#64748b" }}>How it works</a>
              <a href="#features" className="hover:text-white transition-colors" style={{ color: "#64748b" }}>Features</a>
              <Link href="/login" className="hover:text-white transition-colors" style={{ color: "#64748b" }}>Sign in</Link>
              <Link href="/register" className="hover:text-white transition-colors" style={{ color: "#64748b" }}>Sign up</Link>
              <a href="https://github.com/stallance/stellances" target="_blank" rel="noreferrer" className="hover:text-white transition-colors" style={{ color: "#64748b" }}>GitHub ↗</a>
              <a href="https://github.com/stallance/stellances/blob/main/CONTRIBUTING.md" target="_blank" rel="noreferrer" className="hover:text-white transition-colors" style={{ color: "#64748b" }}>Contributing</a>
              <a href="https://github.com/stallance/stellances/blob/main/docs/architecture.md" target="_blank" rel="noreferrer" className="hover:text-white transition-colors" style={{ color: "#64748b" }}>Docs</a>
              <a href="https://github.com/stallance/stellances/blob/main/LICENSE" target="_blank" rel="noreferrer" className="hover:text-white transition-colors" style={{ color: "#64748b" }}>License</a>
            </nav>
          </div>
          {/* Bottom row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-5" style={{ fontSize: "0.75rem", color: "#475569" }}>
            <span>© 2025 Stellance · MIT License</span>
            <span>Built on the Stellar network · Soroban smart contracts</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
