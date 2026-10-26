import { Bus, Clock, FlaskConical, MapPin, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatTimeOfDay, type RouteServiceStatus } from '@busbuddy/shared';
import { BusStatusBadge, ServiceStatusBadge } from '@/components/bus/status';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock, Segmented } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form';
import { errorMessage } from '@/lib/api';
import { useRoutes } from '@/services/queries';

type Filter = 'all' | RouteServiceStatus;

export function RoutesPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const filter = (params.get('status') as Filter | null) ?? 'all';
  const routes = useRoutes(search.trim() || undefined);
  const update = (k: string, v: string) =>
    setParams(
      (p) => {
        if (v && v !== 'all') p.set(k, v);
        else p.delete(k);
        return p;
      },
      { replace: true },
    );
  const items = (routes.data ?? []).filter((r) => filter === 'all' || r.serviceStatus === filter);
  const anyDemo = routes.data?.some((r) => r.isDemo);

  return (
    <>
      <PageHeader title="Routes" description="Bus routes available to you, with their buses and today’s service status." />
      {anyDemo && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-demo/30 bg-demo-soft px-4 py-2.5 text-sm">
          <FlaskConical className="h-4 w-4 shrink-0 text-demo" aria-hidden /> Sample dataset: routes in the fictional Maplewood Valley district.
        </p>
      )}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <label htmlFor="route-search" className="sr-only">
            Search routes
          </label>
          <Input id="route-search" type="search" placeholder="Search by name or number" value={search} onChange={(e) => update('q', e.target.value)} className="pl-9" />
        </div>
        <Segmented
          label="Filter by service status"
          value={filter}
          onChange={(v) => update('status', v)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'normal', label: 'Normal' },
            { value: 'delayed', label: 'Delays' },
            { value: 'disrupted', label: 'Disrupted' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
      </div>
      {routes.isPending ? (
        <LoadingBlock />
      ) : routes.isError ? (
        <ErrorState message={errorMessage(routes.error)} onRetry={() => routes.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="No routes match" description={search || filter !== 'all' ? 'Try a different search or filter.' : 'No routes are available to your account yet.'} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((r) => {
            const primary = r.buses.find((b) => b.status !== 'out_of_service') ?? r.buses[0];
            return (
              <li key={r.id}>
                <Card className="h-full p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold text-white" style={{ backgroundColor: r.color }} aria-hidden>
                        {r.number}
                      </span>
                      <div>
                        <h2 className="font-bold">
                          Route {r.number} – {r.name}
                        </h2>
                        <p className="text-sm text-muted">{r.schoolName}</p>
                      </div>
                    </div>
                    <ServiceStatusBadge status={r.serviceStatus} />
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <dt className="flex items-center gap-1 text-muted">
                        <MapPin className="h-3.5 w-3.5" aria-hidden /> Stops
                      </dt>
                      <dd className="font-semibold">{r.stopCount}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-muted">
                        <Clock className="h-3.5 w-3.5" aria-hidden /> First pickup
                      </dt>
                      <dd className="font-semibold">{formatTimeOfDay(r.firstPickupTime)}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1 text-muted">
                        <Bus className="h-3.5 w-3.5" aria-hidden /> Buses
                      </dt>
                      <dd className="font-semibold">{r.buses.length ? r.buses.map((b) => b.busNumber).join(', ') : 'None'}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {r.buses.map((b) => (
                      <span key={b.id} className="inline-flex items-center gap-1 text-xs">
                        <Badge tone="neutral">Bus {b.busNumber}</Badge>
                        <BusStatusBadge status={b.status} />
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {primary && (
                      <Link to={`/track/${primary.id}`} className={buttonClasses('primary', 'sm')}>
                        Track bus {primary.busNumber}
                      </Link>
                    )}
                    <Link to={`/stops?route=${r.id}`} className={buttonClasses('outline', 'sm')}>
                      View stops
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
