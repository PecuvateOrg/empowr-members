"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { signupSchema, type SignupInput } from "@/lib/validation";
import {
  Button,
  FieldError,
  FormNotice,
  Input,
  Label,
} from "@/components/ui/form";
import { links } from "@/lib/links";
import { SocialSignIn } from "@/components/auth/SocialSignIn";
import { captchaMessage, useCaptcha } from "@/components/auth/useCaptcha";
import { EmailCodeStep } from "@/components/auth/EmailCodeStep";

export function SignupForm({ next = "/account?welcome=1" }: { next?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const captcha = useCaptcha();
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      skating_for: "self",
      email_marketing_opt_in: false,
    },
  });

  // No password since 2026-11-17: a new account is created by emailing a code, and the same call signs
  // an existing member in (their details below are then ignored, as they already have an account).
  async function requestCode(values: SignupInput): Promise<string | null> {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${location.origin}/auth/confirm/start?next=${encodeURIComponent(next)}`,
        captchaToken: captcha.token,
        data: {
          name: values.name,
          skating_for: values.skating_for,
          email_marketing_opt_in: values.email_marketing_opt_in,
          email_marketing_opt_in_at: values.email_marketing_opt_in
            ? new Date().toISOString()
            : null,
        },
      },
    });
    captcha.reset();
    if (!error) return null;
    if (/rate|too many|seconds/i.test(error.message)) return "Please wait a minute before asking for another code.";
    return captchaMessage(error.message) ?? error.message;
  }

  async function onSubmit(values: SignupInput) {
    setServerError(null);
    const message = await requestCode(values);
    if (message) setServerError(message);
    else setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <div className="space-y-5">
        <EmailCodeStep
          email={sentTo}
          next={next}
          onResend={() => requestCode(getValues())}
          onChangeEmail={() => setSentTo(null)}
        />
        {captcha.widget}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <SocialSignIn next={next} />
      {serverError && <FormNotice tone="error">{serverError}</FormNotice>}
      <div>
        <Label htmlFor="name">Your name</Label>
        <Input id="name" autoComplete="name" className="mt-1" {...register("name")} />
        <FieldError message={errors.name?.message} />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          className="mt-1"
          {...register("email")}
        />
        <FieldError message={errors.email?.message} />
      </div>
      <fieldset>
        <legend className="font-bold text-black">Who will be skating?</legend>
        <p className="mt-1 text-sm text-mid">
          Your account manages bookings. Every person who skates, including
          you, must also be added as a skater.
        </p>
        <div className="mt-3 space-y-2">
          {[
            ["self", "I will be skating"],
            ["others", "A child or someone else will be skating"],
            ["both", "Both me and someone else"],
          ].map(([value, label]) => (
            <label
              key={value}
              className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 font-semibold text-mid"
            >
              <input
                type="radio"
                value={value}
                className="h-4 w-4 accent-blue"
                {...register("skating_for")}
              />
              {label}
            </label>
          ))}
        </div>
        <FieldError message={errors.skating_for?.message} />
      </fieldset>
      <label className="flex items-start gap-3 rounded-xl border border-line bg-blue-pale px-4 py-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-blue"
          {...register("email_marketing_opt_in")}
        />
        <span>
          <span className="block font-bold text-blue-dark">
            Keep me updated by email
          </span>
          <span className="mt-0.5 block text-sm text-mid">
            Send me Empowr news, upcoming sessions and offers. I can
            unsubscribe at any time.
          </span>
        </span>
      </label>
      {captcha.widget}
      <Button type="submit" disabled={isSubmitting || !captcha.ready} className="w-full">
        {isSubmitting ? "Sending your code…" : "Create account"}
      </Button>

      {/* THIS IS WHY /signup CAN DROP THE FOOTER (owner asked for it removed,
          2026-09-16). The footer was this page's ONLY link to either policy,
          and this form collects a name, an email, a note that a child will be
          skating, and a marketing opt-in. UK GDPR Art. 13 wants privacy
          information given where the data is collected, not merely somewhere
          on the site, and a marketing consent is only informed if the person
          can see what they are agreeing to. So the link moves into the form,
          which is where it should have been anyway.

          The company's registered particulars are a different obligation
          (Trading Disclosures Regs reg. 25) and are satisfied site-wide, so
          they do NOT need repeating here. Do not remove this line when
          tidying the form. */}
      <p className="text-center text-xs leading-relaxed text-mid">
        By creating an account you agree to our{" "}
        <a
          href={links.termsAndConditions}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-blue underline hover:text-blue-dark"
        >
          Terms &amp; Conditions
        </a>{" "}
        and{" "}
        <a
          href={links.privacyPolicy}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-blue underline hover:text-blue-dark"
        >
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
