"use client";

// Datetime-local inputs carry no timezone — converted to ISO via the
// browser's own clock, which is correct as long as whoever is running
// admin is physically in the UK (true for the Empowr CIC team; occurrence
// times are always Europe/London wall-clock per business-rules.ts).
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { occurrenceSchema, type OccurrenceInput } from "@/lib/validation";
import type { AdminOccurrence, AdminVenue } from "@/lib/admin-data";
import { Button, FieldError, FormNotice, Input, Label } from "@/components/ui/form";

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function OccurrenceForm({
  offeringId,
  venues,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  offeringId: string;
  venues: AdminVenue[];
  initial?: AdminOccurrence;
  submitLabel: string;
  onSubmit: (values: OccurrenceInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OccurrenceInput>({
    resolver: zodResolver(occurrenceSchema),
    defaultValues: initial
      ? {
          offering_id: offeringId,
          starts_at: toLocalInputValue(initial.starts_at),
          ends_at: toLocalInputValue(initial.ends_at),
          venue_id: initial.venue_id,
          capacity: initial.capacity,
          early_bird_capacity: initial.early_bird_capacity,
        }
      : {
          offering_id: offeringId,
          starts_at: "",
          ends_at: "",
          venue_id: null,
          capacity: null,
          early_bird_capacity: null,
        },
  });

  async function submit(values: OccurrenceInput) {
    setServerError(null);
    try {
      await onSubmit({
        ...values,
        starts_at: new Date(values.starts_at).toISOString(),
        ends_at: new Date(values.ends_at).toISOString(),
      });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4" noValidate>
      {serverError && <FormNotice tone="error">{serverError}</FormNotice>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="occ-starts">Starts</Label>
          <Input
            id="occ-starts"
            type="datetime-local"
            className="mt-1"
            {...register("starts_at")}
          />
          <FieldError message={errors.starts_at?.message} />
        </div>
        <div>
          <Label htmlFor="occ-ends">Ends</Label>
          <Input
            id="occ-ends"
            type="datetime-local"
            className="mt-1"
            {...register("ends_at")}
          />
          <FieldError message={errors.ends_at?.message} />
        </div>
        <div>
          <Label htmlFor="occ-venue">
            Venue <span className="font-semibold text-muted">(blank = offering default)</span>
          </Label>
          <select
            id="occ-venue"
            className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft"
            {...register("venue_id")}
          >
            <option value="">Offering default</option>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.venue_id?.message} />
        </div>
        <div>
          <Label htmlFor="occ-capacity">
            Capacity <span className="font-semibold text-muted">(blank = venue default)</span>
          </Label>
          <Input
            id="occ-capacity"
            type="number"
            min={1}
            className="mt-1"
            {...register("capacity", { valueAsNumber: true })}
          />
          <FieldError message={errors.capacity?.message} />
        </div>
        <div>
          <Label htmlFor="occ-early-bird-capacity">
            Early-bird places{" "}
            <span className="font-semibold text-muted">(blank = no early bird)</span>
          </Label>
          <Input
            id="occ-early-bird-capacity"
            type="number"
            min={0}
            className="mt-1"
            {...register("early_bird_capacity", { valueAsNumber: true })}
          />
          {/* Taken OUT of capacity, not added to it - 5 early-bird places on a
              25-place session means 25 people, 5 of whom paid less. Saying so
              here is the difference between an admin allocating 5 and an admin
              believing they have just created 30 places. */}
          <p className="mt-1 text-xs text-muted">
            Included within capacity, not extra. Needs an early-bird price on the
            offering to appear.
          </p>
          <FieldError message={errors.early_bird_capacity?.message} />
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
