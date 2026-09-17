"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { offeringSchema, type OfferingInput } from "@/lib/validation";
import type { AdminOffering, AdminVenue } from "@/lib/admin-data";
import { TYPE_LABELS_SINGULAR } from "@/lib/offering-types";
import {
  Button,
  FieldError,
  FormNotice,
  Input,
  Label,
  Textarea,
} from "@/components/ui/form";

const TYPE_OPTIONS = Object.entries(TYPE_LABELS_SINGULAR) as [
  keyof typeof TYPE_LABELS_SINGULAR,
  string,
][];

export function OfferingForm({
  initial,
  venues,
}: {
  initial?: AdminOffering;
  venues: AdminVenue[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OfferingInput>({
    resolver: zodResolver(offeringSchema),
    defaultValues: initial ?? {
      slug: "",
      title: "",
      type: "drop_in",
      description: null,
      age_min: null,
      age_max: null,
      price_pence: 0,
      walk_in_price_pence: null,
      early_bird_price_pence: null,
      refund_policy: "standard",
      // Off by default. This flag is now READ — it decides whether a
      // member is offered "Move to another date" — so a new offering must
      // opt in rather than silently advertise a move nobody agreed to.
      transferable: false,
      enrolment_scope: "per_occurrence",
      venue_id: null,
      kit_list: null,
      active: false,
    },
  });

  async function onSubmit(values: OfferingInput) {
    setServerError(null);
    const url = initial ? `/api/admin/offerings/${initial.id}` : "/api/admin/offerings";
    const res = await fetch(url, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setServerError(body.error ?? "Could not save this offering.");
      return;
    }
    router.push(`/admin/offerings/${body.offering.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError && <FormNotice tone="error">{serverError}</FormNotice>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="offering-title">Title</Label>
          <Input id="offering-title" className="mt-1" {...register("title")} />
          <FieldError message={errors.title?.message} />
        </div>
        <div>
          <Label htmlFor="offering-slug">
            URL slug <span className="font-semibold text-muted">(lowercase-hyphenated)</span>
          </Label>
          <Input id="offering-slug" className="mt-1" {...register("slug")} />
          <FieldError message={errors.slug?.message} />
        </div>
        <div>
          <Label htmlFor="offering-type">Type</Label>
          <select
            id="offering-type"
            className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft"
            {...register("type")}
          >
            {TYPE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <FieldError message={errors.type?.message} />
        </div>
        <div>
          <Label htmlFor="offering-enrolment">Booking model</Label>
          <select
            id="offering-enrolment"
            className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft"
            {...register("enrolment_scope")}
          >
            <option value="per_occurrence">Per date (drop-in / lesson / event)</option>
            <option value="per_run">Per course (one payment covers every week)</option>
          </select>
          <FieldError message={errors.enrolment_scope?.message} />
        </div>
      </div>

      <div>
        <Label htmlFor="offering-description">Description</Label>
        <Textarea
          id="offering-description"
          rows={3}
          className="mt-1"
          {...register("description")}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="offering-age-min">Min age</Label>
          <Input
            id="offering-age-min"
            type="number"
            min={0}
            className="mt-1"
            {...register("age_min", { valueAsNumber: true })}
          />
          <FieldError message={errors.age_min?.message} />
        </div>
        <div>
          <Label htmlFor="offering-age-max">Max age</Label>
          <Input
            id="offering-age-max"
            type="number"
            min={0}
            className="mt-1"
            {...register("age_max", { valueAsNumber: true })}
          />
          <FieldError message={errors.age_max?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="offering-price">
            Price <span className="font-semibold text-muted">(pence — 700 = £7)</span>
          </Label>
          <Input
            id="offering-price"
            type="number"
            min={0}
            className="mt-1"
            {...register("price_pence", { valueAsNumber: true })}
          />
          <FieldError message={errors.price_pence?.message} />
        </div>
        <div>
          <Label htmlFor="offering-walkin-price">Walk-in price (pence)</Label>
          <Input
            id="offering-walkin-price"
            type="number"
            min={0}
            className="mt-1"
            {...register("walk_in_price_pence", { valueAsNumber: true })}
          />
          <FieldError message={errors.walk_in_price_pence?.message} />
        </div>
        <div>
          <Label htmlFor="offering-earlybird-price">Early bird price (pence)</Label>
          <Input
            id="offering-earlybird-price"
            type="number"
            min={0}
            className="mt-1"
            {...register("early_bird_price_pence", { valueAsNumber: true })}
          />
          <FieldError message={errors.early_bird_price_pence?.message} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="offering-venue">Venue</Label>
          <select
            id="offering-venue"
            className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft"
            {...register("venue_id")}
          >
            <option value="">No default venue</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.venue_id?.message} />
        </div>
        <div>
          <Label htmlFor="offering-refund-policy">Cancellation policy</Label>
          <select
            id="offering-refund-policy"
            className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft"
            {...register("refund_policy")}
          >
            <option value="standard">Standard (48h cancel and refund window)</option>
            <option value="non_refundable">Non-refundable</option>
          </select>
          <FieldError message={errors.refund_policy?.message} />
        </div>
      </div>

      <div>
        <Label htmlFor="offering-kit-list">
          What to bring <span className="font-semibold text-muted">(kit list)</span>
        </Label>
        <Textarea
          id="offering-kit-list"
          rows={3}
          className="mt-1"
          {...register("kit_list")}
        />
        <FieldError message={errors.kit_list?.message} />
      </div>

      <div className="flex flex-wrap gap-6">
        <label
          htmlFor="offering-transferable"
          className="flex items-center gap-2 text-sm font-bold text-black"
        >
          <input
            id="offering-transferable"
            type="checkbox"
            className="h-5 w-5 accent-[var(--color-blue)]"
            {...register("transferable")}
          />
          Members can move to another date
        </label>
        <label
          htmlFor="offering-active"
          className="flex items-center gap-2 text-sm font-bold text-black"
        >
          <input
            id="offering-active"
            type="checkbox"
            className="h-5 w-5 accent-[var(--color-blue)]"
            {...register("active")}
          />
          Active (visible on the public site)
        </label>
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Saving…" : initial ? "Save changes" : "Create offering"}
      </Button>
    </form>
  );
}
