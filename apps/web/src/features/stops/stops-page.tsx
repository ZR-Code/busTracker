import { BellRing, MapPin, Navigation, Search, Star } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { REMINDER_LEAD_OPTIONS, type StopDto } from '@busbuddy/shared';
import { PageHeader } from '@/components/layout/app-shell';
import { LazyTransitMap } from '@/components/map/lazy-map';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { useRouteDetails } from '@/features/tracking/track-page';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRoutes, useStopPreference, useStops } from '@/services/queries';

export function StopsPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const routeId = params.get('route') ?? '';
  const favoritesOnly = params.get('fav') === '1';
  const selected = params.get('stop');
  const routes = useRoutes();
  const stops = useStops({ search: search.trim() || undefined, routeId: routeId || undefined });
  const set = (k: string, v: string | null) =>
    setParams(
      (p) => {
        if (v) p.set(k, v);
        else p.delete(k);
        return p;
      },
      { replace: true },
    );

  const items = (stops.data ?? []).filter((s) => !favoritesOnly || s.favorite);
  const mapRouteIds = useMemo(() => (routeId ? [routeId] : (routes.data ?? []).map((r) => r.id)), [routeId, routes.data]);
  const mapRoutes = useRouteDetails(mapRouteIds);
  const busForRoute = (id: string) => {
    const r = routes.data?.find((x) => x.id === id);
    return r?.buses.find((b) => b.status !== 'out_of_service') ?? r?.buses[0];
  };

  return (
    <>
      <PageHeader title="Stops" description="Find your stop, save favorites and choose when to be reminded." />
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_240px_auto] md:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="stop-search" className="sr-only">
            Search stops
          </label>
          <Input id="stop-search" type="search" placeholder="Search stops" value={search} onChange={(e) => set('q', e.target.value || null)} className="pl-9" />
        </div>
        <div>
          <label htmlFor="stop-route" className="sr-only">
            Filter by route
          </label>
          <Select id="stop-route" value={routeId} onChange={(e) => set('route', e.target.value || null)}>
            <option value="">All my routes</option>
            {routes.data?.map((r) => (
              <option key={r.id} value={r.id}>
                Route {r.number} – {r.name}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex h-11 items-center gap-2 text-sm font-semibold">
          <Switch checked={favoritesOnly} onCheckedChange={(v) => set('fav', v ? '1' : null)} aria-label="Show favorites only" />
          Favorites only
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <LazyTransitMap
          className="order-2 h-[360px] lg:order-1 lg:sticky lg:top-24 lg:h-[620px]"
          ariaLabel="Map of stops"
          routes={mapRoutes}
          buses={[]}
          selectedStopId={selected}
          highlightStopIds={items.filter((s) => s.favorite).map((s) => s.id)}
          onSelectStop={(id) => set('stop', id)}
          showLegend
        />
        <div className="order-1 lg:order-2">
          {stops.isPending ? (
            <LoadingBlock />
          ) : stops.isError ? (
            <ErrorState message={errorMessage(stops.error)} onRetry={() => stops.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState icon={<MapPin className="h-6 w-6" />} title={favoritesOnly ? 'No favorite stops yet' : 'No stops found'} description={favoritesOnly ? 'Tap “Save” on a stop to add it here.' : 'Try another search or route.'} />
          ) : (
            <ul className="space-y-2" aria-label="Stops">
              {items.map((s) => (
                <StopCard key={s.id} stop={s} selected={s.id === selected} onSelect={() => set('stop', s.id)} busId={s.routes[0] ? busForRoute(s.routes[0].id)?.id : undefined} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function StopCard({ stop, selected, onSelect, busId }: { stop: StopDto; selected: boolean; onSelect: () => void; busId?: string }) {
  const pref = useStopPreference();
  const save = (input: { favorite?: boolean; reminderLeadMinutes?: 2 | 5 | 10 | null }, message: string) =>
    pref.mutate(
      { stopId: stop.id, ...input },
      { onSuccess: () => toast.success(message, { description: stop.name }), onError: (e) => toast.error('Couldn’t save', { description: errorMessage(e) }) },
    );

  return (
    <li>
      <Card className={cn('p-4 transition-colors', selected && 'border-brand ring-1 ring-brand/30')}>
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={onSelect} className="min-w-0 text-left" aria-pressed={selected}>
            <span className="block font-semibold">{stop.name}</span>
            <span className="block text-sm text-muted">{stop.description}</span>
            <span className="mt-1 flex flex-wrap gap-1">
              {stop.routes.map((r) => (
                <Badge key={r.id} tone="info">
                  Route {r.number}
                </Badge>
              ))}
            </span>
          </button>
          <button
            type="button"
            onClick={() => save({ favorite: !stop.favorite }, stop.favorite ? 'Removed from favorites' : 'Saved to favorites')}
            disabled={pref.isPending}
            aria-pressed={stop.favorite}
            aria-label={stop.favorite ? `Remove ${stop.name} from favorites` : `Save ${stop.name} as favorite`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-muted"
          >
            <Star className={cn('h-5 w-5', stop.favorite ? 'fill-[#F59E0B] text-[#F59E0B]' : 'text-muted')} aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <BellRing className="h-4 w-4 text-muted" aria-hidden />
            <span className="sr-only">Arrival reminder for {stop.name}</span>
            <Select
              className="h-9 w-auto"
              value={stop.reminderLeadMinutes ?? ''}
              disabled={pref.isPending}
              onChange={(e) => {
                const v = e.target.value ? (Number(e.target.value) as 2 | 5 | 10) : null;
                save({ reminderLeadMinutes: v }, v ? `Reminder set: ${v} minutes before arrival` : 'Reminder turned off');
              }}
            >
              <option value="">No reminder</option>
              {REMINDER_LEAD_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  Remind me {n} min before
                </option>
              ))}
            </Select>
          </label>
          {busId && (
            <Link to={`/track/${busId}?stop=${stop.id}`} className={buttonClasses('outline', 'sm', 'ml-auto')}>
              <Navigation className="h-4 w-4" aria-hidden /> Track bus
            </Link>
          )}
        </div>
      </Card>
    </li>
  );
}
