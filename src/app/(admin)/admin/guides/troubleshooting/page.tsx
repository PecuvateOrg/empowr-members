import type { Metadata } from "next";
import { GuidePage, QA, Section, Table, Warning } from "@/components/guides/GuideKit";

export const metadata: Metadata = { title: "Troubleshooting — Members Admin" };

/** Guide 5: "the customer says…" and "an alert arrived…". Checked 2026-10-28. */
export default function TroubleshootingGuidePage() {
  return (
    <GuidePage
      backHref="/admin/guides"
      backLabel="Guides"
      title="Troubleshooting"
      intro={'Ask first: "What does the screen say, exactly?" Most messages say what to do next. If nothing here fits, take the details and pass them to the office.'}
    >
      <Section title="Signing in">
        <QA
          items={[
            ["I never got the confirmation email.", "Check spam and junk, wait two minutes, check the spelling. If it was mistyped, sign up again with the right email."],
            ["I've forgotten my password.", <>Easiest: <strong>Email me a link</strong>. Or <strong>Forgotten your password?</strong>; the link lasts an hour.</>],
            ["It says no account found.", "They used a different email, or haven't signed up. Try Continue with Google or Microsoft if they normally use those."],
            ["It says it couldn't confirm I'm not a robot.", "Complete the check on the page and try again. A different browser helps if it keeps failing."],
            ["My passkey didn't work.", "Sign in another way (email link), then manage passkeys under Your account."],
            ["My account is locked.", "They asked to delete it. The confirmation email has a Keep my account button, or an admin can reverse it under Account deletions."],
          ]}
        />
      </Section>

      <Section title="Skaters and waivers">
        <QA
          items={[
            ["I'm signed in but can't book anyone.", <>Nobody is added as a skater. <strong>Your household</strong> &rarr; <strong>Add myself as a skater</strong> or <strong>Add a child or someone else</strong>.</>],
            ["It says I need a waiver again.", "Waivers last a year, so theirs has probably run out. They sign again; it takes a minute."],
            ["I signed on the waiver site and it isn't recognised.", "Probably a different email or spelling. Signing in the app fixes it."],
            ["It asks me to update the emergency contact.", "The relationship options changed. They tap Update in your household and choose who the contact is."],
          ]}
        />
      </Section>

      <Section title="Booking and paying">
        <QA
          items={[
            ["My child is greyed out.", "The reason is beside their name: age range, already covered by a subscription, or waiver needed."],
            ["It said not enough spaces.", "A session in the basket is full. Nothing was charged. Remove or change it, then Continue to payment again."],
            ["The early bird price disappeared.", "Early-bird tickets sold out while they booked. Edit the booking and choose Standard."],
            ["I paid but don't know if it went through.", <>
              Check <strong>My bookings</strong>. Confirmed means done. Payment pending means they haven&rsquo;t finished, and haven&rsquo;t been charged if they left. Nothing there, but money left their bank? Pass to an admin (name, email, session, amount, time) to check Stripe and restore or refund.
            </>],
            ["The payment page wants a code sent to a phone (Onelink).", "Onelink is Stripe's own saved-card service; Empowr can't reset it. Look for a way to pay without it, or they reset it at support.onelink.com. If they didn't get past that screen, they weren't charged."],
            ["Can I use my credit?", "Not yet. Credit shows in their account but checkout can't use it. Pass it to the office if they need the money back instead."],
            ["Can you book it for me?", "Not for an ordinary booking. Walk them through it on their phone. At the door, use a walk-in."],
          ]}
        />
      </Section>

      <Section title="Tickets, cancelling and subscriptions">
        <QA
          items={[
            ["I can't find my ticket.", "My bookings → View ticket, or the email. At the door staff find them by name."],
            ["The ticket says no longer valid.", "That booking was cancelled. Check My bookings for another one."],
            ["The app won't let me cancel or move.", "The screen gives the reason. See What customers can and can't do."],
            ["When will my refund arrive?", "5 to 10 working days, to the card they paid with."],
            ["I want to change it again.", "A booking moves once. After that, the Contact page or enquiries@empowrcic.org."],
            ["How do I cancel my subscription or change my card?", "Subscription & billing → Manage or cancel. Covered to the end of the paid month."],
            ["My Skate Jam subscription stopped charging.", "Expected outside the season (3 September to 25 March). It restarts itself."],
            ["I'm not getting phone alerts.", "Alerts are per device: Turn on alerts on each one. On iPhone, add the app to the home screen first and open it from there."],
          ]}
        />
      </Section>

      <Section title="An alert email arrived">
        <p>These go to the bookings inbox.</p>
        <Table
          head={["Subject starts with", "Do"]}
          rows={[
            ["New booking / New subscription", "Nothing. For information."],
            [<strong key="a">⚠️ Payment taken, no booking</strong>, "Act today. Restore a lost booking with the cs_ reference, or refund in Stripe if they've rebooked."],
            ["⚠️ Payment taken, booking status unknown", "Look the member up. Don't assume either way. Restore or refund as above."],
            ["⚠️ Checkout closed without payment settling", "Check Stripe. If money arrived, treat as Payment taken, no booking."],
          ]}
        />
        <Warning title="Each alert is sent once.">
          There is no reminder. Reply-all with what you did so everyone can see
          it is handled.
        </Warning>
        <p>
          Account deletion holds and requests go to PecuvateCRM Escalations
          instead (the bookings inbox only if the CRM can&rsquo;t be reached).
        </p>
      </Section>

      <Section title="Where to send things">
        <Table
          head={["Thing", "Goes to"]}
          rows={[
            ["Exceptions, complaints, a second booking change", "The office (Contact page or enquiries@empowrcic.org)"],
            ["Payment problems, refunds, lost bookings", "An admin"],
            ["Something broken in the app", "The office, with a screenshot, the time and what they pressed"],
            ["HAF-funded camp places", "The Holiday Activities site"],
          ]}
        />
      </Section>
    </GuidePage>
  );
}
