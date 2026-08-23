"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchMe,
  updateProfile,
  type UserProfile,
  UsersApiError,
} from "@/lib/api/users";
import { useWalletStore } from "@/lib/stores/walletStore";

// ─── Metadata ─────────────────────────────────────────────────────────────────
// (export from a separate server component if needed; kept here for simplicity)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleBadge(role: UserProfile["role"]) {
  const map: Record<UserProfile["role"], { label: string; color: string }> = {
    CLIENT: { label: "Client", color: "rgba(61,169,252,0.15)" },
    FREELANCER: { label: "Freelancer", color: "rgba(45,212,191,0.15)" },
    ADMIN: { label: "Admin", color: "rgba(251,191,36,0.15)" },
  };
  const { label, color } = map[role];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: color, color: "var(--color-text-primary)" }}
    >
      {label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function truncateKey(key: string) {
  return `${key.slice(0, 6)}…${key.slice(-6)}`;
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-6 flex flex-col gap-5"
      style={{
        background: "var(--color-slate-panel)",
        border: "1px solid var(--color-slate-border)",
      }}
    >
      <h2
        className="text-sm font-semibold uppercase tracking-wide"
        style={{ color: "var(--color-text-muted)" }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4">
      <span
        className="text-xs font-medium w-36 shrink-0"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </span>
      <div className="flex-1 text-sm" style={{ color: "var(--color-text-primary)" }}>
        {children}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="rounded-xl p-6 flex flex-col gap-4"
          style={{
            background: "var(--color-slate-panel)",
            border: "1px solid var(--color-slate-border)",
          }}
        >
          <div className="h-3 w-24 rounded" style={{ background: "var(--color-slate-border)" }} />
          <div className="h-4 w-48 rounded" style={{ background: "var(--color-slate-border)" }} />
          <div className="h-4 w-64 rounded" style={{ background: "var(--color-slate-border)" }} />
          <div className="h-4 w-40 rounded" style={{ background: "var(--color-slate-border)" }} />
        </div>
      ))}
    </div>
  );
}

// ─── Edit form ────────────────────────────────────────────────────────────────

interface EditFormProps {
  profile: UserProfile;
  walletPublicKey: string | null;
  onCancel: () => void;
  onSaved: (updated: UserProfile) => void;
}

