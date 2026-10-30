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
import { useCallback, useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { FormNotice } from "@/components/ui/form";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

// Turnstile's "flexible" and "normal" widgets are at least 300px wide, but on a
// phone the form inside its card is ~250px, so the widget spilled out of the
// card. Up to this width the "compact" widget (150px) is used instead.
const COMPACT_QUERY = "(max-width: 420px)";

/** Turnstile options shared by every form with a widget (sign-in, sign-up,
 *  contact): hidden unless Cloudflare actually needs the visitor to interact,
 *  light to match the page, and "compact" on narrow screens. Starts "flexible"
 *  because the server cannot know the width; use `size` as the widget's `key`
 *  so a change re-renders it at the new size. Centre the widget in its form. */
export function useCaptchaOptions() {
  const [size, setSize] = useState<"compact" | "flexible">("flexible");
  useEffect(() => {
    const mq = window.matchMedia(COMPACT_QUERY);
    const apply = () => setSize(mq.matches ? "compact" : "flexible");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return { size, theme: "light", appearance: "interaction-only" } as const;
}

export type Captcha = {
  token: string;
  ready: boolean;
  reset: () => void;
  widget: React.ReactNode;
};

export function useCaptcha(): Captcha {
  const ref = useRef<TurnstileInstance>(null);
  const [token, setToken] = useState("");
  // Turnstile usually passes invisibly, so until it does the submit buttons are
  // greyed out with nothing on screen to say why. Say so, and say something
  // different if Cloudflare gave up, rather than "checking" forever.
  const [failed, setFailed] = useState(false);
  const options = useCaptchaOptions();

  const reset = useCallback(() => {
    setToken("");
    setFailed(false);
    ref.current?.reset();
  }, []);

  const widget = TURNSTILE_SITE_KEY ? (
    <div className="space-y-2">
      {!token && (
        <p role="status" className="text-center text-sm font-semibold text-mid">
          {failed
            ? "We couldn't check you're not a robot. Please refresh the page and try again."
            : "Checking you're not a robot…"}
        </p>
      )}
      <div className="flex justify-center">
        <Turnstile
          key={options.size}
          ref={ref}
          siteKey={TURNSTILE_SITE_KEY}
          options={options}
          onSuccess={(t) => {
            setToken(t);
            setFailed(false);
          }}
          onError={() => {
            setToken("");
            setFailed(true);
          }}
          onExpire={() => setToken("")}
        />
      </div>
    </div>
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
