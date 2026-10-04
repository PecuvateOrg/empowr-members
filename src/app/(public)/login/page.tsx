import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { links } from "@/lib/links";

export const metadata: Metadata = { title: "Sign in — Empowr Members" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/account";

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
      <LoginForm next={next} initialError={params.error} />
    </AuthShell>
  );
}
