"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { AdminOccurrence, AdminVenue } from "@/lib/admin-data";
import { EMPTY_TALLY, hasHistory, occupied } from "@/lib/booking-tally";
import type { OccurrenceInput } from "@/lib/validation";
import { Button, FormNotice, Textarea, Label } from "@/components/ui/form";
import { formatOccurrence } from "@/lib/format";
import { OccurrenceForm } from "@/components/admin/OccurrenceForm";

const STATUS_LABELS: Record<AdminOccurrence["status"], string> = {
  scheduled: "Scheduled",
  cancelled_by_empowr: "Cancelled",
  completed: "Completed",
};

export function OccurrencesManager({
  offeringId,
  venues,
  initial,
}: {
  offeringId: string;
  venues: AdminVenue[];
  initial: AdminOccurrence[];
}) {
  const [occurrences, setOccurrences] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(values: OccurrenceInput) {
    const res = await fetch("/api/admin/occurrences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Could not create this date.");
    setOccurrences((list) =>
      [{ ...(body.occurrence as AdminOccurrence), tally: EMPTY_TALLY }, ...list].sort(
        (a, b) => b.starts_at.localeCompare(a.starts_at)
      )
    );
    setAdding(false);
  }

  async function update(id: string, values: OccurrenceInput) {
    const res = await fetch(`/api/admin/occurrences/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Could not save this date.");
    setOccurrences((list) =>
      list.map((o) =>
        o.id === id ? { ...(body.occurrence as AdminOccurrence), tally: o.tally } : o
      )
    );
    setEditingId(null);
  }

  async function remove(occurrence: AdminOccurrence) {
    setError(null);
    if (!window.confirm("Remove this date? This can't be undone.")) return;
    const res = await fetch(`/api/admin/occurrences/${occurrence.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not remove this date.");
      return;
    }
    setOccurrences((list) => list.filter((o) => o.id !== occurrence.id));
  }

  function onCancelled(id: string) {
    setOccurrences((list) =>
      list.map((o) => (o.id === id ? { ...o, status: "cancelled_by_empowr" } : o))
    );
  }

  return (
    <div className="space-y-4">
      {error && <FormNotice tone="error">{error}</FormNotice>}

      {occurrences.length === 0 && !adding && (
        <p className="rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
          No dates scheduled yet.
        </p>
      )}

      <ul className="space-y-3">
        {occurrences.map((occurrence) =>
          editingId === occurrence.id ? (
            <li key={occurrence.id} className="rounded-xl border border-line p-4">
              <OccurrenceForm
                offeringId={offeringId}
                venues={venues}
                initial={occurrence}
                submitLabel="Save changes"
                onSubmit={(values) => update(occurrence.id, values)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <OccurrenceRow
              key={occurrence.id}
              occurrence={occurrence}
              onEdit={() => {
                setAdding(false);
                setEditingId(occurrence.id);
              }}
              onDelete={() => remove(occurrence)}
              onCancelled={() => onCancelled(occurrence.id)}
            />
          )
        )}
      </ul>

      {adding ? (
        <div className="rounded-xl border border-line p-4">
          <OccurrenceForm
            offeringId={offeringId}
            venues={venues}
            submitLabel="Add date"
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
          <Plus className="h-4 w-4" aria-hidden /> Add a date
        </Button>
      )}
    </div>
  );
}

function OccurrenceRow({
  occurrence,
  onEdit,
  onDelete,
  onCancelled,
}: {
  occurrence: AdminOccurrence;
  onEdit: () => void;
  onDelete: () => void;
  onCancelled: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState<"refund" | "credit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function doCancel(outcome: "refund" | "credit") {
    setSubmitting(outcome);
    setError(null);
    try {
      const res = await fetch(`/api/admin/occurrences/${occurrence.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, reason: reason || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Could not cancel this session.");
        return;
      }
      setResult(
        `Cancelled — ${body.processed} booking${body.processed === 1 ? "" : "s"} ${
          outcome === "refund" ? "refunded" : "credited"
        }${body.releasedPending ? `, ${body.releasedPending} unpaid hold(s) released` : ""}${
          body.failed ? `, ${body.failed} failed — check logs` : ""
        }.`
      );
      onCancelled();
      setCancelling(false);
    } catch {
      setError("Could not cancel this session.");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-extrabold text-black">
            {formatOccurrence(occurrence.starts_at, occurrence.ends_at)}
            <span
              className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                occurrence.status === "scheduled"
                  ? "bg-blue-pale text-blue-dark"
                  : occurrence.status === "cancelled_by_empowr"
                    ? "bg-red-soft text-red-dark"
                    : "bg-line text-mid"
              }`}
            >
              {STATUS_LABELS[occurrence.status]}
            </span>
          </p>
          {/* Subscribers are broken out rather than folded in: both hold a
              real mem_bookings row since Phase 2 Step 4, so a single total
              silently mixes people who paid with people whose Subscription
              reserved the place, and the takings it implies are wrong. The
              suffix is omitted when nobody has subscribed, so a session with
              no subscribers reads exactly as it did before. */}
          <p className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-mid">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {occupied(occurrence.tally)} booked
            {occurrence.tally.subscribed > 0 &&
              ` (${occurrence.tally.paid} paid · ${occurrence.tally.subscribed} subscribed)`}
            {occurrence.capacity !== null && ` / ${occurrence.capacity} capacity`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/registers/${occurrence.id}`}
            className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-mid transition-colors hover:bg-blue-pale hover:text-blue"
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Register
          </Link>
          {occurrence.status === "scheduled" && (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-mid transition-colors hover:bg-blue-pale hover:text-blue"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
              </button>
              {/* hasHistory, not occupied(): a cancelled booking still
                  FK-references this row, so Remove would fail on a
                  foreign-key error. Offer Cancel session instead. */}
              {!hasHistory(occurrence.tally) ? (
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold text-mid transition-colors hover:bg-red-soft hover:text-red-dark"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCancelling((v) => !v)}
                  className="rounded-full px-3 py-1.5 text-sm font-bold text-red-dark underline transition-colors hover:bg-red-soft"
                >
                  Cancel session
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {result && <div className="mt-3"><FormNotice tone="success">{result}</FormNotice></div>}

      {cancelling && (
        <div className="mt-3 space-y-3 border-t border-line pt-3">
          {error && <FormNotice tone="error">{error}</FormNotice>}
          <p className="text-sm font-semibold text-mid">
            This notifies every booked member and either refunds or credits
            them — pick one for everyone on this date. Unpaid holds are just
            released.
          </p>
          <div>
            <Label htmlFor={`reason-${occurrence.id}`}>Reason (optional, shown in the email)</Label>
            <Textarea
              id={`reason-${occurrence.id}`}
              rows={2}
              className="mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. due to the venue closure"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => doCancel("refund")} disabled={submitting !== null}>
              {submitting === "refund" ? "Refunding everyone…" : "Refund everyone"}
            </Button>
            <Button variant="secondary" onClick={() => doCancel("credit")} disabled={submitting !== null}>
              {submitting === "credit" ? "Crediting everyone…" : "Credit everyone"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setCancelling(false)}
              disabled={submitting !== null}
              className="border-transparent shadow-none hover:border-line"
            >
              Never mind
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
