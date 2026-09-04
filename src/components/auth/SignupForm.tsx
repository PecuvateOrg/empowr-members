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

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
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

  async function onSubmit(values: SignupInput) {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${location.origin}/auth/confirm/start?next=%2Faccount%3Fwelcome%3D1`,
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
    if (error) {
      setServerError(error.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <FormNotice tone="success">
        Check your inbox — we&apos;ve sent a confirmation link to{" "}
        <strong>{getValues("email")}</strong>. Click it to activate your
        account.
      </FormNotice>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          className="mt-1"
          {...register("password")}
        />
        <FieldError message={errors.password?.message} />
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
      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
