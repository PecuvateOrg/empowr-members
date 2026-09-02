"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import type { AdminCourseRun, AdminVenue } from "@/lib/admin-data";
import { EMPTY_TALLY, occupied } from "@/lib/booking-tally";
import type { CourseRunInput } from "@/lib/validation";
import { Button, FormNotice } from "@/components/ui/form";
import { formatDate, formatPrice } from "@/lib/format";
import { CourseRunForm } from "@/components/admin/CourseRunForm";

export function CourseRunsManager({
  offeringId,
  offeringPricePence,
  initial,
  venues,
}: {
  offeringId: string;
  offeringPricePence: number;
  initial: AdminCourseRun[];
  venues: AdminVenue[];
}) {
  const [runs, setRuns] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(values: CourseRunInput) {
    const res = await fetch("/api/admin/course-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Could not create the course run.");
    // The API returns the row, which carries no tally — a run created a second
    // ago has nobody on it, so EMPTY_TALLY is both correct and what avoids
    // occupied() reading an undefined tally.
    setRuns((list) => [
      { ...(body.courseRun as AdminCourseRun), tally: EMPTY_TALLY },
      ...list,
    ]);
    setAdding(false);
  }

  async function update(id: string, values: CourseRunInput) {
    const res = await fetch(`/api/admin/course-runs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Could not save the course run.");
    // Carry the existing tally across: editing a run's label or dates does not
    // change who is on it, and the API response has no tally to replace it.
    setRuns((list) =>
      list.map((r) =>
        r.id === id
          ? { ...(body.courseRun as AdminCourseRun), tally: r.tally }
          : r
      )
    );
    setEditingId(null);
  }

  async function remove(run: AdminCourseRun) {
    setError(null);
    if (!window.confirm(`Remove "${run.label}"? This can't be undone.`)) return;
    const res = await fetch(`/api/admin/course-runs/${run.id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not remove the course run.");
      return;
    }
    setRuns((list) => list.filter((r) => r.id !== run.id));
  }

  return (
    <div className="space-y-4">
      {error && <FormNotice tone="error">{error}</FormNotice>}

      {runs.length === 0 && !adding && (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          No course runs yet.
        </p>
      )}

      <ul className="space-y-3">
        {runs.map((run) =>
          editingId === run.id ? (
            <li key={run.id} className="rounded-xl border border-line p-4">
              <CourseRunForm
                offeringId={offeringId}
                initial={run}
                venues={venues}
                submitLabel="Save changes"
                onSubmit={(values) => update(run.id, values)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li
              key={run.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line p-4"
            >
              <div>
                <p className="font-extrabold text-black">{run.label}</p>
                <p className="mt-0.5 text-sm font-semibold text-mid">
                  {run.starts_on && run.ends_on
                    ? `${formatDate(run.starts_on)} – ${formatDate(run.ends_on)}`
                    : "Dates not set"}
                  {" · "}
                  {formatPrice(run.price_pence ?? offeringPricePence)}
                </p>
                {/* The enrolment count, which this screen did not show at all
                    until 2026-09-02: a per_run course rendered `capacity 16`
                    and nothing else, so staff could see how many places a run
                    HAD and nothing about whether anyone was in them, while the
                    occurrence list beside it had carried a head-count all
                    along. Same Users icon and wording as OccurrencesManager so
                    the two read alike.

                    No paid/subscribed split here, unlike occurrences: courses
                    have no Subscription option by design (entitlement intake
                    Q1), so tally.subscribed is structurally always 0 and a
                    breakdown would only ever add a meaningless "· 0
                    subscribed". */}
                <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-mid">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {occupied(run.tally)} enrolled
                  {run.capacity !== null && ` / ${run.capacity} capacity`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setEditingId(run.id);
                  }}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-mid transition-colors hover:bg-blue-pale hover:text-blue"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(run)}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-mid transition-colors hover:bg-red-soft hover:text-red-dark"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                </button>
              </div>
            </li>
          )
        )}
      </ul>

      {adding ? (
        <div className="rounded-xl border border-line p-4">
          <CourseRunForm
            offeringId={offeringId}
            venues={venues}
            submitLabel="Add course run"
            onSubmit={create}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setEditingId(null);
            setAdding(true);
          }}
          className="flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add a course run
        </Button>
      )}
    </div>
  );
}
