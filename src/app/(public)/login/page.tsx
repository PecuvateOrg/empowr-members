import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

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
        </>
      }
    >
      <LoginForm next={next} initialError={params.error} />
    </AuthShell>
  );
}
