"use client";

// Staff message composer, shared by the admin console and the door/coach view.
//
// Two clicks, on purpose: "Check who it reaches" shows the families (count and names) and who the message
// is sent as; only then does "Send" appear. Editing anything after the preview throws the preview away,
// so what was confirmed is always what was written. The request id minted with each preview makes a
// double tap or a flaky-network retry send once.
import Link from "next/link";
import { useRef, useState } from "react";
import { Button, FormNotice, Input, Label, Textarea } from "@/components/ui/form";
import {
  BODY_MAX,
  SUBJECT_MAX,
  type AudienceType,
  type OfferingOption,
  type RecipientPreview,
  type SessionOption,
} from "@/lib/message-core";

type MemberHit = { id: string; name: string; email: string | null };
type Preview = {
  label: string;
  count: number;
  summary: string;
  sendingAs: string | null;
  senderError: string | null;
  recipients: RecipientPreview[];
};
type Result = { recipients: number; emailSent: number; emailFailed: number; pushSent: number; duplicate: boolean; problems: string[]; messageId: string };

const TABS: { type: AudienceType; label: string }[] = [
  { type: "occurrence", label: "One session" },
  { type: "offering", label: "A whole offering" },
  { type: "account", label: "One member" },
];

export function MessageComposer({
  role,
  sessions,
  offerings = [],
  logHref,
}: {
  role: "admin" | "coach";
  sessions: SessionOption[];
  offerings?: OfferingOption[];
  /** Where the sent log lives (admin only). */
  logHref?: string;
}) {
  const [audienceType, setAudienceType] = useState<AudienceType>("occurrence");
  const [audienceId, setAudienceId] = useState("");
  const [memberQuery, setMemberQuery] = useState("");
  const [memberHits, setMemberHits] = useState<MemberHit[]>([]);
  const [memberName, setMemberName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string>("");

  const reset = () => {
    setPreview(null);
    setError("");
  };
  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    reset();
  };

  const ready = audienceId !== "" && subject.trim() !== "" && body.trim() !== "";

  async function searchMembers(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/messages/members?q=${encodeURIComponent(memberQuery)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMemberHits(data.members as MemberHit[]);
      if ((data.members as MemberHit[]).length === 0) setError("No member account matched that. They may not have registered yet.");
    } catch {
      setError("Member search failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function checkWhoItReaches() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch("/api/admin/messages/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience: { type: audienceType, id: audienceId } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not check who this reaches.");
      requestId.current = crypto.randomUUID();
      setPreview(data as Preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check who this reaches.");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: { type: audienceType, id: audienceId },
          subject,
          body,
          urgent,
          request_id: requestId.current,
          expected_count: preview.count,
        }),
      });
      const data = await response.json();
      if (response.status === 409 && data.recipients) {
        // Bookings moved under us: show the new picture and make staff look again.
        setPreview(null);
        setError(data.error);
        return;
      }
      if (!response.ok) throw new Error(data.error ?? "The message could not be sent.");
      setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <FormNotice tone={result.emailFailed > 0 || result.problems.length > 0 ? "error" : "success"}>
          {result.duplicate
            ? "That message had already been sent; nothing was sent twice."
            : `Sent to ${result.recipients} ${result.recipients === 1 ? "family" : "families"}. ` +
              `Email: ${result.emailSent} sent${result.emailFailed > 0 ? `, ${result.emailFailed} FAILED` : ""}. ` +
              `Phone alerts: ${result.pushSent}.`}
          {result.problems.map((p) => (
            <span key={p} className="mt-1 block">{p}</span>
          ))}
        </FormNotice>
        <div className="flex flex-wrap gap-3">
          {logHref && (
            <Link href={`${logHref}/${result.messageId}`} className="inline-flex min-h-11 items-center rounded-full bg-blue px-6 font-extrabold text-white hover:bg-blue-dark">
              See who received it
            </Link>
          )}
          <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
            Write another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {role === "admin" && (
        <div role="tablist" aria-label="Who to message" className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.type}
              type="button"
              role="tab"
              aria-selected={audienceType === tab.type}
              onClick={() => {
                setAudienceType(tab.type);
                setAudienceId("");
                setMemberName("");
                reset();
              }}
              className={`min-h-11 rounded-full px-5 text-sm font-extrabold transition-colors ${
                audienceType === tab.type ? "bg-blue text-white" : "border border-line bg-card text-black hover:border-blue"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {audienceType === "occurrence" && (
        <div>
          <Label htmlFor="msg-session">Session</Label>
          {sessions.length === 0 ? (
            <p className="mt-1 rounded-xl bg-blue-pale px-4 py-3 text-sm font-semibold text-blue-dark">
              {role === "coach" ? "No sessions from today to 7 days ahead." : "No upcoming sessions."}
            </p>
          ) : (
            <select
              id="msg-session"
              value={audienceId}
              onChange={(e) => edit(setAudienceId)(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft"
            >
              <option value="">Choose a session</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {audienceType === "offering" && (
        <div>
          <Label htmlFor="msg-offering">Offering (every upcoming date)</Label>
          <select
            id="msg-offering"
            value={audienceId}
            onChange={(e) => edit(setAudienceId)(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line bg-card px-4 py-2.5 text-black focus:border-blue focus:outline-none focus:ring-2 focus:ring-blue-soft"
          >
            <option value="">Choose an offering</option>
            {offerings.map((o) => (
              <option key={o.id} value={o.id}>{o.title}</option>
            ))}
          </select>
        </div>
      )}

      {audienceType === "account" && (
        <div>
          <form onSubmit={searchMembers} className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <Label htmlFor="msg-member">Find a member (name, skater, email or phone)</Label>
              <Input id="msg-member" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} className="mt-1" />
            </div>
            <Button type="submit" variant="secondary" disabled={busy || memberQuery.trim().length < 2}>Search</Button>
          </form>
          {memberName && <p className="mt-3 text-sm font-bold text-black">Messaging: {memberName}</p>}
          {memberHits.length > 0 && (
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line">
              {memberHits.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      edit(setAudienceId)(m.id);
                      setMemberName(m.name);
                      setMemberHits([]);
                    }}
                    className="flex min-h-11 w-full flex-col items-start px-4 py-3 text-left hover:bg-blue-pale/40"
                  >
                    <span className="font-extrabold text-black">{m.name}</span>
                    {m.email && <span className="text-sm text-mid">{m.email}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div>
        <Label htmlFor="msg-subject">Subject</Label>
        <Input id="msg-subject" value={subject} maxLength={SUBJECT_MAX} onChange={(e) => edit(setSubject)(e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="msg-body">Message</Label>
        <Textarea id="msg-body" rows={6} value={body} maxLength={BODY_MAX} onChange={(e) => edit(setBody)(e.target.value)} className="mt-1" />
        <p className="mt-1 text-xs font-semibold text-mid">
          {body.length}/{BODY_MAX}. The email also carries the session name and date and a link to the message. The
          phone alert shows the subject and your first line.
        </p>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-black">
        <input type="checkbox" checked={urgent} onChange={(e) => edit(setUrgent)(e.target.checked)} className="h-5 w-5" />
        Urgent (adds URGENT: to the subject and phone alert; it still sends right away)
      </label>

      {error && <FormNotice tone="error">{error}</FormNotice>}

      {!preview && (
        <Button type="button" onClick={checkWhoItReaches} disabled={!ready || busy}>
          {busy ? "Checking..." : "Check who it reaches"}
        </Button>
      )}

      {preview && (
        <section aria-live="polite" className="space-y-4 rounded-2xl border-2 border-blue bg-card p-5">
          <p className="text-sm font-bold text-mid">
            Sending as: <span className="text-black">{preview.sendingAs ?? "-"}</span>
            {role === "coach" && preview.sendingAs && " at Empowr CIC"}
          </p>
          {preview.senderError && <FormNotice tone="error">{preview.senderError}</FormNotice>}
          <div>
            <p className="text-lg font-black text-black">{preview.count === 0 ? "Nobody is booked on this" : `This reaches ${preview.summary}`}</p>
            {preview.label && <p className="text-sm font-semibold text-mid">{preview.label}</p>}
          </div>
          {preview.recipients.length > 0 && (
            <ul className="max-h-60 divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm">
              {preview.recipients.map((r) => (
                <li key={r.accountId} className="px-4 py-2">
                  <span className="font-extrabold text-black">{r.accountName}</span>
                  {r.participantNames.length > 0 && <span className="text-mid"> - {r.participantNames.join(", ")}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-sm font-semibold text-mid">
            This sends real emails and phone alerts straight away and cannot be undone.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={send} disabled={busy || preview.count === 0 || Boolean(preview.senderError)}>
              {busy
                ? "Sending..."
                : `Send to ${preview.count} ${audienceType === "account" ? "member" : preview.count === 1 ? "family" : "families"}`}
            </Button>
            <Button type="button" variant="secondary" onClick={reset} disabled={busy}>Cancel</Button>
          </div>
        </section>
      )}
    </div>
  );
}
