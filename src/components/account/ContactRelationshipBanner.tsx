// Rendered on /account and /bookings only — both already read the signed-in
// member. Do not move it into the (member) layout: reading cookies there
// makes every page under it dynamic, catalogue pages included.
//
// Asks members who recorded "Other" as an emergency contact relationship to
// say who that person is. See lib/contact-followup.ts for who sees it and why.
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getAuthedAccount } from "@/lib/auth";
import { skatersNeedingContactRelationship } from "@/lib/contact-followup";

export async function ContactRelationshipBanner() {
  let names: string[] = [];
  try {
    const authed = await getAuthedAccount();
    if (!authed) return null;
    names = await skatersNeedingContactRelationship({
      id: authed.account.id,
      email: authed.user.email ?? null,
    });
  } catch (err) {
    // Next signals redirects and dynamic rendering by throwing; those
    // must pass through. Anything else is a real failure.
    unstable_rethrow(err);
    // A reminder must never take down the page under it.
    console.error("contact follow-up banner failed", err);
    return null;
  }
  if (!names.length) return null;

  return (
    <div role="status" className="rounded-2xl border border-line bg-blue-soft p-4 text-sm text-black sm:p-5">
      <div>
        <p>
          <strong>Please update your emergency contact.</strong> We&apos;ve added
          more options for how your emergency contact is related to each skater.
          For safety this is now required, so we know exactly who we&apos;re
          calling if something happens. Still needed for:{" "}
          {names.join(", ")}.
        </p>
        <Link
          href="/account#household"
          className="mt-1 inline-block font-bold text-blue-dark underline"
        >
          Update in your household
        </Link>
      </div>
    </div>
  );
}
