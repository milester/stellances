"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { loginUser, AuthApiError, extractErrorMessage } from "@/lib/api/auth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate a ?next redirect target.
 * Only accepts same-origin relative paths (starts with "/" but not "//").
 * Rejects anything that looks like an absolute URL to prevent open-redirect.
 */
function safeNextUrl(raw: string | null, fallback: string): string {
  if (!raw) return fallback;
  // Must start with "/" but not "//" (protocol-relative) and must not contain "://"
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("://")) {
    return raw;
  }
  return fallback;
}

// ─── Validation schema ────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Please enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// ─── Small primitives ─────────────────────────────────────────────────────────

/** Inline field-level validation error with a stable id for aria-describedby. */
function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-error">
      {message}
    </p>
  );
}

/**
 * Eye toggle icon.
 * `visible={true}` → eye-open (password is readable)
 * `visible={false}` → eye-off (password is hidden)
 */
function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    // Eye-open: password is currently visible
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
    // Eye-off: password is currently hidden
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

// ─── Login form ───────────────────────────────────────────────────────────────

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);

    try {
      const data = await loginUser(values);

      // Persist the access token for subsequent API calls.
      // The refresh_token is handled server-side as an httpOnly cookie.
      sessionStorage.setItem("access_token", data.access_token);

      toast.success(
        `Welcome back${data.user.email ? `, ${data.user.email}` : ""}!`
      );

      // Respect ?next param so users land where they intended after auth guard redirect.
      const destination = safeNextUrl(
        searchParams.get("next"),
        "/jobs"
      );
      router.push(destination);
    } catch (err) {
      // 401 from LocalAuthGuard = wrong credentials. The backend returns a
      // generic message for 401/403; override with a user-friendly string.
      // extractErrorMessage returns the API body as-is for other error codes.
      const isCredentialError =
        err instanceof AuthApiError &&
        (err.status === 401 || err.status === 403);

      const message = extractErrorMessage(
        err,
        isCredentialError
          ? "Invalid email or password."
          : "Something went wrong. Please try again."
      );

      setServerError(message);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="card-surface glow-accent p-8 sm:p-10">
      {/* Heading */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Sign in to Stellance
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Enter your email and password to continue.
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

      {/* Form */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="space-y-5"
        aria-label="Login form"
      >
        {/* Email */}
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
            autoFocus
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

        {/* Password */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="password"
              className="text-sm font-medium text-text-primary"
            >
              Password
            </label>
            {/* Placeholder — link to forgot-password when that page exists */}
            <span className="text-xs text-text-muted cursor-not-allowed select-none">
              Forgot password?
            </span>
          </div>

          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
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
              {/* visible=showPassword: eye-open when password is readable */}
              <EyeIcon visible={showPassword} />
            </button>
          </div>
          <FieldError id="password-error" message={errors.password?.message} />
        </div>

        {/* Submit */}
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
              Signing in…
            </span>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      {/* Register link */}
      <p className="mt-6 text-center text-sm text-text-muted">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-accent hover:text-accent-bright transition-colors"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
