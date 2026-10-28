import { GuidePage, Note, QA, Section, Warning } from "./GuideKit";

/**
 * The door guide. Rendered at /admin/guides/check-in for admins and at
 * /checkin/guide for door-only staff, who cannot open /admin — so anything
 * the door needs belongs here, not only in the longer admin guides.
 *
 * Short lines, safeguarding first, and the cases someone actually hits on a
 * Thursday night. Checked against main on 2026-10-28.
 */
export function CheckInGuide({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <GuidePage
      backHref={backHref}
      backLabel={backLabel}
      title="Checking people in"
      intro="Registers, walk-ins and private bookings at the door."
    >
      <Section title="Before anyone skates">
        <Warning>
          Check the waiver. If a row says{" "}
          <strong className="text-red-dark">
            &ldquo;No waiver &mdash; do not let them take part&rdquo;
          </strong>
          , that is exactly what it means. No exceptions on the night. They can
          sign on their own phone at <strong>/waiver</strong>, then refresh the
          register.
        </Warning>
        <ul>
          <li>
            A waiver lasts <strong>one year</strong>. Someone who skated last
            year can show as unsigned now. That is the waiver running out, not a
            fault.
          </li>
          <li>
            Read the flags under each name: medical notes, how a child is
            leaving, and the emergency contact. Tap the arrow on a row for the
            full detail.
          </li>
          <li>
            Children are collected in person unless the register says otherwise.
            A &ldquo;leaving unaccompanied&rdquo; arrangement is for{" "}
            <strong>that date only</strong>.
          </li>
        </ul>
      </Section>

      <Section title="The register">
        <p>
          <strong>Check in</strong> lists <strong>Today</strong> and{" "}
          <strong>Tomorrow</strong>. Tap a session to open its register.
        </p>
        <ul>
          <li>
            <strong>Scan their ticket&rsquo;s QR code</strong> with your phone
            camera. It opens their check-in page. Check the name, then tap{" "}
            <strong>Mark attended</strong>.
          </li>
          <li>
            No phone or no ticket? Find them by name on the register and tap the
            same button.
          </li>
          <li>
            <strong>Subscribers are in the main table</strong>, tagged{" "}
            <strong>Subscribed</strong>, with a normal{" "}
            <strong>Mark attended</strong> button. They have no ticket, so find
            them by name.
          </li>
          <li>Checking someone in twice is safe. It just says they are already in.</li>
        </ul>
        <h3>Recently subscribed (under the table)</h3>
        <p>
          This short list catches subscribers the app has not added to the table
          yet: usually because the date was added after they subscribed. Their
          place is reserved and their waiver badge shows, but there is{" "}
          <strong>no Mark attended button</strong> for them yet. Let them in and
          tick them off by hand. They move into the table overnight.
        </p>
        <h3>Payment pending and Release place</h3>
        <p>
          <strong>Payment pending</strong> means someone is on the card page, or
          walked away from it. The place frees itself after about 30 minutes.
          Leave it alone. Only press <strong>Release place</strong> if you need
          the place back now and you are sure they are not paying. It cannot be
          undone.
        </p>
        <h3>Over capacity</h3>
        <p>
          A red <strong>Over capacity</strong> box means more people are entitled
          to come than the room holds. Run the session, then tell the office the
          same day so sales can be stopped.
        </p>
        <h3>Courses and camps</h3>
        <ul>
          <li>
            Courses have one register per week. Open the course, choose the
            session date, then mark each person attended.
          </li>
          <li>
            Roller Quad Camp registers have a{" "}
            <strong>Skates &amp; protective gear</strong> panel with hire sizes,
            for preparing kit before the day.
          </li>
        </ul>
      </Section>

      <Section title="Walk-ins">
        <p>
          Only on sessions with a door price. Otherwise the register says why
          walk-ins can&rsquo;t be taken.
        </p>
        <ol>
          <li>
            Press <strong>Add walk-in</strong> and search by name. Everyone needs
            a member account. If nobody is found, they sign up on their own phone
            (two minutes), then search again.
          </li>
          <li>
            Read the result before taking money: already on the register, already
            covered by a subscription (do not take payment), outside the age
            range, or no waiver (they sign at /waiver first).
          </li>
          <li>
            Adult: <strong>Take payment</strong>. Child: <strong>Continue</strong>
            , answer <strong>Leaving unaccompanied after this session</strong>{" "}
            (leave it off if they are being collected), then{" "}
            <strong>Take payment</strong>.
          </li>
          <li>
            They scan the QR code and pay on their own phone. The register
            updates itself when the payment lands.
          </li>
        </ol>
      </Section>

      <Section title="Private bookings (parties and coaching)">
        <p>
          Private bookings for the next seven days appear on{" "}
          <strong>Check in</strong>. Open one to see its guest list.
        </p>
        <ul>
          <li>
            Each guest registers and signs the waiver through the host&rsquo;s
            invite link before the day. The guest list shows who has. Tap{" "}
            <strong>Check in</strong> beside each name (or{" "}
            <strong>Undo check-in</strong> if you tapped the wrong one).
          </li>
          <li>
            A guest who hasn&rsquo;t registered: tap{" "}
            <strong>Show QR code for a guest to join</strong>. They scan it,
            register and sign on their phone. Then refresh.
          </li>
          <li>
            Extra paying skaters on a party or group booking: use{" "}
            <strong>Add a paid skater</strong>, find them by name, then{" "}
            <strong>Take payment</strong>. They pay on their own phone. One
            family at a time.
          </li>
        </ul>
        <Note>The same waiver rule applies: no waiver, no skating.</Note>
      </Section>

      <Section title="Telling families about a change">
        <p>
          Running late, or need them to bring something? On{" "}
          <strong>Check in</strong>, tap{" "}
          <strong>Message the families on a session</strong>. Choose the session
          (today up to a week ahead), write the message and send. Every family
          booked on it gets an email, a message in their account and, if they
          turned on alerts, a phone notification. It sends straight away and
          cannot be undone.
        </p>
      </Section>

      <Section title="When something looks wrong">
        <QA
          items={[
            [
              "They say they subscribe, but they are not on the register",
              <>
                Look under <strong>Recently subscribed</strong> first. If they
                are in neither place, the subscription is not active right now
                (cancelled, or a payment failed). Take them as a walk-in at the
                door price if the session has one, and ask them to check{" "}
                <strong>Subscription &amp; billing</strong> in their account.
                Don&rsquo;t let them in free.
              </>,
            ],
            [
              "They are tagged Subscribed and also paid for today",
              "Let them skate, then tell the office so the payment can be refunded.",
            ],
            [
              "They say they signed a waiver but it shows unsigned",
              "It may be over a year old, or signed under a different email or spelling. Signing again on their phone at /waiver fixes it in a minute.",
            ],
            [
              "They paid but they are not on the register",
              "Pass it to an admin with their name, email, session and the time they paid. An admin can check the payment and restore the booking.",
            ],
          ]}
        />
      </Section>
    </GuidePage>
  );
}
