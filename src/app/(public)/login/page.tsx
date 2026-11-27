import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { links } from "@/lib/links";
import { safeAppPath } from "@/lib/safe-path";

export const metadata: Metadata = { title: "Sign in — Empowr Members" };

// "Sign in with Empowr Dashboard" (lib/sso.ts) is for staff, so it shows only
// when someone is on their way to the admin or door-team area, or coming back
// from a Dashboard sign-in. Members never see it.
const SSO_MESSAGES: Record<string, string> = {
  expired: "That sign-in took too long. Please try again.",
  failed: "Signing in with Empowr Dashboard didn't work. Please try again, or use the email code below.",
  not_staff: "Your Dashboard account isn't on the Members staff list. Ask an administrator to add you.",
  no_account: "You need a Members account first. Sign in once with the email code below, then use the Dashboard button.",
  ended: "Your 12-hour Dashboard sign-in has ended. Please sign in again.",
};
const isStaffPath = (path: string) =>
  path === "/admin" || path.startsWith("/admin/") || path === "/checkin" || path.startsWith("/checkin/");

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; sso?: string }>;
}) {
  const params = await searchParams;
  const next = safeAppPath(params.next) ?? "/account";
  const ssoMessage = params.sso ? SSO_MESSAGES[params.sso] : undefined;
  const showSso = isStaffPath(next) || ssoMessage !== undefined;

  return (
    <AuthShell
      title="Sign in"
      subtitle="Welcome back — book sessions and manage your household."
      footer={
        <>
          New to Empowr?{" "}
          <Link
            href={next === "/account" ? "/signup" : `/signup?next=${encodeURIComponent(next)}`}
            className="text-blue hover:text-blue-dark">
            Create an account
          </Link>
          {/* The footer is suppressed on /login (Footer.tsx FOOTERLESS_ROUTES),
              and with it the page's only privacy link. This page collects an
              email, so UK GDPR Art. 13 wants the link here. Do not remove. */}
          <span className="mt-3 block text-xs font-normal leading-relaxed">
            Read our{" "}
            <a href={links.termsAndConditions} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue underline hover:text-blue-dark">
              Terms &amp; Conditions
            </a>{" "}
            and{" "}
            <a href={links.privacyPolicy} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue underline hover:text-blue-dark">
              Privacy Policy
            </a>
            .
          </span>
        </>
      }
    >
      {showSso && (
        <div className="mb-6 rounded-lg border border-line p-4">
          {ssoMessage && (
            <p role="status" className="mb-3 text-sm font-semibold text-black">
              {ssoMessage}
            </p>
          )}
          <p className="text-sm text-muted">Empowr staff</p>
          {/* A plain link: the route redirects to the Dashboard, so no client code is needed. */}
          <a
            href="/api/auth/sso/start"
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-blue px-4 py-2 font-bold text-white hover:bg-blue-dark">
            Sign in with Empowr Dashboard
          </a>
        </div>
      )}
      <LoginForm next={next} initialError={params.error} />
    </AuthShell>
  );
}
