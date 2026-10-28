import type { Metadata } from "next";
import { GuidePage, Section, Table, Warning } from "@/components/guides/GuideKit";

export const metadata: Metadata = { title: "What customers can and can't do — Members Admin" };

/**
 * Guide 3. The per-session table was read from the live database on
 * 2026-10-28. Those are switches staff change in Offerings, so this page can
 * go stale with no code change: re-read them when editing it.
 */
export default function PoliciesGuidePage() {
  const yes = "✅ Yes";
  const no = "❌ No";
  return (
    <GuidePage
      backHref="/admin/guides"
      backLabel="Guides"
      title="What customers can and can't do"
      intro="The app enforces the published Programme Policies and Terms. If it refuses something, that is the policy working."
    >
      <Section title="The general rules">
        <Table
          head={["Rule", "Detail"]}
          rows={[
            ["48-hour window", "Cancel for a refund, or move a date, at least 48 hours before the session. Inside 48 hours, they contact Empowr instead."],
            ["Refunds", "Back to the card they paid with, usually within 5 to 10 working days."],
            ["Moving a date", "Same session, another date, once per booking, no money changes hands."],
            ["Courses", "Booked as a whole. Weeks can't be moved. Where cancelling is allowed it is the whole course, 48 hours before its first day."],
            ["When Empowr cancels", "Everyone booked is emailed and refunded (or credited). Staff choose one for the whole date."],
            ["Subscriptions", "Cancel any time from Subscription & billing. Cover runs to the end of the paid month."],
            ["Private bookings", "Booked at least 14 days ahead, paid in full online, non-refundable and non-transferable."],
            ["Waivers", "One per person, valid for a year."],
            ["A second change to a booking", "Not self-serve. They use the Contact page or email enquiries@empowrcic.org."],
          ]}
        />
      </Section>

      <Section title="Per-session settings">
        <Warning title="These change.">
          Read from the live system on 28 October 2026. Each offering has its own
          refund policy and walk-in price in <strong>Offerings</strong>. Check
          there before quoting a rule.
        </Warning>
        <Table
          head={["Session", "Cancel for refund (48h+)", "Move date (once)", "Walk-ins"]}
          rows={[
            ["Sk8 Skool for Kidz", yes, yes, yes],
            ["Sk8 Skool for All Ages", yes, yes, yes],
            ["SYNKRON8: Roller Dance for Beginners", yes, yes, yes],
            ["Skate Jam", yes, yes, "✅ Door price higher"],
            ["Roller Skate Events 15+", yes, yes, "✅ Door price higher"],
            [<strong key="d">All Ages Roller Disco</strong>, "❌ Non-refundable", no, "✅ Door price higher"],
            [<strong key="c">Roller Quad Camp</strong>, "❌ Non-refundable", no, "✅ Door price higher"],
            ["Beginners Foundation (course)", "✅ Whole course", no, no],
            ["Prep to Street Skate (course)", "✅ Whole course", no, no],
          ]}
        />
      </Section>

      <Section title="What the customer sees when the app says no">
        <Table
          head={["Message", "Why"]}
          rows={[
            ["This session is non-refundable.", "Roller Disco and Camp"],
            ["Cancellations must be made at least 48 hours before the session.", "Inside the window"],
            ["This session can't be moved to another date.", "Moving is off for that session"],
            ["Courses are booked as a whole block…", "It's a course"],
            ["This booking has already been moved once…", "The one move is used"],
            ["There are no other dates available for this session at the moment.", "No other date is 48h+ away with space"],
          ]}
        />
      </Section>

      <Section title="When someone asks for an exception">
        <p>
          The app has no override for a member&rsquo;s own cancellation or move.
          Exceptions are the office&rsquo;s decision, not the door&rsquo;s. Take
          the details (name, session, date, what they want) and pass them on.
          Don&rsquo;t promise an outcome.
        </p>
        <p>
          An admin can refund in Stripe, or issue credit from{" "}
          <strong>Credit notes</strong>. Credit lasts 12 months and is
          spent in the basket on sessions and courses.
        </p>
      </Section>
    </GuidePage>
  );
}
