// Admin register. The page itself is only routing and labels — the register
// is components/admin/RegisterView.tsx, shared with the door check-in route
// so the two can never drift apart on something like whether a child is
// authorised to leave alone.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getRegister } from "@/lib/admin-data";
import { RegisterView } from "@/components/admin/RegisterView";

export const metadata: Metadata = { title: "Register — Members Admin" };
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ occurrenceId: string }>;
}) {
  const { occurrenceId } = await params;
  const register = await getRegister(occurrenceId);
  if (!register) notFound();

  return (
    <RegisterView
      register={register}
      backHref="/admin/checkin"
      backLabel="Check in"
      guideHref="/admin/guides/check-in"
    />
  );
}
