// "Allow access?" page for staff AI tools (planning/spec/agent-access.md). Supabase's OAuth 2.1 server
// sends the person here with an authorization_id; middleware has already made them sign in. Only
// staff can approve: anyone else is told so and the request is denied, so no token is ever issued to
// an account that /api/mcp would refuse anyway.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Button, FormNotice } from "@/components/ui/form";
import { isAdminEmail, isCheckinEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Allow access — Empowr Members" };
export const dynamic = "force-dynamic";

async function decide(formData: FormData) {
  "use server";
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const approve = formData.get("decision") === "approve";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const allowed = approve && isCheckinEmail(user?.email);
  const { data, error } = allowed
    ? await supabase.auth.oauth.approveAuthorization(authorizationId)
    : await supabase.auth.oauth.denyAuthorization(authorizationId);
  if (error || !data) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&failed=1`);
  redirect(data.redirect_url);
}

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; failed?: string }>;
}) {
  const { authorization_id: authorizationId, failed } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const shell = (body: React.ReactNode) => (
    <AuthShell title="Allow access?" subtitle="Connect an AI tool to Empowr Members." footer={null}>
      {body}
    </AuthShell>
  );

  if (!authorizationId) return shell(<FormNotice tone="error">This link is missing its request. Start again from your AI tool.</FormNotice>);

  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !details) {
    return shell(<FormNotice tone="error">This request has expired or was already used. Start again from your AI tool.</FormNotice>);
  }
  // Already approved before: Supabase hands back the redirect straight away.
  if (!("authorization_id" in details)) redirect(details.redirect_url);

  const role = isAdminEmail(user?.email) ? "administrator" : isCheckinEmail(user?.email) ? "coach" : null;

  return shell(
    <form action={decide} className="space-y-5">
      <input type="hidden" name="authorization_id" value={authorizationId} />
      {failed && <FormNotice tone="error">That did not go through. Please try again.</FormNotice>}
      {role ? (
        <>
          <p className="text-sm leading-relaxed text-black">
            <strong>{details.client.name || "An AI tool"}</strong> wants to use Empowr Members as you ({user?.email}),
            with the same access you have as a {role}. Everything it does is recorded under your name.
          </p>
          <p className="text-sm leading-relaxed text-black">
            You can disconnect it at any time from your AI tool&apos;s settings.
          </p>
          <div className="flex gap-3">
            <Button type="submit" name="decision" value="approve">Allow</Button>
            <Button type="submit" name="decision" value="deny" variant="secondary">Cancel</Button>
          </div>
        </>
      ) : (
        <>
          <FormNotice tone="error">
            AI access is for Empowr staff only, and {user?.email ?? "this account"} is not on the staff list.
          </FormNotice>
          <Button type="submit" name="decision" value="deny" variant="secondary">Back to my AI tool</Button>
        </>
      )}
    </form>
  );
}
