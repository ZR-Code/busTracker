import { ArrowRight, Bell, Bus, MapPin, Route, School, Settings } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatRelative, formatTimeOfDay } from '@busbuddy/shared';
import { useAuth } from '@/app/auth-context';
import { PageHeader } from '@/components/layout/app-shell';
import { ServiceStatusBadge } from '@/components/bus/status';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/feedback';
import { BusTracker } from '@/features/tracking/bus-tracker';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useNotifications, useRoutes } from '@/services/queries';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export function DashboardPage() {
  const { me } = useAuth();
  const routes = useRoutes();
  const profile = me?.studentProfile ?? null;
  const [selectedStop, setSelectedStop] = useState<string | null>(null);
  const firstName = me?.name.split(' ')[0] ?? '';

  const route = routes.data?.find((r) => r.id === profile?.assignedRouteId) ?? null;
  const bus = route?.buses.find((b) => b.status !== 'out_of_service') ?? route?.buses[0] ?? null;
  const stopId = selectedStop ?? profile?.defaultStopId ?? null;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <School className="h-4 w-4" aria-hidden /> {profile?.schoolName ?? 'No school selected'}
            </span>
            {route && (
              <span className="inline-flex items-center gap-1.5">
                <Bus className="h-4 w-4" aria-hidden /> {bus ? `Bus ${bus.busNumber}` : 'No bus assigned'} · Route {route.number} – {route.name}
              </span>
            )}
          </span>
        }
        actions={
          <ButtonLink to="/settings" variant="outline" size="sm">
            <Settings className="h-4 w-4" aria-hidden /> Reminder settings
          </ButtonLink>
        }
      />

      {routes.isPending ? (
        <LoadingBlock />
      ) : routes.isError ? (
        <ErrorState message={errorMessage(routes.error)} onRetry={() => routes.refetch()} />
      ) : !profile?.assignedRouteId || !route ? (
        <EmptyState
          icon={<Route className="h-6 w-6" />}
          title="Choose your bus route"
          description={me?.permissions.canSelfAssignRoute ? 'Pick your route and stop in Settings to see your bus here.' : 'Your school hasn’t assigned you a route yet. Contact your transportation office.'}
          action={me?.permissions.canSelfAssignRoute ? <ButtonLink to="/settings">Choose route</ButtonLink> : undefined}
        />
      ) : !bus ? (
        <EmptyState icon={<Bus className="h-6 w-6" />} title="No bus is assigned to your route" description="Check service announcements for updates." />
      ) : (
        <div className="space-y-4">
          <BusTracker busId={bus.id} selectedStopId={stopId} onSelectStop={setSelectedStop} etaHeading={stopId === profile.defaultStopId ? 'Your next pickup' : 'Arrival estimate'} />
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader title="Route summary" icon={<Route className="h-4 w-4 text-brand" aria-hidden />} as="h3" action={<ServiceStatusBadge status={route.serviceStatus} />} />
              <CardBody>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Route</dt>
                    <dd className="font-semibold">
                      {route.number} – {route.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Stops</dt>
                    <dd className="font-semibold">{route.stopCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Timetable</dt>
                    <dd className="font-semibold">
                      {formatTimeOfDay(route.scheduledStartTime)} – {formatTimeOfDay(route.scheduledEndTime)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Your stop</dt>
                    <dd className="flex items-center gap-1 font-semibold">
                      <MapPin className="h-3.5 w-3.5 text-brand" aria-hidden />
                      {profile.defaultStopName ?? 'Not set'}
                    </dd>
                  </div>
                </dl>
                {route.isDemo && <p className="mt-3 text-xs text-muted">Demo trips replay on demand, so timetable times are shifted to the current time while you watch.</p>}
                <Link to={`/track/${bus.id}${stopId ? `?stop=${stopId}` : ''}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-strong hover:underline">
                  Open full tracking view <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </CardBody>
            </Card>
            <RecentNotifications />
          </div>
        </div>
      )}
    </>
  );
}

export function RecentNotifications() {
  const q = useNotifications('all');
  const items = q.data?.items.slice(0, 4) ?? [];
  return (
    <Card>
      <CardHeader
        title="Recent notifications"
        icon={<Bell className="h-4 w-4 text-brand" aria-hidden />}
        as="h3"
        action={
          <Link to="/notifications" className="text-sm font-semibold text-brand-strong hover:underline">
            View all
          </Link>
        }
      />
      <CardBody>
        {q.isPending ? (
          <LoadingBlock />
        ) : q.isError ? (
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        ) : items.length === 0 ? (
          <EmptyState title="No notifications yet" description="Set an arrival reminder and we’ll let you know when your bus is close." className="py-6" />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id} className="flex gap-3 py-2.5">
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand')} aria-hidden />
                <div className="min-w-0">
                  <p className={cn('text-sm', !n.readAt && 'font-semibold')}>
                    {n.title}
                    {!n.readAt && <span className="sr-only"> (unread)</span>}
                  </p>
                  <p className="text-xs text-muted">{formatRelative(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
