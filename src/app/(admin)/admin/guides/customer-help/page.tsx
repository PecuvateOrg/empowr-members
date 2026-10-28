import type { Metadata } from "next";
import { GuidePage, Note, Section, Table } from "@/components/guides/GuideKit";

export const metadata: Metadata = { title: "Helping a customer — Members Admin" };

/**
 * Guide 2: every step a member takes, with the words on screen, so staff can
 * say "tap the button that says…". Checked against main on 2026-10-28.
 */
export default function CustomerHelpGuidePage() {
  return (
    <GuidePage
      backHref="/admin/guides"
      backLabel="Guides"
      title="Helping a customer"
      intro="Step by step, in the order a new customer meets them. Bold text is the wording on screen."
    >
      <Section title="Create an account">
        <ol>
          <li>
            Go to members.empowrcic.org. On the sign-in page, choose (where shown){" "}
            <strong>Continue with Google</strong> or{" "}
            <strong>Continue with Microsoft</strong>, or create an account with
            email and password.
          </li>
          <li>
            With email: fill in <strong>Your name</strong>, <strong>Email</strong>{" "}
            and <strong>Password</strong>, answer{" "}
            <strong>Who will be skating?</strong>, and press{" "}
            <strong>Create account</strong>.
          </li>
          <li>
            Open the email &ldquo;Confirm your email address&rdquo; and click the
            link. They land on <strong>Your account</strong>.
          </li>
        </ol>
        <p>
          A short &ldquo;not a robot&rdquo; check runs on the sign-up and sign-in
          forms. If it says it couldn&rsquo;t confirm them, they complete the
          check and try again.
        </p>
      </Section>

      <Section title="Signing in">
        <ul>
          <li>
            <strong>Continue with Google / Microsoft</strong>: one tap, if
            that&rsquo;s how they signed up or their email matches.
          </li>
          <li>
            <strong>Sign in with a passkey</strong>: fingerprint or face, once
            they have created one under <strong>Your account</strong>.
          </li>
          <li>
            <strong>Email me a link</strong>: type the email, press{" "}
            <strong>Send sign-in link</strong>, click the link in the email. The
            easiest option for a forgotten password.
          </li>
          <li>
            Email and password, then <strong>Sign in</strong>.
          </li>
        </ul>
        <p>
          <strong>Forgotten your password?</strong> sends a reset link that
          expires in one hour. The screen always says it was sent, even for an
          unknown email. That is on purpose, for privacy.
        </p>
      </Section>

      <Section title="Add skaters and sign the waiver">
        <p>
          On <strong>Your account</strong>, under <strong>Your household</strong>:{" "}
          <strong>Add myself as a skater</strong> or{" "}
          <strong>Add a child or someone else</strong>.
        </p>
        <Table
          head={["Field", "Notes"]}
          rows={[
            ["Name, date of birth", "Age and eligibility come from the date of birth"],
            ["Emergency contact, phone, relationship", "For a child, an adult responsible for them. For an adult adding themselves, it must be someone else"],
            ["Medical notes", "Allergies and conditions coaches should know. Staff see them on the register"],
            ["How will this child usually go home?", "Under-18s only. Pre-fills the departure question at booking"],
          ]}
        />
        <p>
          The same form signs the waiver: the button reads{" "}
          <strong>Add skater and sign waiver</strong>. They can also press{" "}
          <strong>Sign the waiver now</strong> on the account page, or sign at{" "}
          /waiver, which covers several people at once.
        </p>
        <Note>
          A waiver lasts one year. The member is emailed 14 days before it runs
          out, and signs again the same way.
        </Note>
      </Section>

      <Section title="Book and pay">
        <ol>
          <li>Open a session (from EELA or /sessions) and pick a date, or the course.</li>
          <li>
            Tick who is coming. Anyone greyed out shows why: outside the age
            range, already covered by a subscription, or{" "}
            <strong>Waiver needed</strong>. An unsigned skater can be signed for
            right there with <strong>Sign the waiver now</strong>.
          </li>
          <li>
            For each child, <strong>Leaving unaccompanied after this session</strong>{" "}
            stays off unless they have permission to leave alone.
          </li>
          <li>Roller Quad Camp: choose skates and protective gear for each child.</li>
          <li>
            Where early-bird tickets are left, <strong>Choose your ticket</strong>{" "}
            offers Early bird or Standard.
          </li>
          <li>
            <strong>Add to basket</strong>. Up to 10 places in one basket.
          </li>
          <li>
            Open the basket, check it, then <strong>Continue to payment</strong>.
            Either every place is held, or none is and nothing is charged.
          </li>
          <li>
            Pay on the Stripe page (Apple Pay and Google Pay work). They come back
            to <strong>Booking confirmed</strong>, and an email with the tickets
            follows.
          </li>
        </ol>
      </Section>

      <Section title="Tickets, My bookings, cancelling and moving">
        <p>
          Each skater has a ticket with a QR code: from the email, or{" "}
          <strong>My bookings</strong> &rarr; <strong>View ticket</strong>.
          Subscribers need no ticket.
        </p>
        <Table
          head={["Status", "Meaning"]}
          rows={[
            ["Payment pending", "Started paying and hasn't finished. Held about 30 minutes"],
            ["Confirmed", "Paid and booked"],
            ["Attended", "Checked in at the door"],
            ["Cancelled — refunded", "Cancelled, money going back"],
            ["Cancelled — credited", "Empowr cancelled the session and gave credit"],
            ["Cancelled", "Nothing to refund, such as an unpaid hold that expired"],
          ]}
        />
        <ul>
          <li>
            <strong>Cancel booking</strong> &rarr; <strong>Cancel and refund</strong>{" "}
            (where the session allows). Refunds take 5 to 10 working days.
          </li>
          <li>
            <strong>Move to another date</strong> &rarr; pick a date &rarr;{" "}
            <strong>Move booking</strong>. Once per booking, no money changes
            hands, and the same ticket shows the new date. A child&rsquo;s
            &ldquo;leaving unaccompanied&rdquo; permission must be given again.
          </li>
        </ul>
      </Section>

      <Section title="Subscriptions">
        <ol>
          <li>
            On the session&rsquo;s page, under <strong>Coming every week?</strong>,
            press <strong>Subscribe</strong>.
          </li>
          <li>Choose the skater, press Subscribe, pay on the Stripe page.</li>
        </ol>
        <ul>
          <li>One subscription is one skater on one weekly session.</li>
          <li>
            Skate Jam pauses itself outside its season (3 September to 25
            March). No payment is taken in between.
          </li>
          <li>
            To change card or cancel: <strong>Subscription &amp; billing</strong>{" "}
            in the menu, then <strong>Manage or cancel</strong>. They stay covered
            to the end of the paid month.
          </li>
          <li>
            <strong>Payment failed — update your card</strong> means the card was
            declined.
          </li>
        </ul>
      </Section>

      <Section title="Private bookings">
        <ol>
          <li>
            From EELA&rsquo;s private bookings page, choose birthday party, 1-to-1
            or group coaching, a Saturday at least 14 days ahead, and see the
            price before signing in.
          </li>
          <li>Sign in or create an account, then pay on Stripe. The slot is held only during payment.</li>
          <li>
            The host shares the invite link. Each guest registers and signs the
            waiver before the day.
          </li>
        </ol>
        <p>
          Private bookings are <strong>non-refundable and non-transferable</strong>.
        </p>
      </Section>

      <Section title="Messages, alerts and the app">
        <ul>
          <li>
            Messages from staff arrive by email and under <strong>Messages</strong>{" "}
            in their account.
          </li>
          <li>
            <strong>Turn on alerts</strong> (account page or the install banner)
            sends them to the phone too. Alerts are per device.
          </li>
          <li>
            iPhone: alerts only work after Share &rarr;{" "}
            <strong>Add to Home Screen</strong>, then opening it from there
            (iOS 16.4 or newer).
          </li>
        </ul>
      </Section>

      <Section title="Credit, contact and deleting an account">
        <ul>
          <li>
            <strong>Your session credit</strong> on the account page shows any
            credit staff have issued and when it expires. It can&rsquo;t be spent
            at checkout yet.
          </li>
          <li>The Contact page sends a message to the Empowr team.</li>
          <li>
            Deleting an account: they request it and confirm by email. The
            account locks straight away and is deleted 14 days later unless
            they cancel. Upcoming bookings are cancelled under the normal rules,
            the subscription stops, and unspent credit is lost.
          </li>
        </ul>
      </Section>
    </GuidePage>
  );
}
