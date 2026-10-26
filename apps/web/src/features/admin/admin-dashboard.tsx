import { Activity, AlertTriangle, Bus, FlaskConical, MapPin, Megaphone, Pause, Play, RotateCcw, Route } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BUS_STATUS_LABELS, formatDeviation, formatRelative, SIMULATION_SPEEDS, type ProviderStatusDto } from '@busbuddy/shared';
import { BusStatusBadge, ServiceStatusBadge } from '@/components/bus/status';
import { PageHeader } from '@/components/layout/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ErrorState, LoadingBlock, Segmented } from '@/components/ui/feedback';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { api, useAdminAnalytics, useAdminMutation, useAdminOverview, useSimulation } from './admin-api';

function Stat({ icon, label, value, sub, to }: { icon: ReactNode; label: string; value: ReactNode; sub?: string; to?: string }) {
  const body = (
    <Card className="h-full p-4 transition-colors hover:border-brand/50">
      <p className="flex items-center gap-2 text-sm font-medium text-muted [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </Card>
  );
  return to ? (
    <Link to={to} className="block rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}

function ProviderList({ providers }: { providers: ProviderStatusDto[] }) {
  return (
    <ul className="space-y-2">
      {providers.map((p) => (
        <li key={p.source} className="flex items-start justify-between gap-3 text-sm">
          <div>
            <p className="font-semibold">{p.name}</p>
            <p className="text-muted">{p.message}</p>
          </div>
          <Badge tone={p.state === 'active' ? 'success' : p.state === 'error' ? 'danger' : p.state === 'not_configured' ? 'neutral' : 'warning'}>
            {p.state === 'not_configured' ? 'Not configured' : p.state[0]!.toUpperCase() + p.state.slice(1)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export function AdminOverviewPage() {
  const q = useAdminOverview();
  if (q.isPending) return <LoadingBlock />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Transportation overview" description="Live status of buses, routes and alerts in your scope." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Bus />} label="Active buses" value={d.counts.activeBuses} sub={`of ${d.counts.totalBuses} buses`} to="/admin/buses" />
        <Stat icon={<Route />} label="Active routes" value={d.counts.activeRoutes} sub={`of ${d.counts.totalRoutes} routes`} to="/admin/routes" />
        <Stat icon={<MapPin />} label="Stops" value={d.counts.totalStops} to="/admin/stops" />
        <Stat icon={<Megaphone />} label="Current alerts" value={d.counts.activeAlerts} sub={d.counts.pendingParentLinks ? `${d.counts.pendingParentLinks} parent links to review` : undefined} to="/admin/announcements" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Bus status" as="h2" />
          <CardBody>
            <ul className="space-y-2">
              {d.busStatus
                .filter((s) => s.count > 0)
                .map((s) => (
                  <li key={s.status} className="flex items-center justify-between">
                    <BusStatusBadge status={s.status} />
                    <span className="font-semibold tabular-nums">
                      {s.count} <span className="sr-only">{BUS_STATUS_LABELS[s.status]} buses</span>
                    </span>
                  </li>
                ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Route status" as="h2" />
          <CardBody>
            <ul className="divide-y divide-border">
              {d.routeStatus.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="text-sm">
                    <p className="font-semibold">
                      Route {r.number} – {r.name}
                    </p>
                    <p className="text-muted">{r.busNumbers.length ? `Bus ${r.busNumbers.join(', ')}` : 'No bus assigned'}</p>
                  </div>
                  <ServiceStatusBadge status={r.serviceStatus} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Location providers" as="h2" />
          <CardBody>
            <ProviderList providers={d.providers} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Recent activity" icon={<Activity className="h-4 w-4 text-brand" aria-hidden />} as="h2" />
          <CardBody>
            {d.activity.length === 0 ? (
              <p className="text-sm text-muted">No administrative actions yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {d.activity.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    <p>{a.summary}</p>
                    <p className="text-xs text-muted">
                      {a.actorName ?? 'System'} · {formatRelative(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

export function AdminSimulationPage() {
  const sim = useSimulation();
  const [confirmReset, setConfirmReset] = useState(false);
  const action = useAdminMutation((a: 'start' | 'pause' | 'resume' | 'reset') => api.post(`/admin/simulation/${a}`), {
    success: 'Simulation updated',
  });
  const speed = useAdminMutation((speedMultiplier: number) => api.put('/admin/simulation/speed', { speedMultiplier }), { success: 'Simulation speed changed' });
  const delay = useAdminMutation(() => api.post('/admin/simulation/sample-delay'), { success: 'Sample delay announcement published' });

  if (sim.isPending) return <LoadingBlock />;
  if (sim.isError) return <ErrorState message={errorMessage(sim.error)} onRetry={() => sim.refetch()} />;
  const s = sim.data;
  return (
    <>
      <PageHeader
        title="Demo simulation"
        description="Controls the fictional demo buses. These controls change what every demo viewer sees."
        actions={
          <Badge tone="demo" className="text-sm">
            <FlaskConical className="h-4 w-4" aria-hidden /> DEMO LIVE SIMULATION
          </Badge>
        }
      />
      <Card className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm text-muted">Status</p>
            <p className={cn('text-2xl font-extrabold', s.running ? 'text-success-text' : 'text-warning-text')} role="status">
              {s.running ? 'Running' : 'Paused'}
            </p>
            <p className="text-sm text-muted">
              Simulated time {Math.floor(s.simClockSeconds / 60)} min {s.simClockSeconds % 60} s · last reset {formatRelative(s.resetAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.running ? (
              <Button variant="outline" onClick={() => action.mutate('pause')} loading={action.isPending && action.variables === 'pause'}>
                <Pause className="h-4 w-4" aria-hidden /> Pause
              </Button>
            ) : (
              <Button onClick={() => action.mutate('resume')} loading={action.isPending && action.variables === 'resume'}>
                <Play className="h-4 w-4" aria-hidden /> Resume
              </Button>
            )}
            <Button variant="outline" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="h-4 w-4" aria-hidden /> Reset demo
            </Button>
            <Button variant="outline" onClick={() => delay.mutate(undefined)} loading={delay.isPending}>
              <AlertTriangle className="h-4 w-4" aria-hidden /> Trigger sample delay
            </Button>
          </div>
        </div>
        <div className="mt-5">
          <p className="mb-2 text-sm font-semibold">Simulation speed</p>
          <Segmented label="Simulation speed" value={s.speedMultiplier} onChange={(v) => speed.mutate(v)} options={SIMULATION_SPEEDS.map((n) => ({ value: n as number, label: `${n}×` }))} />
          <p className="mt-2 text-xs text-muted">At higher speeds the countdowns shrink proportionally; schedule adherence is still measured in simulated minutes.</p>
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title="Simulated buses" description="Each bus follows its route geometry independently from a fixed, reproducible starting point." as="h2" />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 font-medium">Bus</th>
                  <th className="py-2 font-medium">Route</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Trip</th>
                  <th className="w-1/3 py-2 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {s.buses.map((b) => (
                  <tr key={b.busId}>
                    <td className="py-2.5 font-semibold">
                      <Link to={`/track/${b.busId}`} className="underline-offset-2 hover:underline">
                        Bus {b.busNumber}
                      </Link>
                    </td>
                    <td className="py-2.5">{b.routeName ?? '—'}</td>
                    <td className="py-2.5">
                      <BusStatusBadge status={b.status} />
                    </td>
                    <td className="py-2.5">
                      #{b.tripNumber}
                      {b.autoRestart ? <span className="text-muted"> · repeats</span> : ''}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={`Bus ${b.busNumber} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(b.progressFraction * 100)}>
                          <div className="h-full rounded-full bg-brand" style={{ width: `${b.progressFraction * 100}%` }} />
                        </div>
                        <span className="w-10 text-right tabular-nums">{Math.round(b.progressFraction * 100)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Buses marked out of service are not simulated. Change a bus’s status on the Buses page to include it.</p>
        </CardBody>
      </Card>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the demo?"
        description="All simulated buses return to their starting positions, speed returns to 1×, and arrival reminders re-arm. This affects every demo viewer."
        confirmLabel="Reset demo"
        destructive={false}
        loading={action.isPending && action.variables === 'reset'}
        onConfirm={() => action.mutate('reset', { onSettled: () => setConfirmReset(false) })}
      />
    </>
  );
}

export function AdminAnalyticsPage() {
  const q = useAdminAnalytics();
  if (q.isPending) return <LoadingBlock />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data;
  return (
    <>
      <PageHeader title="Transportation analytics" description="Snapshot of the current trips." />
      <p className="mb-4 flex items-center gap-2 rounded-xl border border-demo/30 bg-demo-soft px-4 py-2.5 text-sm">
        <FlaskConical className="h-4 w-4 shrink-0 text-demo" aria-hidden /> Simulated data only. These figures describe the fictional demo buses and do not represent any real school district.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat icon={<Activity />} label="On-time buses (now)" value={d.onTimePercentage === null ? '—' : `${d.onTimePercentage}%`} sub="Not late by more than 3 min" />
        <Stat icon={<AlertTriangle />} label="Average deviation" value={d.averageDeviationSeconds === null ? '—' : `${Math.round(d.averageDeviationSeconds / 60)} min`} sub="Positive = behind schedule" />
        <Stat icon={<Bus />} label="Active buses" value={d.activeBuses} />
      </div>
      <Card className="mt-4">
        <CardHeader title="Route completion" as="h2" />
        <CardBody>
          <ul className="space-y-4">
            {d.routes.map((r) => (
              <li key={r.id}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-semibold">
                    Route {r.number} – {r.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {r.status !== 'none' && <BusStatusBadge status={r.status} />}
                    <span className="tabular-nums text-muted">{Math.round(r.progressFraction * 100)}%</span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-label={`Route ${r.number} completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(r.progressFraction * 100)}>
                  <div className="h-full rounded-full bg-brand" style={{ width: `${r.progressFraction * 100}%` }} />
                </div>
                {r.deviationSeconds !== null && <p className="mt-1 text-xs text-muted">{formatDeviation(r.deviationSeconds)}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Generated {formatRelative(d.generatedAt)}. Historical trends would require stored trip history, which this build does not collect.</p>
        </CardBody>
      </Card>
    </>
  );
}
