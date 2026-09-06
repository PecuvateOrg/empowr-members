// Only this POST consumes the Supabase token. Link scanners may GET the email
// URL and the confirmation page as often as they like without invalidating it.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_CONFIRMATION_COOKIE,
  decodePendingAuthConfirmation,
} from "@/lib/auth-confirmation";
import { addMemberToBrevo } from "@/lib/brevo";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const origin = requestOrigin(request);
  const cookieStore = await cookies();
  const pending = decodePendingAuthConfirmation(
    cookieStore.get(AUTH_CONFIRMATION_COOKIE)?.value
  );

  cookieStore.set(AUTH_CONFIRMATION_COOKIE, "", {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/auth/confirm",
    maxAge: 0,
  });

  if (pending) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: pending.tokenHash,
      type: pending.type,
    });
    if (!error) {
      // Enrol only after the signup email has been verified. Brevo is
      // supplementary, so its failure must not invalidate an activated account.
      if (pending.type === "signup" && data.user?.email) {
        try {
          const result = await addMemberToBrevo(data.user.email);
          if (result.skipped) {
            console.warn(
              "[auth] Brevo member enrollment skipped: missing BREVO_API_KEY or invalid BREVO_MEMBERS_LIST_ID"
            );
          }
        } catch (brevoError) {
          console.error("[auth] Brevo member enrollment failed", brevoError);
        }
      }
      return NextResponse.redirect(`${origin}${pending.next}`, 303);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(
      "That sign-in link is invalid or has expired. Please request a new one."
    )}`,
    303
  );
}
