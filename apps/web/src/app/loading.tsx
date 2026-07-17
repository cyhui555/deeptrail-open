import { CardSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="space-y-4">
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
