import { PageSkeleton } from "@/components/ui/Skeleton";

// Usually prerendered, so this shows only for a slug added since the
// last build or after a cache purge.
export default function Loading() {
  return <PageSkeleton maxWidth="max-w-4xl" cards={2} />;
}
