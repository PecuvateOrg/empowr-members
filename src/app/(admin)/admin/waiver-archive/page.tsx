import { WaiverArchiveSearch } from "@/components/admin/WaiverArchiveSearch";

export const dynamic = "force-dynamic";

export default function WaiverArchivePage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-black">Waiver archive</h1>
        <p className="mt-1 text-mid">
          Signed waivers of people who were removed from a household. Kept for 3
          years after removal in case of a claim, then deleted automatically.
          Search only when there is a reason to — every look-up is recorded
          with your email.
        </p>
      </div>
      <WaiverArchiveSearch />
    </main>
  );
}
