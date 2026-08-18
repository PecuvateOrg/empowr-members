import { PageSkeleton } from "@/components/ui/Skeleton";

// Covers /account, /bookings, /waiver and both /book routes — all
// session-gated and therefore always dynamic.
export default function Loading() {
  return <PageSkeleton maxWidth="max-w-4xl" cards={3} />;
}
