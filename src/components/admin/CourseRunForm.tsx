"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { courseRunSchema, type CourseRunInput } from "@/lib/validation";
import type { AdminCourseRun, AdminVenue } from "@/lib/admin-data";
import { Button, FieldError, FormNotice, Input, Label } from "@/components/ui/form";

export function CourseRunForm({
  offeringId,
  initial,
  venues,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  offeringId: string;
  initial?: AdminCourseRun;
  venues: AdminVenue[];
  submitLabel: string;
  onSubmit: (values: CourseRunInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CourseRunInput>({
    resolver: zodResolver(courseRunSchema),
    defaultValues: initial
      ? {
          offering_id: offeringId,
          label: initial.label,
          starts_on: initial.starts_on,
          ends_on: initial.ends_on,
          price_pence: initial.price_pence,
          capacity: initial.capacity,
          venue_id: initial.venue_id,
        }
      : {
          offering_id: offeringId,
          label: "",
          starts_on: null,
          ends_on: null,
          price_pence: null,
          capacity: null,
          venue_id: null,
        },
  });

  async function submit(values: CourseRunInput) {
    setServerError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      {serverError && <FormNotice tone="error">{serverError}</FormNotice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="run-label">
            Label <span className="font-semibold text-muted">e.g. &quot;Sept 2026 intake&quot;</span>
          </Label>
          <Input id="run-label" className="mt-1" {...register("label")} />
          <FieldError message={errors.label?.message} />
        </div>
        <div>
          <Label htmlFor="run-starts">Starts on</Label>
          <Input id="run-starts" type="date" className="mt-1" {...register("starts_on")} />
          <FieldError message={errors.starts_on?.message} />
        </div>
        <div>
          <Label htmlFor="run-ends">Ends on</Label>
          <Input id="run-ends" type="date" className="mt-1" {...register("ends_on")} />
          <FieldError message={errors.ends_on?.message} />
        </div>
        <div>
          <Label htmlFor="run-price">
            Price override (pence){" "}
            <span className="font-semibold text-muted">blank = offering price</span>
          </Label>
          <Input
            id="run-price"
            type="number"
            min={0}
            className="mt-1"
            {...register("price_pence", { valueAsNumber: true })}
          />
          <FieldError message={errors.price_pence?.message} />
        </div>
        <div>
          <Label htmlFor="run-capacity">
            Capacity <span className="font-semibold text-muted">blank = unlimited</span>
          </Label>
          <Input
            id="run-capacity"
            type="number"
            min={1}
            className="mt-1"
            {...register("capacity", { valueAsNumber: true })}
          />
          <FieldError message={errors.capacity?.message} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="run-venue">
            Venue{" "}
            <span className="font-semibold text-muted">
              blank = use the offering&apos;s venue
            </span>
          </Label>
          <select
            id="run-venue"
            className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft"
            {...register("venue_id")}
          >
            <option value="">Use the offering&apos;s venue</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.venue_id?.message} />
        </div>
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
