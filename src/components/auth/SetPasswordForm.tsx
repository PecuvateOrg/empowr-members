"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createClient } from "@/lib/supabase/client";
import { newPasswordSchema, type NewPasswordInput } from "@/lib/validation";
import {
  Button,
  FieldError,
  FormNotice,
  Input,
  Label,
} from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/PasswordInput";

export function SetPasswordForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Secure password change: a session older than 24h must prove it is still
  // the member with a code emailed by reauthenticate(). A recovery link's
  // session is fresh, so the reset path never sees this step.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<NewPasswordInput>({ resolver: zodResolver(newPasswordSchema) });

  async function onSubmit(values: NewPasswordInput) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password: values.password,
      ...(needsCode ? { nonce: code.trim() } : {}),
    });

    if (error) {
      if (error.code === "reauthentication_needed") {
        const { error: sendError } = await supabase.auth.reauthenticate();
        if (sendError) {
          setServerError("We couldn't send your verification code. Please try again.");
          return;
        }
        setNeedsCode(true);
        return;
      }
      if (error.code === "reauthentication_not_valid") {
        setServerError("That code is wrong or has expired. Check the latest email, or reload the page for a new code.");
        return;
      }
      // The recovery link signs the member in, so a missing session here means
      // the link expired or was already used. Saying "try again" would send
      // them round the same loop; they need a fresh link.
      if (/session|not authenticated|jwt/i.test(error.message)) {
        setServerError(
          "That link has expired or was already used. Request a new one from the sign-in page."
        );
        return;
      }
      if (/should be different|same as/i.test(error.message)) {
        setServerError("That is already your password — choose a different one.");
        return;
      }
      setServerError(error.message);
      return;
    }

    setDone(true);
    // refresh() so any server component reading the session re-renders against
    // the rotated credentials rather than the pre-update ones.
    router.refresh();
    setTimeout(() => router.push("/account"), 1500);
  }

  if (done) {
    return (
      <FormNotice tone="success">
        Password updated — you&apos;re signed in. Taking you to your account…
      </FormNotice>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <FormNotice tone="error">{serverError}</FormNotice>}
      <div>
        <Label htmlFor="new-password">New password</Label>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          className="mt-1"
          {...register("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>
      <div>
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          className="mt-1"
          {...register("confirm")}
        />
        <FieldError message={errors.confirm?.message} />
      </div>
      {needsCode && (
        <div>
          <FormNotice tone="success">
            For your security, we&apos;ve emailed you a verification code. Enter it to save your new password.
          </FormNotice>
          <Label htmlFor="reauth-code" className="mt-4 block">Verification code</Label>
          <Input
            id="reauth-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="mt-1"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>
      )}
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
