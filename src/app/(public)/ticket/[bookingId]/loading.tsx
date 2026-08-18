import { PageSkeleton } from "@/components/ui/Skeleton";

// The ticket page is force-dynamic (it always reads live booking status),
// so it is the one public route that reliably needs a boundary.
export default function Loading() {
  return <PageSkeleton maxWidth="max-w-2xl" cards={1} />;
}
