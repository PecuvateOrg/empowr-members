import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Create an account — Empowr Members" };

export default function SignupPage() {
  return (
    <AuthShell
      title="Create an account"
      subtitle="Create your account, then add everyone who will skate — including yourself."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-blue hover:text-blue-dark">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
