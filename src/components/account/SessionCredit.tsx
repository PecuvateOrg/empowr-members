import Link from "next/link";
import { memberCredits } from "@/lib/credits";
import { formatPrice } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
export async function SessionCredit({ accountId }: { accountId: string }) {
  try {
    const { notes, available } = await memberCredits(accountId);
    const db = await createClient();
    const { data: activity, error } = await db.from("mem_credit_allocations")
      .select("id,booking_id,amount_pence,state,created_at").eq("account_id",accountId)
      .order("created_at",{ ascending:false }).limit(50);
    if (error) throw error;
    return <section className="rounded-2xl bg-card p-6 shadow-sm space-y-3">
      <h2 className="text-xl font-extrabold">Your session credit</h2>
      <p className="text-3xl font-black text-blue">{formatPrice(available)}</p>
      <p>Use credit towards a session or course for anyone in your household. Pay any difference at checkout; unused credit stays here until its expiry.</p>
      <Link href="/sessions" className="font-bold text-blue underline">Find another session</Link>
      {notes.length === 0 && <p className="text-sm text-mid">No credit notes yet.</p>}
      {notes.map(c => <div key={c.id} className="border-t border-line pt-3 text-sm">
        <p className="font-bold">{formatPrice(c.amount_pence)} credit note · {formatPrice(c.available_pence)} available</p>
        <p>{c.external_platform ? `${c.external_platform} / ${c.external_reference}` : `Booking ${c.source_booking_id}`}</p>
        <p>{c.expires_at ? `Expires ${new Date(c.expires_at).toLocaleDateString("en-GB")}` : "No expiry"}{c.reserved_pence>0 && ` · ${formatPrice(c.reserved_pence)} reserved at checkout`}</p>
      </div>)}
      {!!activity?.length && <details><summary className="cursor-pointer font-bold">Credit activity</summary><ul className="space-y-2 mt-3">{activity.map(a => <li key={a.id} className="text-sm">{formatPrice(a.amount_pence)} · {a.state === "spent" ? "Used" : a.state === "reserved" ? "Reserved at checkout" : "Returned to original credit note"} · booking {a.booking_id.slice(0,8)}</li>)}</ul></details>}
      <p className="text-sm text-mid">Abandoned checkout credit returns when the payment hold expires. Cancelled bookings paid with credit return to the original note and keep its expiry date.</p>
    </section>;
  } catch {
    return <section className="rounded-2xl bg-card p-6"><h2 className="text-xl font-extrabold">Your session credit</h2><p role="status">We could not load your credit. Refresh to try again.</p></section>;
  }
}
