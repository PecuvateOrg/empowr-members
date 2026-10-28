import type { Metadata } from "next";
import { GuidePage, Note, Section, Table } from "@/components/guides/GuideKit";

export const metadata: Metadata = { title: "How it fits together — Members Admin" };

/** Guide 1 of the staff guide book. Checked against main on 2026-10-28. */
export default function HowItWorksGuidePage() {
  return (
    <GuidePage
      backHref="/admin/guides"
      backLabel="Guides"
      title="How it fits together"
      intro="Read this first. Most customer questions make sense once you know these ideas."
    >
      <Section title="The ideas">
        <ol>
          <li>
            <strong>One account, many skaters.</strong> An account belongs to one
            adult. That adult adds everyone who skates, including themselves if
            they skate, under <strong>Your household</strong>. The account on its
            own is not a skater. That is the most common early mix-up.
          </li>
          <li>
            <strong>A waiver per person, renewed every year.</strong> Every
            skater needs a signed waiver before they can be booked, subscribed,
            taken as a walk-in or join a private booking. One waiver can cover a
            whole household. It lasts a year, and the member is emailed 14 days
            before it runs out.
          </li>
          <li>
            <strong>Age comes from date of birth.</strong> Anyone outside a
            session&rsquo;s age range is greyed out. Nobody picks an age.
          </li>
          <li>
            <strong>Pay per session, or monthly.</strong> A booking covers one
            skater on one date (or a whole course). A subscription covers one
            skater on one weekly session, every week.
          </li>
          <li>
            <strong>The basket is how people pay.</strong> Places are only held
            once they press <strong>Continue to payment</strong>, and then for
            about 30 minutes while they pay.
          </li>
        </ol>
        <Table
          head={["", "Booking (pay per session)", "Subscription (monthly)"]}
          rows={[
            ["How", "Add to basket, then pay by card", "Subscribe on the session's page, then monthly card payment"],
            ["Covers", "One skater, one date (or one course)", "One skater, one weekly session"],
            ["Ticket", "A QR code ticket per skater", "None needed: they are on the register"],
            ["Cancel", "Themselves, under the session's rules", <>Any time, from <strong>Subscription &amp; billing</strong></>],
          ]}
        />
      </Section>

      <Section title="Types of session">
        <Table
          head={["Type", "How it is booked", "Examples (October 2026)"]}
          rows={[
            ["Lesson, drop-in, event", "One date at a time", "Sk8 Skool, Skate Jam, SYNKRON8, Roller Skate Events, Roller Disco"],
            ["Camp", "One camp date, with kit chosen at booking", "Roller Quad Camp"],
            ["Course", "The whole course in one payment", "Beginners Foundation, Prep to Street Skate"],
            ["Private booking", "A Saturday party or coaching slot, at least 14 days ahead", "Birthday party, 1-to-1 coaching, group coaching"],
          ]}
        />
        <p>
          HAF-funded holiday camp places are not booked here. Send those families
          to the Holiday Activities site.
        </p>
      </Section>

      <Section title="Who can see what">
        <Table
          head={["Person", "Can use", "Signs in at"]}
          rows={[
            ["Member", "Their household, bookings, tickets, subscriptions, messages, credit, private bookings", "members.empowrcic.org"],
            ["Door staff and coaches", "Check in: today's and tomorrow's registers, walk-ins, private-booking guest lists, messaging families on a session", "members.empowrcic.org/checkin"],
            ["Admin", "Everything in the admin menu, including this guide", "members.empowrcic.org/admin"],
          ]}
        />
        <p>
          Staff access is given by adding the person&rsquo;s email to a list. They
          sign up as normal first, then a developer adds them. Door staff who open{" "}
          /admin are sent to their own account page. That is expected.
        </p>
      </Section>

      <Section title="Behind the scenes">
        <ul>
          <li>
            <strong>Payments are taken by Stripe.</strong> Empowr never sees card
            numbers. A booking becomes <strong>Confirmed</strong> once Stripe says
            the money arrived, usually within seconds.
          </li>
          <li>
            <strong>Emails</strong> go out automatically: sign-up, sign-in links,
            password reset, booking confirmation with tickets, cancellations,
            date moves, waiver renewal reminders, account deletion steps, and
            messages from staff. Replies go to the enquiries inbox.
          </li>
          <li>
            <strong>Subscribers are added to every future register</strong> the
            moment they subscribe. A catch-up runs each night for anything missed,
            such as a date added later.
          </li>
          <li>
            <strong>Staff alerts</strong> go to the bookings inbox for new
            bookings and subscriptions, and for anything that needs a person,
            such as a payment with no booking. Account deletion events go to
            PecuvateCRM Escalations.
          </li>
          <li>
            <strong>The app can be installed</strong> on a phone&rsquo;s home
            screen, and members can turn on alerts so staff messages reach their
            lock screen.
          </li>
        </ul>
      </Section>

      <Section title="Things the app does not do (yet)">
        <ul>
          <li>
            <strong>Members cannot spend credit yet.</strong> Staff can issue
            credit and members can see it in their account, but checkout has no
            way to use it. Until it does, refund instead of crediting where you
            can.
          </li>
          <li>
            <strong>Staff can&rsquo;t book on a member&rsquo;s behalf</strong> for
            an ordinary booking. At the door, use a walk-in. For private bookings,
            staff can only record ones paid before online booking opened.
          </li>
          <li>
            <strong>A booking can be moved to another date once</strong>, and only
            for sessions that allow it.
          </li>
          <li>
            <strong>Members can&rsquo;t reply to messages</strong> in the app.
            Replies to the email go to the bookings inbox.
          </li>
          <li>
            <strong>A &ldquo;leaving unaccompanied&rdquo; arrangement belongs to
            one date.</strong> It does not move with a booking.
          </li>
        </ul>
        <Note>
          Session content (what a session is, who it is for, prices) comes from
          Empowr&rsquo;s company records, not from this guide.
        </Note>
      </Section>
    </GuidePage>
  );
}
