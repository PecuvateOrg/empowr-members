"use client";

// In-app waiver (Phase 1). Deliberately short: Members already knows who
// the signer is and who their participants are, so this only asks for the
// emergency contact and the consents. Everything else — signer identity,
// participant names, whether any are minors — is derived server-side.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { waiverSchema, type WaiverInput } from "@/lib/validation";
import { links } from "@/lib/links";
import {
  Button,
  FieldError,
  FormNotice,
  Input,
  Label,
} from "@/components/ui/form";

export type WaiverFormParticipant = {
  id: string;
  name: string;
  age: number;
  alreadySigned: boolean;
};

// All copy below is verbatim from the standalone waiver form
// (Empowr-Waivers StepAgreements.tsx CARDS), so the two surfaces present
// the same agreements in the same words. All three are required there and
// here — including photo consent.
type AgreementKey = "agreed_tc" | "agreed_waiver" | "agreed_photo";

const AGREEMENTS: {
  key: AgreementKey;
  title: string;
  sub: string;
  linkLabel: string;
  linkHref: string;
}[] = [
  {
    key: "agreed_tc",
    title: "Terms and conditions",
    sub: "You must read and agree to Empowr CIC's terms before participating.",
    linkLabel: "View T&Cs",
    linkHref: links.termsAndConditions,
  },
  {
    key: "agreed_waiver",
    title: "Risk waiver",
    sub: "Acknowledge the risks involved and waive liability as outlined.",
    linkLabel: "View risk waiver",
    linkHref: links.riskWaiver,
  },
  {
    key: "agreed_photo",
    title: "Photo & filming consent",
    sub: "Permission for Empowr CIC to use photos or video taken during your session.",
    linkLabel: "View consent form",
    linkHref: links.photographyConsent,
  },
];

const AGREEMENT_TOGGLE_LABEL: Record<AgreementKey, string> = {
  agreed_tc: "I agree to the terms and conditions",
  agreed_waiver: "I agree to the risk waiver",
  agreed_photo: "I consent to photo and filming",
};

// Verbatim from the standalone waiver form (Empowr-Waivers StepSkating.tsx),
// so both surfaces record the same set of values.
const EC_RELATIONSHIPS = [
  "Parent",
  "Guardian",
  "Grandparent",
  "Sibling",
  "Carer",
  "Coach",
  "Friend",
  "Other",
] as const;

