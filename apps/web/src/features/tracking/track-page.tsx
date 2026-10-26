import { useQueries } from '@tanstack/react-query';
import { ArrowLeft, Bus, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { formatEta, type BusLiveDto, type RouteDetailDto } from '@busbuddy/shared';
import { useAuth } from '@/app/auth-context';
import { BusStatusBadge, FreshnessBadge } from '@/components/bus/status';
import { PageHeader } from '@/components/layout/app-shell';
import { LazyTransitMap, type MapBus } from '@/components/map/lazy-map';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api';
import { toMapBus, toMapRoute } from '@/lib/map-data';
import { keys, useLiveBuses, useRoutes } from '@/services/queries';
import { BusTracker } from './bus-tracker';

export function TrackBusPage() {
  const { busId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { me } = useAuth();
  const stopId = params.get('stop') ?? me?.studentProfile?.defaultStopId ?? null;

  const selectStop = (id: string) =>
    setParams(
      (p) => {
        p.set('stop', id);
        return p;
      },
      { replace: true },
    );

  return (
    <>
      <div className="mb-3">
        <Link to="/track" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-strong hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All buses
        </Link>
      </div>
      <PageHeader title="Live bus tracking" description="Choose a stop on the map or in the timeline to see when the bus will arrive there." />
      <BusTracker busId={busId} selectedStopId={stopId} onSelectStop={selectStop} etaHeading="Arrival estimate" />
    </>
  );
}

export function useRouteDetails(routeIds: string[]) {
  const results = useQueries({
    queries: routeIds.map((id) => ({ queryKey: keys.route(id), queryFn: () => api.get<RouteDetailDto>(`/routes/${id}`), staleTime: 60_000 })),
  });
  const stamp = results.map((r) => r.dataUpdatedAt).join('|');
  return useMemo(
    () =>
      results
        .map((r) => r.data)
        .filter((d): d is RouteDetailDto => Boolean(d))
        .map(toMapRoute),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stamp],
  );
}

export function TrackOverviewPage() {
  const live = useLiveBuses();
  const routes = useRoutes();
  const sorted = useMemo(() => [...(live.data ?? [])].sort((a, b) => a.bus.busNumber.localeCompare(b.bus.busNumber, undefined, { numeric: true })), [live.data]);
  const mapBuses = useMemo(() => sorted.map((l) => toMapBus(l)).filter((b): b is MapBus => b !== null), [sorted]);
  const mapRoutes = useRouteDetails((routes.data ?? []).map((r) => r.id));

  return (
    <>
      <PageHeader title="Track a bus" description="Every bus on routes you can access. Select one for its full route timeline and arrival estimates." />
      {live.isPending ? (
        <LoadingBlock />
      ) : live.isError && !live.data ? (
        <ErrorState message={errorMessage(live.error)} onRetry={() => live.refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState icon={<Bus className="h-6 w-6" />} title="No buses to show" description="Buses appear here once your school assigns you a route." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <LazyTransitMap className="h-[380px] lg:h-[600px]" ariaLabel="Map of all buses and routes" routes={mapRoutes} buses={mapBuses} linkBuses />
          <ul className="space-y-2" aria-label="Buses">
            {sorted.map((l) => (
              <BusRow key={l.bus.id} live={l} />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function BusRow({ live }: { live: BusLiveDto }) {
  const next = live.stops.find((s) => s.stopId === live.nextStopId);
  return (
    <li>
      <Link to={`/track/${live.bus.id}`} className="block rounded-2xl" aria-label={`Bus ${live.bus.busNumber}, ${live.bus.routeNumber ? `Route ${live.bus.routeNumber}` : 'unassigned'}`}>
        <Card className="flex items-center gap-3 p-4 transition-colors hover:border-brand">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#16324F] text-sm font-bold text-white dark:bg-brand dark:text-primary-fg" aria-hidden>
            {live.bus.busNumber}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              Bus {live.bus.busNumber}
              <span className="font-normal text-muted"> · {live.bus.routeNumber ? `Route ${live.bus.routeNumber} – ${live.bus.routeName}` : 'Unassigned'}</span>
            </span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              <BusStatusBadge status={live.bus.status} />
              <FreshnessBadge freshness={live.freshness} />
            </span>
            {next && next.etaSeconds !== null && (
              <span className="mt-1 block text-sm text-muted">
                Next: {next.name} · {formatEta(next.etaSeconds)}
              </span>
            )}
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
        </Card>
      </Link>
    </li>
  );
}
