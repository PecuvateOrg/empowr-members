"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { profileSchema, type ProfileInput } from "@/lib/validation";
import type { Account } from "@/lib/types";
import { links } from "@/lib/links";
import {
  Button,
  FieldError,
  FormNotice,
  Input,
  Label,
} from "@/components/ui/form";

export function ProfileForm({ account }: { account: Account }) {
  const [notice, setNotice] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: account.name,
      phone: account.phone,
    },
  });

  async function onSubmit(values: ProfileInput) {
    setNotice(null);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    setNotice(
      res.ok
        ? { tone: "success", message: "Profile saved." }
        : {
            tone: "error",
            message: body.error ?? "Could not save your profile.",
          }
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {notice && <FormNotice tone={notice.tone}>{notice.message}</FormNotice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="profile-name">Your name</Label>
          <Input
            id="profile-name"
            autoComplete="name"
            className="mt-1"
            {...register("name")}
          />
          <FieldError message={errors.name?.message} />
        </div>
        <div>
          <Label htmlFor="profile-phone">Phone</Label>
          <Input
            id="profile-phone"
            type="tel"
            autoComplete="tel"
            className="mt-1"
            {...register("phone")}
          />
          <FieldError message={errors.phone?.message} />
        </div>
      </div>
      {/* Was a WhatsApp opt-in checkbox writing to mem_accounts.whatsapp_opt_in
          — nothing ever read that column to send anything (Phase 3 scope is
          explicit: "WhatsApp stays the existing community group", not
          app-sent messages), so it opted people into a channel this app
          never used. Replaced with the same Brevo-hosted mailing list link
          the disco/camp landing pages use (lib/links.ts -> mailingList) —
          Brevo owns the subscription and its double opt-in, so nothing here
          touches an address, same reasoning as DatesComingSoon. */}
      <p className="text-sm font-semibold text-mid">
        <a
          href={links.mailingList}
          target="_blank"
          rel="noopener"
          className="text-blue underline hover:text-blue-dark"
        >
          Keep me updated
        </a>{" "}
        — join our mailing list for news and announcements.
      </p>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save details"}
      </Button>
    </form>
  );
}