export function WaiverForm({
  participants,
  defaultEmergencyContact,
}: {
  participants: WaiverFormParticipant[];
  defaultEmergencyContact: { name: string; phone: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<WaiverInput>({
    resolver: zodResolver(waiverSchema),
    defaultValues: {
      // Default to whoever still needs cover; if everyone is covered,
      // preselect nobody so re-signing is a deliberate act.
      participant_ids: participants.filter((p) => !p.alreadySigned).map((p) => p.id),
      emergency_contact_name: defaultEmergencyContact.name,
      emergency_contact_phone: defaultEmergencyContact.phone,
      emergency_contact_relationship: "",
      agreed_tc: false,
      agreed_waiver: false,
      agreed_photo: false,
    },
  });

  const selectedIds = watch("participant_ids") ?? [];
  const coversMinor = participants.some(
    (p) => selectedIds.includes(p.id) && p.age < 18
  );

  function toggle(id: string) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    setValue("participant_ids", next, { shouldValidate: true });
  }

  async function onSubmit(values: WaiverInput) {
    setError(null);

    // Emergency-contact details are required for adult and child skaters.
    let invalid = false;
    if (!values.emergency_contact_name.trim()) {
      setFieldError("emergency_contact_name", { message: "Enter an emergency contact name" });
      invalid = true;
    }
    if (!values.emergency_contact_phone.trim()) {
      setFieldError("emergency_contact_phone", { message: "Enter a contact number" });
      invalid = true;
    }
    if (!values.emergency_contact_relationship.trim()) {
      setFieldError("emergency_contact_relationship", { message: "Enter how they're related" });
      invalid = true;
    }
    if (invalid) return;

    const res = await fetch("/api/waivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not save the waiver — please try again.");
      return;
    }
    setDone(body.covered ?? selectedIds.length);
    // Refresh so the booking page and this page both see the new cover.
    router.refresh();
  }

  if (done !== null) {
    return (
      <div className="space-y-5 text-center">
        <FormNotice tone="success">
          Waiver saved for {done} {done === 1 ? "person" : "people"}.
        </FormNotice>
        <div>
          <h2 className="text-2xl font-black text-blue-dark">
            Welcome to the Sk8Fam!
          </h2>
          <p className="mx-auto mt-3 max-w-lg leading-relaxed text-mid">
            Thank you for becoming an Empowr member and welcome to our growing
            Sk8Fam. We are so pleased to have you with us and cannot wait to
            skate with you!
          </p>
          <p className="mt-3 font-bold text-blue-dark">
            A message from the Founder of Empowr CIC
          </p>
        </div>
        <Button onClick={() => router.push("/sessions")}>View sessions</Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {error && <FormNotice tone="error">{error}</FormNotice>}

      <fieldset>
        <legend className="font-extrabold text-black">Who does this cover?</legend>
        <ul className="mt-3 divide-y divide-line">
          {participants.map((p) => (
            <li key={p.id} className="py-3">
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-[var(--color-blue)]"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => toggle(p.id)}
                  disabled={isSubmitting}
                />
                <span className="flex-1">
                  <span className="block font-bold text-black">{p.name}</span>
                  <span className="block text-sm font-semibold text-muted">
                    Age {p.age}
                    {p.alreadySigned && " — already covered"}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <FieldError message={errors.participant_ids?.message} />
      </fieldset>

      <fieldset>
        <legend className="font-extrabold text-black">
          {coversMinor ? "Parent, guardian or emergency contact" : "Emergency contact"}
          <span className="text-red"> *</span>
        </legend>
        <p className="mt-1 text-sm text-mid">
          {coversMinor
            ? "Please provide the details of an adult responsible for this child."
            : "Please provide someone we can contact in case of an emergency."}
        </p>
        <div className="mt-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="waiver-ec-name">Contact full name</Label>
              <Input
                id="waiver-ec-name"
                autoComplete="name"
                className="mt-1"
                placeholder="e.g. Sarah Johnson"
                {...register("emergency_contact_name")}
              />
              <FieldError message={errors.emergency_contact_name?.message} />
            </div>
            <div>
              <Label htmlFor="waiver-ec-phone">Contact number</Label>
              <Input
                id="waiver-ec-phone"
                type="tel"
                autoComplete="tel"
                className="mt-1"
                placeholder="e.g. 07700 900000"
                {...register("emergency_contact_phone")}
              />
              <FieldError message={errors.emergency_contact_phone?.message} />
            </div>
          </div>
          <div>
            <Label htmlFor="waiver-ec-rel">Relationship to skater(s)</Label>
            {/* Same fixed option list as the standalone form, so the two
                surfaces produce comparable data rather than free text. */}
            <select
              id="waiver-ec-rel"
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-black"
              {...register("emergency_contact_relationship")}
            >
              <option value="">— Select relationship —</option>
              {EC_RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <FieldError
              message={errors.emergency_contact_relationship?.message}
            />
          </div>
          {coversMinor && (
            <p className="text-sm text-muted">
              Required if the child is left unattended in the care of Empowr CIC.
              You&apos;ll be asked separately at booking time whether they can
              leave unaccompanied afterwards — that&apos;s a per-session choice,
              not part of this waiver.
            </p>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend className="font-extrabold text-black">
          Terms, waivers &amp; consent
        </legend>
        <div className="mt-3 space-y-4">
          {AGREEMENTS.map(({ key, title, sub, linkLabel, linkHref }) => (
            <div key={key} className="rounded-xl border border-line p-4">
              <p className="font-bold text-black">
                {title} <span className="text-red">*</span>
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{sub}</p>
              <a
                href={linkHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-block text-sm text-blue underline"
              >
                ↗ {linkLabel}
              </a>
              <label className="mt-3 flex items-start gap-2.5 border-t border-line pt-2.5 text-sm font-semibold text-mid">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-blue"
                  {...register(key)}
                />
                <span>{AGREEMENT_TOGGLE_LABEL[key]}</span>
              </label>
              <FieldError message={errors[key]?.message} />
            </div>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={isSubmitting || selectedIds.length === 0}>
        {isSubmitting ? "Saving…" : "Save waiver"}
      </Button>
    </form>
  );
}
