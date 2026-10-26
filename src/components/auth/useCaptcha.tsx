"use client";

// Turnstile CAPTCHA for the Supabase Auth calls (2026-10-26 security audit).
// Supabase Auth checks the token server-side once CAPTCHA is enabled on the
// empowr-cic project, so every signUp / signInWithPassword / signInWithOtp /
// resetPasswordForEmail / signInWithPasskey call must carry one.
//
// Tokens are single-use: call reset() after EVERY attempt, failed ones
// included, or a mistyped password makes the retry fail on the CAPTCHA.
//
// Uses the same Members widget as the contact form. Unlike the contact form,
// a missing site key is shown as an error, not skipped — with CAPTCHA
// enforced, a form with no widget would just fail to sign anyone in.
import { useCallback, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { FormNotice } from "@/components/ui/form";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export type Captcha = {
  token: string;
  ready: boolean;
  reset: () => void;
  widget: React.ReactNode;
};

export function useCaptcha(): Captcha {
  const ref = useRef<TurnstileInstance>(null);
  const [token, setToken] = useState("");

  const reset = useCallback(() => {
    setToken("");
    ref.current?.reset();
  }, []);

  const widget = TURNSTILE_SITE_KEY ? (
    <Turnstile
      ref={ref}
      siteKey={TURNSTILE_SITE_KEY}
      options={{ size: "flexible" }}
      onSuccess={setToken}
      onError={() => setToken("")}
      onExpire={() => setToken("")}
    />
  ) : (
    <FormNotice tone="error">
      Sign-in is temporarily unavailable. Please try again later.
    </FormNotice>
  );

  return { token, ready: !!token, reset, widget };
}

/** Plain wording for Supabase's CAPTCHA refusal. */
export function captchaMessage(message: string): string | null {
  return /captcha/i.test(message)
    ? "We couldn't confirm you're not a robot — please complete the check and try again."
    : null;
}
