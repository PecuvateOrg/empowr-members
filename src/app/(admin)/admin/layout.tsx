// Admin allowlist guard — middleware only checks for a session on /admin
// (edge runtime, no DB access); the ADMIN_EMAILS check happens here per
// Pattern 3 (_config/guides/auth-middleware.md).
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { AdminHeader } from "@/components/AdminHeader";

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
    <div className="flex flex-1 flex-col bg-cream">
      <AdminHeader />
      {children}
    </div>
  );
}
