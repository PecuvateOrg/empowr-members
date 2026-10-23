// /account-deletion/confirm and /account-deletion/cancel — where the emailed links land. Public on
// purpose: during the grace period the member is locked out and cannot sign in. The page only
// shows a button; the POST behind it does the work, so a mail scanner fetching the link cannot.
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DeletionLinkAction } from "@/components/account/DeletionLinkAction";

export const metadata: Metadata = { title: "Your account — Empowr Members", robots: { index: false } };

const COPY = {
  confirm: {
    heading: "Confirm account deletion",
    body: "Your account will be locked straight away and deleted in 14 days. Memberships are cancelled and refundable bookings refunded now. You can still change your mind until the deletion date.",
    button: "Confirm deletion",
    done: "Done. Your account is locked and we've emailed you the details, including a link to keep your account if you change your mind.",
    danger: true,
  },
  cancel: {
    heading: "Keep your account",
    body: "Cancel your deletion request and keep your Empowr Members account.",
    button: "Keep my account",
    done: "Your account is active again. You can sign in as normal.",
    danger: false,
  },
} as const;

export default async function DeletionLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ id?: string; t?: string }>;
}) {
  const { kind } = await params;
  if (kind !== "confirm" && kind !== "cancel") notFound();
  const { id, t } = await searchParams;
  const copy = COPY[kind];
  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <section className="rounded-2xl bg-card p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-black tracking-tight text-black">{copy.heading}</h1>
        <p className="mt-2 text-mid">{copy.body}</p>
        <div className="mt-6">
          {id && t ? (
            <DeletionLinkAction kind={kind} id={id} token={t} label={copy.button} done={copy.done} danger={copy.danger} />
          ) : (
            <p className="text-sm font-semibold text-black">This link is incomplete. Please use the button in your email.</p>
          )}
        </div>
      </section>
    </main>
  );
}
