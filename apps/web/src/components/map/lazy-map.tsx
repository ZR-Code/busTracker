import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/cn';
import type { TransitMapProps } from './transit-map';

const TransitMap = lazy(() => import('./transit-map'));

export function LazyTransitMap(props: TransitMapProps) {
  return (
    <Suspense
      fallback={
        <div className={cn('relative overflow-hidden rounded-2xl', props.className)} role="status">
          <Skeleton className="absolute inset-0 rounded-2xl" />
          <span className="sr-only">Loading map…</span>
        </div>
      }
    >
      <TransitMap {...props} />
    </Suspense>
  );
}

export type { MapBus, MapRoute, MapStop } from './transit-map';
