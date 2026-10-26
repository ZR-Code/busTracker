import { BellRing, Megaphone, Star } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { formatClock, REMINDER_LEAD_OPTIONS, type AnnouncementDto, type DistanceUnits } from '@busbuddy/shared';
import { useAuth } from '@/app/auth-context';
import { BusDetails, DataSourceBanner, EtaCard, RouteTimeline } from '@/components/bus/tracking';
import { LazyTransitMap } from '@/components/map/lazy-map';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock, Segmented, Skeleton } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toMapBus, toMapRoute } from '@/lib/map-data';
import { useAnnouncements, useLiveBus, useRoute, useStopPreference, useStops } from '@/services/queries';

export function useUnits(): DistanceUnits {
  return useAuth().me?.settings.distanceUnits ?? 'imperial';
}

export function BusTracker({
  busId,
  selectedStopId,
  onSelectStop,
  etaHeading,
  showAnnouncements = true,
}: {
  busId: string;
  selectedStopId: string | null;
  onSelectStop: (stopId: string) => void;
  etaHeading?: string;
  showAnnouncements?: boolean;
}) {
  const units = useUnits();
  const live = useLiveBus(busId, selectedStopId);
  const routeId = live.data?.bus.routeId ?? null;
  const route = useRoute(routeId);
  const announcements = useAnnouncements(routeId ?? undefined);

  const mapRoutes = useMemo(() => (route.data ? [toMapRoute(route.data)] : []), [route.data]);
  const descriptions = useMemo(() => Object.fromEntries((route.data?.stops ?? []).map((s) => [s.stopId, s.description])), [route.data]);

  if (live.isPending) return <TrackerSkeleton />;
  if (live.isError && !live.data) return <ErrorState title="Couldn’t load this bus" message={errorMessage(live.error)} onRetry={() => live.refetch()} />;
  const data = live.data!;
  const effectiveStop = selectedStopId ?? data.nextStopId;
  const mapBus = toMapBus(data, effectiveStop);
  const school = route.data?.stops[route.data.stops.length - 1];

  return (
    <div className="space-y-4">
      {live.isError && (
        <p role="alert" className="rounded-xl border border-warning/40 bg-warning-soft px-4 py-2 text-sm">
          Connection problem — showing the last information received. Retrying automatically.
        </p>
      )}
      <DataSourceBanner live={data} />
      <div className="grid gap-4 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <div className="space-y-4">
          <EtaCard live={data} stopId={effectiveStop} units={units} heading={etaHeading} />
          {effectiveStop && <StopActions stopId={effectiveStop} routeId={routeId} stopName={data.stops.find((s) => s.stopId === effectiveStop)?.name ?? 'this stop'} />}
        </div>
        <div className="space-y-4">
          <LazyTransitMap
            className="h-[340px] sm:h-[420px]"
            ariaLabel={`Map of Route ${data.bus.routeNumber ?? ''} with bus ${data.bus.busNumber}`}
            routes={mapRoutes}
            buses={mapBus ? [mapBus] : []}
            selectedBusId={data.bus.id}
            selectedStopId={effectiveStop}
            onSelectStop={onSelectStop}
            school={school ? { lat: school.lat, lng: school.lng, name: school.name } : null}
          />
          <Card>
            <CardHeader title={`Bus ${data.bus.busNumber}`} description={data.bus.routeName ? `Route ${data.bus.routeNumber} – ${data.bus.routeName}` : 'No route assigned'} as="h3" />
            <CardBody>
              <BusDetails live={data} units={units} />
            </CardBody>
          </Card>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,380px)]">
        <Card>
          <CardHeader title="Route timeline" description="Select a stop to see its arrival estimate and highlight it on the map." as="h3" />
          <CardBody>
            <RouteTimeline live={data} selectedStopId={effectiveStop} onSelect={onSelectStop} units={units} descriptions={descriptions} />
          </CardBody>
        </Card>
        {showAnnouncements && <AnnouncementsCard items={announcements.data} loading={announcements.isPending} />}
      </div>
    </div>
  );
}

function TrackerSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[380px_1fr]" role="status" aria-label="Loading bus information">
      <Skeleton className="h-80" />
      <Skeleton className="h-[420px]" />
    </div>
  );
}

export function StopActions({ stopId, routeId, stopName, compact }: { stopId: string; routeId: string | null; stopName: string; compact?: boolean }) {
  const { me } = useAuth();
  const stops = useStops(routeId ? { routeId } : {});
  const pref = stops.data?.find((s) => s.id === stopId);
  const mutation = useStopPreference();
  const lead = pref?.reminderLeadMinutes ?? null;

  const setLead = (value: number | 'off') => {
    mutation.mutate(
      { stopId, reminderLeadMinutes: value === 'off' ? null : (value as 2 | 5 | 10) },
      {
        onSuccess: () =>
          toast.success(value === 'off' ? 'Reminder turned off' : `Reminder set: ${value} minutes before arrival`, {
            description: value === 'off' ? stopName : `${stopName}. Reminders appear in Notifications${me?.settings.browserNotifications ? ' and as browser notifications while BusBuddy is open' : ''}.`,
          }),
        onError: (e) => toast.error('Couldn’t save reminder', { description: errorMessage(e) }),
      },
    );
  };

  const toggleFavorite = () =>
    mutation.mutate(
      { stopId, favorite: !(pref?.favorite ?? false) },
      {
        onSuccess: (s) => toast.success(s.favorite ? 'Saved to favorite stops' : 'Removed from favorites', { description: stopName }),
        onError: (e) => toast.error('Couldn’t update favorites', { description: errorMessage(e) }),
      },
    );

  return (
    <Card className={cn(compact && 'shadow-none')}>
      <CardBody className="space-y-3 pt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <BellRing className="h-4 w-4 text-brand" aria-hidden /> Arrival reminder
          </p>
          <button
            type="button"
            onClick={toggleFavorite}
            disabled={!pref || mutation.isPending}
            aria-pressed={pref?.favorite ?? false}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-surface-muted disabled:opacity-50"
          >
            <Star className={cn('h-4 w-4', pref?.favorite ? 'fill-[#F59E0B] text-[#F59E0B]' : 'text-muted')} aria-hidden />
            {pref?.favorite ? 'Favorite' : 'Save stop'}
          </button>
        </div>
        {stops.isPending ? (
          <Skeleton className="h-10" />
        ) : (
          <Segmented
            label={`Arrival reminder for ${stopName}`}
            value={lead ?? 'off'}
            onChange={setLead}
            options={[{ value: 'off' as const, label: 'Off' }, ...REMINDER_LEAD_OPTIONS.map((n) => ({ value: n, label: `${n} min` }))]}
          />
        )}
        <p className="text-xs text-muted">We’ll notify you once per trip when the estimated arrival reaches this time. Reminders are based on estimates.</p>
      </CardBody>
    </Card>
  );
}

export function AnnouncementsCard({ items, loading, title = 'Service announcements' }: { items: AnnouncementDto[] | undefined; loading: boolean; title?: string }) {
  return (
    <Card>
      <CardHeader title={title} icon={<Megaphone className="h-4 w-4 text-brand" aria-hidden />} as="h3" />
      <CardBody>
        {loading ? (
          <LoadingBlock />
        ) : !items?.length ? (
          <EmptyState title="No announcements" description="There are no current service alerts for this route." className="py-6" />
        ) : (
          <ul className="space-y-3">
            {items.map((a) => (
              <li key={a.id} className={cn('rounded-xl border p-3', a.severity === 'critical' ? 'border-danger/30 bg-danger-soft' : a.severity === 'warning' ? 'border-warning/40 bg-warning-soft' : 'border-border bg-surface-muted')}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{a.title}</p>
                  {a.isDemo && <Badge tone="demo">Demo</Badge>}
                </div>
                <p className="mt-1 text-sm text-text/90">{a.body}</p>
                <p className="mt-1 text-xs text-muted">
                  {a.routes.length ? a.routes.map((r) => `Route ${r.number}`).join(', ') : 'All routes'} · Posted {formatClock(a.publishedAt)}
                  {a.expiresAt && ` · Until ${formatClock(a.expiresAt)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
