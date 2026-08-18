import { PageSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PageSkeleton maxWidth="max-w-4xl" cards={4} />;
}
