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

export function SetPasswordForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
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
    });

    if (error) {
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
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          className="mt-1"
          {...register("password")}
        />
        <FieldError message={errors.password?.message} />
      </div>
      <div>
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          className="mt-1"
          {...register("confirm")}
        />
        <FieldError message={errors.confirm?.message} />
      </div>
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
