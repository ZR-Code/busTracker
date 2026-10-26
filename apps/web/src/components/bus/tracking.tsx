import { AlertTriangle, CheckCircle2, ChevronRight, CircleDot, Clock, FlaskConical, Gauge, MapPin, PauseCircle, Ruler, SignalLow, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  formatClock,
  formatDeviation,
  formatDistance,
  formatEta,
  formatRelative,
  formatSpeed,
  type BusLiveDto,
  type DistanceUnits,
  type StopEtaDto,
} from '@busbuddy/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { AdherenceBadge, BusStatusBadge, ConfidenceMeter, FreshnessBadge } from './status';

export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function DataSourceBanner({ live, className }: { live: Pick<BusLiveDto, 'freshness' | 'ageSeconds' | 'location' | 'simulation' | 'bus'>; className?: string }) {
  const paused = live.simulation && !live.simulation.running;
  if (live.bus.status === 'out_of_service') {
    return (
      <Banner tone="danger" icon={<WifiOff className="h-5 w-5" aria-hidden />} title={`Bus ${live.bus.busNumber} is out of service`} className={className}>
        This bus is not running. {live.location ? `Last known position ${formatRelative(live.location.recordedAt)}.` : 'No recent position is available.'} Check announcements for the replacement bus.
      </Banner>
    );
  }
  if (live.freshness === 'stale') {
    return (
      <Banner tone="warning" icon={<SignalLow className="h-5 w-5" aria-hidden />} title="Location update delayed" className={className}>
        {paused ? 'The demo simulation is paused. ' : ''}The last location was received {live.location ? formatRelative(live.location.recordedAt) : 'a while ago'}
        {live.location ? ` (${formatClock(live.location.recordedAt)})` : ''}. The bus may have moved since then, so arrival estimates are less reliable.
      </Banner>
    );
  }
  if (live.freshness === 'unavailable') {
    return (
      <Banner tone="neutral" icon={<WifiOff className="h-5 w-5" aria-hidden />} title="Location unavailable" className={className}>
        No location has been reported for this bus yet. Scheduled times are shown instead.
      </Banner>
    );
  }
  if (live.freshness === 'simulated') {
    return (
      <Banner tone="demo" icon={<FlaskConical className="h-5 w-5" aria-hidden />} title="DEMO LIVE SIMULATION" className={className}>
        {paused
          ? 'The simulation is paused by an administrator. '
          : `Bus movement is simulated${live.simulation && live.simulation.speedMultiplier > 1 ? ` at ${live.simulation.speedMultiplier}× speed` : ''} along a fictional route. `}
        This is not a real vehicle location.
      </Banner>
    );
  }
  if (live.freshness === 'manual') {
    return (
      <Banner tone="info" icon={<FlaskConical className="h-5 w-5" aria-hidden />} title="Manual test location" className={className}>
        This position was entered by an administrator for testing. It is not live GPS.
      </Banner>
    );
  }
  return null;
}

