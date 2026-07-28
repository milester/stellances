/**
 * /dashboard — index route
 *
 * Redirects to /dashboard/jobs so that navigating to the bare /dashboard path
 * (e.g. after login or from a bookmark) always lands on a functional page
 * instead of returning a 404.
 *
 * Uses a Next.js permanent redirect so the browser updates its address bar
 * and caches the redirect for subsequent direct visits.
 */

import { redirect } from "next/navigation";

export default function DashboardIndexPage() {
  redirect("/dashboard/jobs");
}
