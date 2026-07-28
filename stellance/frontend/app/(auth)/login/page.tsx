import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

// ─── Metadata ─────────────────────────────────────────────────────────────────
// Auth layout sets template: "%s | Stellance" → "Sign In | Stellance".

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your Stellance account.",
};

// ─── Page ─────────────────────────────────────────────────────────────────────
// LoginForm calls useSearchParams() to read ?next, so it must be wrapped in
// a Suspense boundary to allow static prerendering of the page shell.

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
