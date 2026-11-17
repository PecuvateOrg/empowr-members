// Admin allowlist guard — middleware only checks for a session on /admin
// (edge runtime, no DB access); the ADMIN_EMAILS check happens here per
// Pattern 3 (_config/guides/auth-middleware.md).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { AdminShell } from "@/components/admin/AdminShell";
import { InstallPrompt } from "@/components/messaging/InstallPrompt";
import type { Metadata } from "next";
import { PasskeyNudge } from "@/components/account/PasskeyNudge";
import { passkeysEnabled } from "@/lib/auth-providers";

// Staff install the admin area as its own app, "Empowr Admin" (2026-11-02): a separate manifest
// with its own id, so it sits beside the member app instead of replacing it, and opens on /admin.
// scope stays "/" so tapping through to a member page does not throw the app into a browser tab.
export const metadata: Metadata = {
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Empowr Admin" },
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminEmail(user.email)) redirect("/account");

  return (
    <AdminShell>
      {/* Staff sign in with an emailed code since 2026-11-17; a passkey makes it one tap. */}
      {passkeysEnabled && (
        <div className="mb-6">
          <PasskeyNudge />
        </div>
      )}
      {children}
      <InstallPrompt variant="admin" />
    </AdminShell>
  );
}
