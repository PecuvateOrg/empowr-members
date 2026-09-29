import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Create an account — Empowr Members" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  // Where the confirmation link lands. Carried from /login so a visitor who
  // chose a private booking before creating an account comes back to it.
  const { next } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <AuthShell
      title="Create an account"
      subtitle="Create your account, then add everyone who will skate — including yourself."
      footer={
        <>
          Already have an account?{" "}
          <Link href={safe ? `/login?next=${encodeURIComponent(safe)}` : "/login"} className="text-blue hover:text-blue-dark">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm next={safe} />
    </AuthShell>
  );
}
