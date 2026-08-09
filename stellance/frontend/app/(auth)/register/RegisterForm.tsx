"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  registerUser,
  extractErrorMessage,
  type UserRole,
} from "@/lib/api/auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate a ?next redirect target.
 * Only accepts same-origin relative paths (starts with "/" but not "//").
 * Rejects anything that looks like an absolute URL to prevent open-redirect.
 */
function safeNextUrl(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("://")) {
    return raw;
  }
  return fallback;
}

// ─── Validation schema ────────────────────────────────────────────────────────

const registerSchema = z
  .object({
    role: z.enum(["FREELANCER", "CLIENT"], {
      required_error: "Please select a role to continue.",
    }),
    name: z
      .string()
      .min(1, "Full name is required.")
      .max(100, "Name must be 100 characters or fewer."),
    email: z
      .string()
      .min(1, "Email is required.")
      .email("Please enter a valid email address."),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters.")
      .max(128, "Password must be 128 characters or fewer."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

// ─── Small primitives ─────────────────────────────────────────────────────────

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-error">
      {message}
    </p>
  );
}

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
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
      aria-hidden={true}
    >
      <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
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
      aria-hidden={true}
    >
      <path d="M17.94 17.94A10.07 10.07 0 0112 20C7 20 2.73 16.11 1 12a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c5 0 9.27 3.89 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// ─── Role option card ─────────────────────────────────────────────────────────

interface RoleCardProps {
  value: UserRole;
  selected: boolean;
  onSelect: (role: UserRole) => void;
  label: string;
  description: string;
  icon: React.ReactNode;
}

function RoleCard({
  value,
  selected,
  onSelect,
  label,
  description,
  icon,
}: RoleCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => onSelect(value)}
      className={[
        "flex flex-1 flex-col items-start gap-2 rounded-md border p-4 text-left transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-panel",
        selected
          ? "border-accent bg-accent/10 shadow-[0_0_0_1px_theme(colors.accent)]"
          : "border-slate-border bg-navy hover:border-accent/50",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-9 w-9 items-center justify-center rounded-md",
          selected
            ? "bg-accent/20 text-accent"
            : "bg-slate-border/50 text-text-muted",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="text-sm font-semibold text-white">{label}</span>
      <span className="text-xs text-text-muted leading-relaxed">
        {description}
      </span>
      <span className="sr-only">{selected ? "Selected" : "Not selected"}</span>
    </button>
  );
}

// ─── Register form ────────────────────────────────────────────────────────────

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: undefined,
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const selectedRole = watch("role");

  function handleRoleSelect(role: UserRole) {
    setValue("role", role, { shouldValidate: true });
  }

  async function onSubmit(values: RegisterFormValues) {
    setServerError(null);

    try {
      const data = await registerUser({
        name: values.name,
        email: values.email,
        password: values.password,
        role: values.role as UserRole,
      });

      // Persist access token; refresh_token is set as httpOnly cookie by the backend.
      sessionStorage.setItem("access_token", data.access_token);

      toast.success("Account created! Let's set up your wallet.");

      // Respect ?next param so the auth guard can send users back where they intended.
      const destination = safeNextUrl(
        searchParams.get("next"),
        "/jobs"
      );
      router.push(destination);
    } catch (err) {
      // AuthApiError: the backend returns a descriptive message directly (e.g.
      // "Email already exists" for 409, or field-level messages for 400s).
      // extractErrorMessage surfaces those as-is; the fallback only fires for
      // non-API errors such as network failures.
      const message = extractErrorMessage(
        err,
        "Something went wrong. Please try again."
      );
      setServerError(message);
    }
  }

  return (
    <div className="card-surface glow-accent p-8 sm:p-10">
      {/* Heading */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Join Stellance — secure freelance payments on Stellar.
        </p>
      </div>

      {/* Server-level error banner */}
      {serverError && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm text-error"
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
            aria-hidden={true}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {serverError}
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-5"
        aria-label="Registration form"
      >
        {/* ── Role selector ────────────────────────────────────────────────── */}
        <fieldset>
          <legend className="mb-2 block text-sm font-medium text-text-primary">
            I want to…
          </legend>

          <div role="radiogroup" aria-label="Account role" className="flex gap-3">
            <RoleCard
              value="FREELANCER"
              selected={selectedRole === "FREELANCER"}
              onSelect={handleRoleSelect}
              label="Work as a freelancer"
              description="Offer services, receive milestone payments, and get paid on-chain."
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden={true}
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
                  <line x1="12" y1="12" x2="12" y2="12" />
                  <path d="M2 12h20" />
                </svg>
              }
            />
            <RoleCard
              value="CLIENT"
              selected={selectedRole === "CLIENT"}
              onSelect={handleRoleSelect}
              label="Hire a freelancer"
              description="Post jobs, fund escrow, and release payments when work is approved."
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden={true}
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              }
            />
          </div>
          {errors.role && (
            <p role="alert" className="mt-1.5 text-xs text-error">
              {errors.role.message}
            </p>
          )}
        </fieldset>

        {/* ── Full name ────────────────────────────────────────────────────── */}
        <div>
          <label
            htmlFor="name"
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            Full name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            autoFocus
            placeholder="Alice Smith"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? "name-error" : undefined}
            className={[
              "w-full rounded-md border bg-navy px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60",
              "transition-colors duration-150 outline-none",
              "focus:border-accent focus:ring-1 focus:ring-accent",
              errors.name
                ? "border-error focus:border-error focus:ring-error"
                : "border-slate-border",
            ].join(" ")}
            {...register("name")}
          />
          <FieldError id="name-error" message={errors.name?.message} />
        </div>

        {/* ── Email ────────────────────────────────────────────────────────── */}
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            className={[
              "w-full rounded-md border bg-navy px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-muted/60",
              "transition-colors duration-150 outline-none",
              "focus:border-accent focus:ring-1 focus:ring-accent",
              errors.email
                ? "border-error focus:border-error focus:ring-error"
                : "border-slate-border",
            ].join(" ")}
            {...register("email")}
          />
          <FieldError id="email-error" message={errors.email?.message} />
        </div>

        {/* ── Password ─────────────────────────────────────────────────────── */}
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={!!errors.password}
              aria-describedby={
                errors.password ? "password-error" : "password-hint"
              }
              className={[
                "w-full rounded-md border bg-navy px-3.5 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted/60",
                "transition-colors duration-150 outline-none",
                "focus:border-accent focus:ring-1 focus:ring-accent",
                errors.password
                  ? "border-error focus:border-error focus:ring-error"
                  : "border-slate-border",
              ].join(" ")}
              {...register("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <EyeIcon visible={showPassword} />
            </button>
          </div>
          {errors.password ? (
            <FieldError
              id="password-error"
              message={errors.password.message}
            />
          ) : (
            <p id="password-hint" className="mt-1 text-xs text-text-muted">
              Minimum 6 characters.
            </p>
          )}
        </div>

        {/* ── Confirm password ─────────────────────────────────────────────── */}
        <div>
          <label
            htmlFor="confirmPassword"
            className="mb-1.5 block text-sm font-medium text-text-primary"
          >
            Confirm password
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={
                errors.confirmPassword ? "confirm-error" : undefined
              }
              className={[
                "w-full rounded-md border bg-navy px-3.5 py-2.5 pr-10 text-sm text-text-primary placeholder:text-text-muted/60",
                "transition-colors duration-150 outline-none",
                "focus:border-accent focus:ring-1 focus:ring-accent",
                errors.confirmPassword
                  ? "border-error focus:border-error focus:ring-error"
                  : "border-slate-border",
              ].join(" ")}
              {...register("confirmPassword")}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              <EyeIcon visible={showConfirm} />
            </button>
          </div>
          <FieldError
            id="confirm-error"
            message={errors.confirmPassword?.message}
          />
        </div>

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={[
            "mt-2 w-full rounded-md px-4 py-2.5 text-sm font-semibold text-white",
            "bg-accent hover:bg-accent-hover active:scale-[0.98]",
            "transition-all duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-panel",
            "disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100",
          ].join(" ")}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden={true}
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Creating account…
            </span>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      {/* Login link */}
      <p className="mt-6 text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-accent hover:text-accent-bright transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
