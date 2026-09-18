// POST /api/admin/rescue — restore a booking whose payment reached Stripe but
// never reached this app.
//
// Why this exists: on 2026-09-17 a member paid £7, held no booking, and
// appeared on no register. Staff could see the charge in Stripe and had no way
// to give him his place — every booking-creating path in the product ends at a
// Stripe payment page, so when the payment is the thing that went wrong there
// was no way in. The alert added 2026-09-18 tells staff it happened; this is
// what they do about it.
//
// 🔑 STRIPE IS THE EVIDENCE, NOT THE FORM. Seven code paths write
// status='cancelled'. Two of them are deliberate — an admin releasing a hold,
// Empowr cancelling a session — and on every column a deliberate release looks
// exactly like a swept hold. What separates them is whether money exists, so
// this route asks STRIPE whether the checkout was paid and refuses otherwise.
// Staff never type a payment reference: a typo or a guess would restore a place
// somebody deliberately freed.
//
// Scoped to rescue only. It cannot create a booking, cannot comp one, and
// cannot move money — see planning/spec/admin-manual-booking.md for the
// broader hand-booking tool this deliberately is not.
import { NextResponse } from "next/server";
import { getAuthedCheckinStaff, isAdminEmail } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { getStripe } from "@/lib/stripe";
import { sendBookingConfirmationForSession } from "@/lib/notifications";

/** RPC exception name -> what staff are told and the HTTP status. Mapped
 *  rather than echoed: the raw `mem_*` strings are for us, and an unmapped
 *  error must never leak a Postgres message to a door tablet. */
const RPC_ERRORS: Record<string, { status: number; message: string }> = {
  mem_booking_not_found: {
    status: 404,
    message: "No booking found for that checkout reference.",
  },
  mem_not_rescuable: {
    status: 409,
    message:
      "This checkout is not in a rescuable state — it may already be confirmed, already rescued, or refunded. Check it in the admin booking list before doing anything else.",
  },
  mem_not_bookable: {
    status: 409,
    message:
      "The session for this booking is cancelled or has already happened, so the place cannot be restored. Refund the member instead.",
  },
  mem_capacity_exceeded: {
    status: 409,
    message: "This session is now full.",
  },
  // The likeliest real outcome, not an edge case. A member whose payment went
  // missing often just books again — and then nobody ever hears about the
  // first one. Restoring it would give them two places for two payments, so
  // the money is what needs fixing, not the booking.
  mem_already_booked: {
    status: 409,
    message:
      "This member already holds a place on that session — they most likely booked again themselves. Do NOT restore this one: refund the duplicate payment in Stripe instead.",
  },
  mem_payment_evidence_required: {
    status: 500,
    message: "Could not confirm the payment with Stripe. Nothing was changed.",
  },
};

function rpcFailure(message: string) {
  const key = Object.keys(RPC_ERRORS).find((k) => message.includes(k));
  return key ? { key, ...RPC_ERRORS[key] } : null;
}

export async function POST(request: Request) {
  const staff = await getAuthedCheckinStaff();
  if (!staff) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  let body: { checkout_session_id?: unknown; allow_over_capacity?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const sessionId =
    typeof body.checkout_session_id === "string"
      ? body.checkout_session_id.trim()
      : "";
  if (!sessionId) {
    return NextResponse.json(
      { error: "Enter the checkout reference from the alert email." },
      { status: 400 }
    );
  }
  const wantsOverCapacity = body.allow_over_capacity === true;

  // Over-capacity is an ADMIN decision. Door staff can restore a place that
  // still exists; deciding a session should run over its limit is a different
  // call and belongs to the narrower allowlist.
  if (wantsOverCapacity && !isAdminEmail(staff.email)) {
    return NextResponse.json(
      {
        error:
          "Only an administrator can put a session over capacity. Ask one to do this.",
      },
      { status: 403 }
    );
  }

  // Ask Stripe whether the money exists, before touching anything.
  let paymentIntentId: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return NextResponse.json(
        {
          error:
            "Stripe says this checkout was not paid, so there is no place to restore. If the member insists they were charged, check Stripe directly before going further.",
        },
        { status: 409 }
      );
    }
    paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null;
  } catch (err) {
    console.error("rescue: stripe lookup failed", sessionId, err);
    return NextResponse.json(
      {
        error:
          "Could not find that checkout in Stripe. Check the reference and try again.",
      },
      { status: 404 }
    );
  }

  if (!paymentIntentId) {
    // Paid with no payment intent should not happen, and guessing would write
    // a booking we cannot reconcile against the money later.
    console.error("rescue: paid session carries no payment intent", sessionId);
    return NextResponse.json(
      {
        error:
          "Stripe reports this checkout as paid but gave no payment reference. Do not retry — raise this with whoever maintains the site.",
      },
      { status: 409 }
    );
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc("mem_rescue_checkout", {
    p_checkout_session_id: sessionId,
    p_user_id: staff.id,
    p_payment_intent_id: paymentIntentId,
    p_allow_over_capacity: wantsOverCapacity,
  });

  if (error) {
    const failure = rpcFailure(error.message ?? "");
    if (failure) {
      console.warn("rescue: refused", sessionId, failure.key);
      return NextResponse.json(
        {
          error: failure.message,
          // Lets the UI offer an override to an admin rather than making them
          // guess that one exists. Never offered to door staff.
          canOverride:
            failure.key === "mem_capacity_exceeded" &&
            isAdminEmail(staff.email) &&
            !wantsOverCapacity,
        },
        { status: failure.status }
      );
    }
    console.error("rescue: rpc failed", sessionId, error);
    return NextResponse.json(
      { error: "Could not restore this booking — please try again." },
      { status: 500 }
    );
  }

  const restored = (data ?? []) as { id: string; rescued_over_capacity: boolean }[];

  // The member must be told, and the ticket is what the door scans. This
  // reuses the webhook's own sender UNCHANGED — a swept hold keeps its
  // stripe_checkout_session_id, which is exactly what that function queries
  // by, so there is no second copy of this logic to drift.
  //
  // Best-effort by design: the place and the payment are already recorded, and
  // failing the request here would invite staff to press the button again on a
  // booking that is already restored.
  const emailed = await sendBookingConfirmationForSession(service, sessionId);
  if (!emailed) {
    console.error(
      "RESCUE SUCCEEDED BUT THE MEMBER WAS NOT EMAILED - they hold a place they cannot see",
      sessionId
    );
  }

  return NextResponse.json({
    ok: true,
    restored: restored.length,
    overCapacity: restored.some((r) => r.rescued_over_capacity),
    emailed,
  });
}