function EditForm({ profile, walletPublicKey, onCancel, onSaved }: EditFormProps) {
  const [name, setName] = useState(profile.name);
  const [stellarKey, setStellarKey] = useState(profile.stellarPublicKey ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      updateProfile({
        name: name.trim() || undefined,
        stellarPublicKey: stellarKey.trim() || null,
      }),
    onSuccess: (updated) => {
      toast.success("Profile updated");
      onSaved(updated);
    },
    onError: (err) => {
      const msg =
        err instanceof UsersApiError
          ? err.message
          : "Failed to update profile";
      toast.error(msg);
    },
  });

  function handleImportWallet() {
    if (walletPublicKey) {
      setStellarKey(walletPublicKey);
      toast.success("Wallet address imported");
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="flex flex-col gap-5"
      aria-label="Edit profile"
    >
      {/* Name */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="profile-name"
          className="text-xs font-medium"
          style={{ color: "var(--color-text-muted)" }}
        >
          Display Name
        </label>
        <input
          id="profile-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          className="rounded-md border px-3 py-2 text-sm outline-none transition-colors duration-150"
          style={{
            background: "var(--color-navy-mid, #0d1b2a)",
            borderColor: "var(--color-slate-border)",
            color: "var(--color-text-primary)",
          }}
          onFocus={(e) =>
            (e.currentTarget.style.borderColor = "var(--color-accent)")
          }
          onBlur={(e) =>
            (e.currentTarget.style.borderColor = "var(--color-slate-border)")
          }
        />
      </div>

      {/* Stellar public key */}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="profile-stellar-key"
          className="text-xs font-medium"
          style={{ color: "var(--color-text-muted)" }}
        >
          Stellar Public Key
        </label>
        <div className="flex gap-2">
          <input
            id="profile-stellar-key"
            type="text"
            value={stellarKey}
            onChange={(e) => setStellarKey(e.target.value)}
            placeholder="GABC…"
            maxLength={56}
            pattern="G[A-Z2-7]{55}"
            title="Must be a valid Stellar public key starting with G"
            className="flex-1 rounded-md border px-3 py-2 text-sm font-mono outline-none transition-colors duration-150"
            style={{
              background: "var(--color-navy-mid, #0d1b2a)",
              borderColor: "var(--color-slate-border)",
              color: "var(--color-text-primary)",
            }}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--color-accent)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor =
                "var(--color-slate-border)")
            }
          />
          {walletPublicKey && walletPublicKey !== stellarKey && (
            <button
              type="button"
              onClick={handleImportWallet}
              className="shrink-0 rounded-md border px-3 py-2 text-xs font-medium transition-colors duration-150 hover:border-accent hover:text-accent"
              style={{
                borderColor: "var(--color-slate-border)",
                color: "var(--color-text-muted)",
              }}
              title="Import connected Freighter wallet address"
            >
              Import wallet
            </button>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          Required for Freighter signing — must be the G-address of your Stellar
          account.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md px-4 py-2 text-sm font-semibold text-white transition-opacity duration-150 disabled:opacity-50"
          style={{ background: "var(--color-accent)" }}
        >
          {mutation.isPending ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={mutation.isPending}
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors duration-150 hover:border-accent hover:text-accent disabled:opacity-50"
          style={{
            borderColor: "var(--color-slate-border)",
            color: "var(--color-text-muted)",
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const qc = useQueryClient();
  const walletPublicKey = useWalletStore((s) => s.publicKey);
  const [editing, setEditing] = useState(false);

  const { data: profile, isLoading, isError, error } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 60_000,
  });

  function handleSaved(updated: UserProfile) {
    qc.setQueryData(["me"], updated);
    setEditing(false);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            Profile
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Manage your account and Stellar wallet connection.
          </p>
        </div>

        {!editing && profile && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border px-4 py-2 text-sm font-medium transition-colors duration-150 hover:border-accent hover:text-accent shrink-0"
            style={{
              borderColor: "var(--color-slate-border)",
              color: "var(--color-text-muted)",
            }}
          >
            Edit profile
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && <ProfileSkeleton />}

      {/* Error */}
      {isError && (
        <div
          className="rounded-xl p-6 text-sm"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "var(--color-text-primary)",
          }}
          role="alert"
        >
          {error instanceof UsersApiError
            ? error.message
            : "Failed to load profile. Please refresh."}
        </div>
      )}

      {/* Profile content */}
      {profile && !isLoading && (
        <div className="flex flex-col gap-6">
          {/* Account info */}
          <SectionCard title="Account">
            {editing ? (
              <EditForm
                profile={profile}
                walletPublicKey={walletPublicKey}
                onCancel={() => setEditing(false)}
                onSaved={handleSaved}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <FieldRow label="Display name">
                  <span className="font-medium">{profile.name}</span>
                </FieldRow>
                <FieldRow label="Email">
                  <span>{profile.email}</span>
                </FieldRow>
                <FieldRow label="Role">
                  {roleBadge(profile.role)}
                </FieldRow>
                <FieldRow label="Member since">
                  <span>{formatDate(profile.createdAt)}</span>
                </FieldRow>
              </div>
            )}
          </SectionCard>

          {/* Stellar wallet */}
          {!editing && (
            <SectionCard title="Stellar Wallet">
              <div className="flex flex-col gap-4">
                <FieldRow label="Saved address">
                  {profile.stellarPublicKey ? (
                    <span className="font-mono text-xs break-all" title={profile.stellarPublicKey}>
                      {truncateKey(profile.stellarPublicKey)}
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>
                      Not set — connect Freighter and edit your profile to save
                      your address.
                    </span>
                  )}
                </FieldRow>
                <FieldRow label="Connected wallet">
                  {walletPublicKey ? (
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: "#22c55e" }}
                        aria-hidden
                      />
                      <span className="font-mono text-xs break-all" title={walletPublicKey}>
                        {truncateKey(walletPublicKey)}
                      </span>
                      {walletPublicKey !== profile.stellarPublicKey && (
                        <span
                          className="text-xs ml-1"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          (not saved — edit profile to sync)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: "var(--color-text-muted)" }}>
                      No wallet connected
                    </span>
                  )}
                </FieldRow>
              </div>

              {/* Mismatch warning */}
              {walletPublicKey &&
                profile.stellarPublicKey &&
                walletPublicKey !== profile.stellarPublicKey && (
                  <div
                    className="mt-1 rounded-lg px-4 py-3 text-sm flex items-start gap-3"
                    style={{
                      background: "rgba(251,191,36,0.08)",
                      border: "1px solid rgba(251,191,36,0.25)",
                      color: "var(--color-text-primary)",
                    }}
                    role="alert"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="mt-0.5 shrink-0"
                      style={{ color: "rgba(251,191,36,0.9)" }}
                      aria-hidden
                    >
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>
                      Your connected Freighter wallet doesn&apos;t match the
                      saved address. Edit your profile to update it.
                    </span>
                  </div>
                )}
            </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}
