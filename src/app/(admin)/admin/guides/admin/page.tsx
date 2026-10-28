import type { Metadata } from "next";
import Link from "next/link";
import { GuidePage, Note, Section, Table, Warning } from "@/components/guides/GuideKit";

export const metadata: Metadata = { title: "Using the admin — Members Admin" };

/**
 * Guide 4: one section per admin menu entry, in menu order (admin-nav.ts).
 * Checked against main on 2026-10-28.
 */
export default function AdminGuidePage() {
  return (
    <GuidePage
      backHref="/admin/guides"
      backLabel="Guides"
      title="Using the admin"
      intro="One section per item in the menu on the left (the burger menu on a phone)."
    >
      <Section title="Dashboard and Check in">
        <p>
          The <strong>Dashboard</strong> shows the next 7 days. Tap a session to open its register.{" "}
          <strong>Check in</strong> is the full-screen door view; everything about
          it is in{" "}
          <Link href="/admin/guides/check-in" className="font-bold text-blue underline">
            Checking people in
          </Link>
          .
        </p>
      </Section>

      <Section title="Offerings">
        <p>Lists every session, course, camp and event. Inactive ones are hidden from the public.</p>
        <Table
          head={["Field", "Notes"]}
          rows={[
            ["URL slug", "The web address. Don't change it on a live session: EELA links point at it."],
            ["Booking model", "Per date, or Per course (one payment covers every week)."],
            ["Min / Max age", "Enforced at booking, subscribing and walk-ins."],
            ["Price, Walk-in price, Early bird price", "In pence: 700 = £7. Leave walk-in blank to turn walk-ins off."],
            ["Cancellation policy", "Standard (48h cancel and refund window) or Non-refundable."],
            ["Members can move to another date", "The self-serve date move."],
            ["Active", "Untick to hide without deleting."],
          ]}
        />
        <Warning>
          The cancellation and move settings are the customer-facing policy.
          Changing them changes what customers are offered straight away. Check
          with the office first.
        </Warning>
        <h3>Dates</h3>
        <p>
          <strong>Add a date</strong> with start, end, venue, capacity and
          early-bird capacity (blank means none; early-bird places are part of the
          capacity). A date with no bookings can be removed. Once anyone has
          booked, use <strong>Cancel session</strong> instead.
        </p>
        <Note>
          Subscribers are added to a new date overnight. Until then they show
          under Recently subscribed, so a new date can briefly look emptier than
          it is.
        </Note>
        <h3>Course runs</h3>
        <p>
          For per-course offerings: a label (for example &ldquo;Sept 2026
          intake&rdquo;), dates, weekly times, price, capacity and venue.
        </p>
      </Section>

      <Section title="Cancelling a session (Empowr cancels)">
        <ol>
          <li>On the date, press <strong>Cancel session</strong> and optionally write a reason. It goes in the email.</li>
          <li>
            Choose one outcome for everyone: <strong>Refund everyone</strong> or{" "}
            <strong>Credit everyone</strong> (credit lasts 12 months).
          </li>
          <li>
            Everyone booked is emailed, subscribers included. Unpaid holds are
            released.
          </li>
        </ol>
        <Note>
          Credit is spent in the basket on any session or course, for anyone in
          the household, within 12 months. A refund suits someone who
          won&rsquo;t book again.
        </Note>
      </Section>

      <Section title="Venues">
        <p>Name, postcode, address and default capacity. A date uses the venue capacity unless it sets its own.</p>
      </Section>

      <Section title="Private bookings">
        <p>
          Lists parties and coaching by type and date, with any blocked times.
          Members book and pay online themselves.
        </p>
        <ul>
          <li>
            <strong>Record a booking paid before online booking</strong>: only for
            bookings agreed and paid before online booking opened. Find the host,
            choose type, Saturday, start and length, then the skaters (each needs
            a signed waiver). The host is emailed a confirmation.
          </li>
          <li>
            <strong>Block a time</strong>: keeps a Saturday slot out of online
            booking, for example something in Empowr&rsquo;s calendar. The reason
            is never shown to customers.
          </li>
        </ul>
        <p>Guests, waivers and extra paid skaters on the day are in the check-in guide.</p>
      </Section>

      <Section title="Messages">
        <p>
          <strong>New message</strong> tells families about something they have
          booked, by email, in their account and as a phone alert.
        </p>
        <ul>
          <li>
            Who to message: <strong>One session</strong>,{" "}
            <strong>A whole offering</strong> (every upcoming date), or{" "}
            <strong>One member</strong>. Coaches can message one session from the
            door view, and those appear here too.
          </li>
          <li>
            Press <strong>Check who it reaches</strong> before sending. One
            message goes to each family, naming all their skaters.
          </li>
          <li>
            <strong>Urgent</strong> only adds &ldquo;URGENT:&rdquo; to the subject.
          </li>
          <li>
            It sends straight away and can&rsquo;t be undone. Open a sent message
            to see who received it.
          </li>
        </ul>
        <Note>
          Not for marketing. Anything to all members goes through Brevo.
        </Note>
      </Section>

      <Section title="Credit notes">
        <p>
          Find the member by name, skater name, email or phone. They need a
          Members account. Then choose what the credit is for:
        </p>
        <ul>
          <li><strong>General credit</strong>, for example instead of a refund.</li>
          <li><strong>Cancel a Members booking and credit it</strong>: the place is released, no card refund.</li>
          <li><strong>A booking made on the old platform</strong>: record the platform, reference, session and date.</li>
        </ul>
        <p>
          Tick both confirmations (you&rsquo;ve checked who they are and it
          hasn&rsquo;t already been refunded or credited; they agreed to credit),
          then <strong>Apply credit</strong>. Credit lasts 12 months and shows on
          their account straight away. A refund that failed can be retried here
          with <strong>Retry approved refund</strong>.
        </p>
        <Note>
          Members spend credit in their basket: <strong>Use my session
          credit</strong> is ticked for them, and they pay any difference by card.
          It can&rsquo;t be used on subscriptions or walk-ins.
        </Note>
      </Section>

      <Section title="Restore a lost booking">
        <p>
          For when a member paid but has no booking. You&rsquo;ll normally hear
          from a &ldquo;Payment taken, no booking&rdquo; alert email.
        </p>
        <ol>
          <li>Paste the <strong>Checkout reference</strong> (starts with cs_) from the alert email.</li>
          <li><strong>Restore this booking</strong>. The app checks with Stripe and emails the ticket. It never takes or refunds money.</li>
          <li>
            If the email did not send, tell the member yourself. If it says
            the session is over capacity, tell the door. If they have already
            booked again, don&rsquo;t restore: refund the duplicate in Stripe.
          </li>
        </ol>
        <p>Only admins can open this page.</p>
      </Section>

      <Section title="Account deletions">
        <p>
          A member&rsquo;s deletion request locks their account once they confirm
          it by email, and it is erased automatically 14 days later. Every step is
          also tracked in PecuvateCRM Escalations.
        </p>
        <ul>
          <li>
            <strong>ON HOLD</strong>: a Stripe dispute or a staff hold stopped it.
            It is never erased until you <strong>Release hold</strong>.
          </li>
          <li>
            <strong>Reverse — keep the account</strong> restores it and emails the
            member. Possible at any time before erasure.
          </li>
          <li>
            <strong>Staff hold</strong>: find a member and set a hold for a
            safeguarding concern or incident the system can&rsquo;t see.
          </li>
        </ul>
        <Warning>Erasure can&rsquo;t be undone once it has run.</Warning>
      </Section>

      <Section title="Waivers and Waiver archive">
        <ul>
          <li>
            <strong>Waivers</strong>: search a skater, parent name or email to see
            if they have signed, on Members or the waiver site. A waiver counts for
            one year. No match means treat them as not signed. It also shows
            waiver cover for each private booking&rsquo;s guests.
          </li>
          <li>
            <strong>Waiver archive</strong>: waivers of people removed from a
            household, kept for 3 years (or until a child turns 21) in case of a
            claim. Only search with a reason.
          </li>
        </ul>
        <Note>Every waiver search is recorded with your email.</Note>
      </Section>

      <Section title="Analytics">
        <p>
          Signups, takings, how far people get (signed up, added a skater, booked
          and paid), a weekly trend and subscriptions. &ldquo;Could not load the
          figures&rdquo; means the numbers failed to load, not that they are zero.
        </p>
      </Section>
    </GuidePage>
  );
}
