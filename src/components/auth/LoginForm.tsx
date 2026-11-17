"use client";

// Sign in: passkey (and Google/Microsoft when switched on), or an emailed 6-digit code.
// Passwords were removed on 2026-11-17 (owner): members and staff alike sign in with a code, then
// are offered a passkey on /account so the next sign-in is one tap.

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { emailSchema, type EmailInput } from "@/lib/validation";
import { Button, FieldError, FormNotice, Input, Label } from "@/components/ui/form";
import { SocialSignIn } from "@/components/auth/SocialSignIn";
import { EmailCodeStep } from "@/components/auth/EmailCodeStep";
import { captchaMessage, useCaptcha, type Captcha } from "@/components/auth/useCaptcha";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  // One widget for the whole page: the passkey and the code request both draw on it.
  const captcha = useCaptcha();
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <div className="space-y-5">
        <EmailCodeStep
          email={sentTo}
          next={next}
          onResend={() => sendCode(sentTo, next, captcha)}
          onChangeEmail={() => setSentTo(null)}
        />
        {captcha.widget}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {initialError && <FormNotice tone="error">{initialError}</FormNotice>}
      <SocialSignIn next={next} showPasskey captcha={captcha} />
      <EmailRequest next={next} captcha={captcha} onSent={setSentTo} />
      {captcha.widget}
    </div>
  );
}

/** Emails a sign-in code (and, as a fallback, a link) to an existing account. Error message or null. */
async function sendCode(email: string, next: string, captcha: Captcha): Promise<string | null> {
  const { error } = await createClient().auth.signInWithOtp({
    email,
    options: {
      // The email also carries a link, for anyone who cannot use the code.
      emailRedirectTo: `${location.origin}/auth/confirm/start?next=${encodeURIComponent(next)}`,
      shouldCreateUser: false,
      captchaToken: captcha.token,
    },
  });
  captcha.reset();
  if (!error) return null;
  if (/signups not allowed|user not found/i.test(error.message))
    return "No account found with that email. Please create an account first.";
  if (/rate|too many|seconds/i.test(error.message)) return "Please wait a minute before asking for another code.";
  return captchaMessage(error.message) ?? error.message;
}

function EmailRequest({ next, captcha, onSent }: { next: string; captcha: Captcha; onSent: (email: string) => void }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailInput>({ resolver: zodResolver(emailSchema) });

  async function onSubmit({ email }: EmailInput) {
    setServerError(null);
    const message = await sendCode(email, next, captcha);
    if (message) setServerError(message);
    else onSent(email);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <FormNotice tone="error">{serverError}</FormNotice>}
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" className="mt-1" {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <Button type="submit" disabled={isSubmitting || !captcha.ready} className="w-full">
        {isSubmitting ? "Sending…" : "Email me a sign-in code"}
      </Button>
    </form>
  );
}