function Banner({ tone, icon, title, children, className }: { tone: 'demo' | 'warning' | 'danger' | 'neutral' | 'info'; icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  const tones = {
    demo: 'border-demo/30 bg-demo-soft text-text',
    warning: 'border-warning/40 bg-warning-soft text-text',
    danger: 'border-danger/30 bg-danger-soft text-text',
    neutral: 'border-border bg-surface-muted text-text',
    info: 'border-brand/25 bg-info-soft text-text',
  } as const;
  const iconTone = { demo: 'text-demo', warning: 'text-warning-text', danger: 'text-danger-text', neutral: 'text-muted', info: 'text-brand-strong' } as const;
  return (
    <div role="status" className={cn('flex gap-3 rounded-xl border px-4 py-3', tones[tone], className)}>
      <span className={cn('mt-0.5', iconTone[tone])}>{icon}</span>
      <div className="text-sm">
        <p className={cn('font-bold', tone === 'demo' && 'tracking-wide text-demo')}>{title}</p>
        <p className="mt-0.5 text-text/90">{children}</p>
      </div>
    </div>
  );
}

export function EtaCard({ live, stopId, units, className, heading = 'Next pickup' }: { live: BusLiveDto; stopId: string | null; units: DistanceUnits; className?: string; heading?: string }) {
  const stop = live.stops.find((s) => s.stopId === stopId) ?? live.stops.find((s) => s.stopId === live.nextStopId) ?? null;
  const unreliable = live.uncertain || live.freshness === 'stale';
  let big: string;
  let sub: string;
  if (!stop) {
    big = '—';
    sub = 'Select a stop to see its arrival estimate.';
  } else if (live.bus.status === 'out_of_service') {
    big = 'No service';
    sub = 'This bus is out of service.';
  } else if (live.bus.status === 'completed' || stop.state === 'passed') {
    big = live.bus.status === 'completed' ? 'Completed' : 'Departed';
    sub = live.bus.status === 'completed' ? 'This bus has finished its route.' : 'The bus has already left this stop.';
  } else if (stop.state === 'at_stop') {
    big = 'At stop';
    sub = 'The bus is boarding at this stop now.';
  } else if (stop.etaSeconds === null) {
    big = 'Unknown';
    sub = 'Not enough location data for an estimate.';
  } else {
    big = formatEta(stop.etaSeconds);
    sub = `Expected around ${formatClock(stop.estimatedAt)}`;
  }
  const minutesForSr = stop?.etaSeconds != null ? Math.max(1, Math.round(stop.etaSeconds / 60)) : null;

  return (
    <Card role="region" aria-label={`${heading}: ${stop?.name ?? 'no stop selected'}`} className={cn('overflow-hidden', className)}>
      <div className="bg-[#16324F] px-5 pb-5 pt-4 text-white dark:bg-[#0f2236]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{heading}</p>
          <span className="text-xs text-white/70">Bus {live.bus.busNumber}</span>
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-base font-semibold">
          <MapPin className="h-4 w-4 text-[#F59E0B]" aria-hidden />
          {stop?.name ?? 'No stop selected'}
        </p>
        <div className="mt-3 flex items-end gap-3">
          <p className="text-5xl font-extrabold leading-none tracking-tight tabular-nums" aria-hidden>
            {big}
          </p>
          {unreliable && stop?.etaSeconds != null && (
            <span className="mb-1 rounded-full bg-[#F59E0B] px-2 py-0.5 text-xs font-bold text-[#3b2503]">Estimate uncertain</span>
          )}
        </div>
        <p className="mt-2 text-sm text-white/80">{sub}</p>
        <p className="sr-only" aria-live="polite">
          {stop
            ? minutesForSr !== null && stop.state !== 'passed' && stop.state !== 'at_stop'
              ? `Bus ${live.bus.busNumber} estimated to arrive at ${stop.name} in about ${minutesForSr} minute${minutesForSr === 1 ? '' : 's'}.`
              : `${big} at ${stop.name}.`
            : ''}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-sm">
        <div>
          <dt className="text-muted">Scheduled</dt>
          <dd className="font-semibold">{formatClock(stop?.scheduledAt ?? null)}</dd>
        </div>
        <div>
          <dt className="text-muted">Distance</dt>
          <dd className="font-semibold">{stop && stop.state !== 'passed' ? formatDistance(stop.distanceMeters, units) : '—'}</dd>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2">
          <BusStatusBadge status={live.bus.status} />
          {live.bus.status !== 'completed' && live.bus.status !== 'out_of_service' && <AdherenceBadge adherence={live.adherence} />}
          <FreshnessBadge freshness={live.freshness} />
        </div>
        {live.deviationSeconds !== null && live.bus.status !== 'completed' && (
          <div className="col-span-2 text-muted">{formatDeviation(live.deviationSeconds)}</div>
        )}
        {stop && stop.etaSeconds !== null && stop.state !== 'passed' && (
          <div className="col-span-2">
            <ConfidenceMeter {...live.confidence} />
          </div>
        )}
      </dl>
      <p className="border-t border-border px-5 py-2.5 text-xs text-muted">Arrival times are estimates and can change with traffic and weather.</p>
    </Card>
  );
}

const stateText: Record<StopEtaDto['state'], string> = {
  passed: 'Passed',
  at_stop: 'Bus at stop',
  approaching: 'Approaching',
  next: 'Next stop',
  upcoming: 'Upcoming',
  unknown: 'Status unknown',
};

export function RouteTimeline({
  live,
  selectedStopId,
  onSelect,
  units,
  descriptions,
}: {
  live: BusLiveDto;
  selectedStopId: string | null;
  onSelect?: (stopId: string) => void;
  units: DistanceUnits;
  descriptions?: Record<string, string>;
}) {
  if (live.stops.length === 0) return <p className="text-sm text-muted">This bus has no route stops assigned.</p>;
  return (
    <ol className="relative" aria-label={`Stops for bus ${live.bus.busNumber}`}>
      {live.stops.map((s, i) => {
        const selected = s.stopId === selectedStopId;
        const passed = s.state === 'passed';
        const active = s.state === 'approaching' || s.state === 'at_stop' || s.state === 'next';
        const last = i === live.stops.length - 1;
        const Icon = passed ? CheckCircle2 : s.state === 'at_stop' ? CircleDot : active ? MapPin : Clock;
        const content = (
          <>
            <span className="relative flex w-8 shrink-0 flex-col items-center self-stretch" aria-hidden>
              <span className={cn('z-10 flex h-7 w-7 items-center justify-center rounded-full border-2', passed ? 'border-border bg-surface-muted text-muted' : active ? 'border-brand bg-brand text-white' : 'border-border bg-surface text-muted')}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              {!last && <span className={cn('absolute top-7 h-[calc(100%-0.25rem)] w-0.5', passed ? 'bg-border' : 'bg-brand/40')} />}
            </span>
            <span className="min-w-0 flex-1 pb-4 text-left">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn('font-semibold', passed && 'text-muted line-through decoration-muted/50')}>{s.name}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
                    s.state === 'approaching' || s.state === 'at_stop' ? 'bg-success-soft text-success-text' : s.state === 'next' ? 'bg-info-soft text-brand-strong' : 'bg-surface-muted text-muted',
                  )}
                >
                  {stateText[s.state]}
                </span>
              </span>
              <span className="mt-0.5 block text-sm text-muted">
                Scheduled {formatClock(s.scheduledAt)}
                {!passed && s.estimatedAt && ` · Est. ${formatClock(s.estimatedAt)}`}
                {!passed && s.etaSeconds !== null && ` (${formatEta(s.etaSeconds)})`}
                {!passed && s.distanceMeters !== null && s.state !== 'at_stop' && ` · ${formatDistance(s.distanceMeters, units)}`}
              </span>
              {selected && descriptions?.[s.stopId] && <span className="mt-1 block text-sm text-text">{descriptions[s.stopId]}</span>}
            </span>
            {onSelect && <ChevronRight className={cn('mt-1.5 h-4 w-4 shrink-0', selected ? 'text-brand' : 'text-muted/50')} aria-hidden />}
          </>
        );
        return (
          <li key={s.stopId}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(s.stopId)}
                aria-pressed={selected}
                className={cn('-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-xl px-2 pt-1 text-left transition-colors hover:bg-surface-muted', selected && 'bg-info-soft ring-1 ring-brand/30')}
              >
                {content}
              </button>
            ) : (
              <div className="flex items-start gap-3 pt-1">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function BusDetails({ live, units }: { live: BusLiveDto; units: DistanceUnits }) {
  const now = useNow();
  const progress = live.progressMeters !== null && live.routeLengthMeters ? Math.min(1, live.progressMeters / live.routeLengthMeters) : live.bus.status === 'completed' ? 1 : 0;
  return (
    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
      <Detail icon={<Gauge className="h-4 w-4" aria-hidden />} label="Speed" value={live.location && live.freshness !== 'stale' ? formatSpeed(live.location.speedMps, units) : '—'} />
      <Detail
        icon={<Clock className="h-4 w-4" aria-hidden />}
        label="Last update"
        value={live.location ? `${formatRelative(live.location.recordedAt, now)}` : 'Never'}
        hint={live.location ? formatClock(live.location.recordedAt) : undefined}
      />
      <Detail icon={<Ruler className="h-4 w-4" aria-hidden />} label="Route length" value={formatDistance(live.routeLengthMeters, units)} />
      <div className="col-span-2 sm:col-span-3">
        <dt className="mb-1.5 flex items-center justify-between text-muted">
          <span>Route progress</span>
          <span className="font-semibold text-text">{Math.round(progress * 100)}%</span>
        </dt>
        <dd>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Route progress">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${progress * 100}%` }} />
          </div>
        </dd>
      </div>
      {live.simulation && !live.simulation.running && (
        <div className="col-span-2 flex items-center gap-2 text-warning-text sm:col-span-3">
          <PauseCircle className="h-4 w-4" aria-hidden /> Simulation paused
        </div>
      )}
      {live.movement === 'stopped' && live.freshness !== 'stale' && (
        <div className="col-span-2 flex items-center gap-2 text-muted sm:col-span-3">
          <AlertTriangle className="h-4 w-4" aria-hidden /> Bus is stopped between stops (traffic or a signal). Location is up to date.
        </div>
      )}
    </dl>
  );
}

function Detail({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-semibold">
        {value}
        {hint && <span className="ml-1 font-normal text-muted">({hint})</span>}
      </dd>
    </div>
  );
}
