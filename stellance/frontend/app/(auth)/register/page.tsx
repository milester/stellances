import { Suspense } from "react";
import type { Metadata } from "next";
import { RegisterForm } from "./RegisterForm";

// ─── Metadata ─────────────────────────────────────────────────────────────────
// The auth layout sets template: "%s | Stellance", so the browser title
// becomes "Create Account | Stellance".

export const metadata: Metadata = {
  title: "Create Account",
  description:
    "Sign up for Stellance and choose your role — freelancer or client — to start using instant on-chain escrow payments.",
};

// ─── Page ─────────────────────────────────────────────────────────────────────
// RegisterForm calls useSearchParams() to read ?next, so it must be wrapped
// in a Suspense boundary to allow static prerendering of the page shell.

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
