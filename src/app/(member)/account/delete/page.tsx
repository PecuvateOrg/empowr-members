// /account/delete — what deleting would do, then the request form. Spec:
// planning/spec/account-deletion.md. The summary here is the same calculation the confirm step
// applies (lib/account-deletion.ts upcomingBookings), so what the member reads is what happens.
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getAuthedAccount } from "@/lib/auth";
import { openDeletion, upcomingBookings } from "@/lib/account-deletion";
import { eraseAfterFor } from "@/lib/account-deletion-core";
import { createServiceClient } from "@/lib/supabase/service";
import { deletionDate } from "@/lib/emails/account-deletion";
import { memberCredits } from "@/lib/credits";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { links } from "@/lib/links";
import { DeleteAccountForm } from "@/components/account/DeleteAccountForm";
import { FormNotice } from "@/components/ui/form";

export const metadata: Metadata = { title: "Delete your account — Empowr Members" };

export default async function DeleteAccountPage() {
  const authed = await getAuthedAccount();
  if (!authed) redirect("/login");
  const accountId = authed.account.id;

  const supabase = await createClient();
  const [open, bookings, credits, memberships, eraseAfter] = await Promise.all([
    openDeletion(accountId),
    upcomingBookings(accountId),
    memberCredits(accountId),
    supabase.from("mem_memberships").select("id", { count: "exact", head: true }).eq("account_id", accountId).in("status", ["active", "past_due"]),
    eraseAfterFor(createServiceClient(), accountId),
  ]);
  const waitsForSession = eraseAfter.getTime() - Date.now() > 14.5 * 24 * 60 * 60 * 1000;
  if (memberships.error) throw new Error("membership_read_failed");
  const membershipCount = memberships.count ?? 0;

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <div>
        <Link href="/account" className="text-sm font-bold text-blue hover:text-blue-dark">← Back to your account</Link>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-black">Delete your account</h1>
        <p className="mt-1 text-mid">Read what will happen before you decide. Nothing changes until you confirm from the email we send you.</p>
      </div>

      {open ? (
        <FormNotice tone="success">
          {open.status === "pending_confirmation"
            ? "You've already asked to delete your account. Check your email for the confirmation link."
            : "Your account is already scheduled for deletion. Use the link in your email if you want to keep it."}
        </FormNotice>
      ) : (
        <>
          <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-extrabold text-black">What will happen</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-black">
              <li>
                Your account is locked as soon as you confirm, and deleted on {deletionDate(eraseAfter.toISOString())} if you confirm today
                {waitsForSession ? " — a week after your last booked session, so the session leaders still have your details on the day." : ", 14 days later."}{" "}
                You can change your mind at any point before then.
              </li>
              {membershipCount > 0 && <li>Your membership{membershipCount > 1 ? "s are" : " is"} cancelled straight away. No further payments are taken.</li>}
              {credits.available > 0 && <li>You have {formatPrice(credits.available)} of unused credit. It will be lost. You can spend it first, or contact us about a refund.</li>}
              <li>We keep some records because the law or our safeguarding duty requires it, with your name and contact details removed. <a href={links.privacyPolicy} target="_blank" rel="noopener" className="font-bold text-blue underline underline-offset-2">Privacy Policy, section 5</a> has the details.</li>
            </ul>
            {bookings.length > 0 && (
              <>
                <h3 className="mt-6 font-extrabold text-black">Your upcoming bookings</h3>
                <ul className="mt-2 divide-y divide-line text-sm">
                  {bookings.map((b) => (
                    <li key={b.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                      <span><span className="font-bold text-black">{b.title}</span> · {b.when}</span>
                      <span className={b.outcome === "refunded" ? "text-blue-dark" : "text-mid"}>
                        {b.outcome === "refunded" ? "Cancelled and refunded" : "Kept — inside 48 hours or non-refundable"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-extrabold text-black">Request deletion</h2>
            <div className="mt-5">
              <DeleteAccountForm />
            </div>
          </section>
        </>
      )}
    </main>
  );
}
