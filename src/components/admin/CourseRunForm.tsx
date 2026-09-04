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
          // Postgres hands back "19:30:00"; <input type="time"> wants
          // HH:MM. Same slice lib/slot-matching.ts uses on the identically
          // shaped mem_plan_entitlements.starts_at_local.
          starts_at_local: initial.starts_at_local?.slice(0, 5) ?? null,
          ends_at_local: initial.ends_at_local?.slice(0, 5) ?? null,
          price_pence: initial.price_pence,
          capacity: initial.capacity,
          venue_id: initial.venue_id,
        }
      : {
          offering_id: offeringId,
          label: "",
          starts_on: null,
          ends_on: null,
          starts_at_local: null,
          ends_at_local: null,
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
        {/* Date and time sit on one row each, so setting up a course reads
            the same way as setting up a drop-in, where OccurrenceForm gets
            that pairing free from a single datetime-local input.
            Deliberately NOT datetime-local here: a run is a weekly slot
            over a date range, so one instant cannot express it, and
            binding the time to the start date would imply the course meets
            once. Two dates + two times keeps the model honest and the
            control consistent. */}
        <div>
          <Label htmlFor="run-starts">Starts on</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            <div className="min-w-[9rem] flex-1">
              <Input id="run-starts" type="date" {...register("starts_on")} />
            </div>
            <div className="w-36 shrink-0">
              <Input
                id="run-starts-time"
                type="time"
                aria-label="Weekly start time"
                {...register("starts_at_local")}
              />
            </div>
          </div>
          <FieldError
            message={errors.starts_on?.message ?? errors.starts_at_local?.message}
          />
        </div>
        <div>
          <Label htmlFor="run-ends">Ends on</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            <div className="min-w-[9rem] flex-1">
              <Input id="run-ends" type="date" {...register("ends_on")} />
            </div>
            <div className="w-36 shrink-0">
              <Input
                id="run-ends-time"
                type="time"
                aria-label="Weekly end time"
                {...register("ends_at_local")}
              />
            </div>
          </div>
          <FieldError
            message={errors.ends_on?.message ?? errors.ends_at_local?.message}
          />
        </div>
        <p className="text-sm text-mid sm:col-span-2">
          The dates are the first and last week of the run; the times are
          when it meets each week. Leave the times blank if they are not
          settled yet — the session page then shows the dates alone.
        </p>
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
