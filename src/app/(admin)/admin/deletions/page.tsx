// /admin/deletions — every account deletion request, with release / reverse, and the staff hold.
// Spec: planning/spec/account-deletion.md. Requests carry no personal data; the member's name is
// read from the account while it still exists (it becomes "Deleted member" at erasure).
import type { Metadata } from "next";
import { createServiceClient } from "@/lib/supabase/service";
import { DeletionsManager, type DeletionListItem } from "@/components/admin/DeletionsManager";

export const metadata: Metadata = { title: "Account deletions — Empowr Members admin" };
export const dynamic = "force-dynamic";

export default async function DeletionsPage() {
  const service = createServiceClient();
  const { data, error } = await service
    .from("mem_account_deletions")
    .select("id, status, requested_at, confirmed_at, erase_after, ended_at, ended_by, hold_reasons, account:mem_accounts(id, name, deletion_hold, deletion_hold_note)")
    .order("requested_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("deletions_read_failed");
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-black">Account deletions</h1>
      <p className="text-mid">
        Members&apos; deletion requests. A request is erased automatically 14 days after the member confirms, unless it is
        on hold. Release a hold to let it run at the next nightly job, or reverse a request to restore the account.
      </p>
      <DeletionsManager items={(data ?? []) as unknown as DeletionListItem[]} />
    </main>
  );
}
