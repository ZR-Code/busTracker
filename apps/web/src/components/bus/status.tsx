import { AlertTriangle, Ban, CheckCircle2, CircleDot, Clock, FlaskConical, MapPin, Navigation, Radio, SignalLow, WifiOff, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import { BUS_STATUS_LABELS, FRESHNESS_LABELS, type BusStatus, type LocationFreshness, type RouteServiceStatus } from '@busbuddy/shared';
import type { Adherence, ConfidenceLevel } from '@busbuddy/shared';
import { Badge, type Tone } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

const statusMeta: Record<BusStatus, { tone: Tone; icon: ReactNode }> = {
  scheduled: { tone: 'neutral', icon: <Clock className="h-3.5 w-3.5" aria-hidden /> },
  in_transit: { tone: 'info', icon: <Navigation className="h-3.5 w-3.5" aria-hidden /> },
  approaching_stop: { tone: 'success', icon: <MapPin className="h-3.5 w-3.5" aria-hidden /> },
  at_stop: { tone: 'success', icon: <CircleDot className="h-3.5 w-3.5" aria-hidden /> },
  delayed: { tone: 'warning', icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> },
  out_of_service: { tone: 'danger', icon: <Wrench className="h-3.5 w-3.5" aria-hidden /> },
  completed: { tone: 'neutral', icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
};

export function BusStatusBadge({ status, className }: { status: BusStatus; className?: string }) {
  const m = statusMeta[status];
  return (
    <Badge tone={m.tone} className={className}>
      {m.icon}
      {BUS_STATUS_LABELS[status]}
    </Badge>
  );
}

const freshnessMeta: Record<LocationFreshness, { tone: Tone; icon: ReactNode }> = {
  live: { tone: 'success', icon: <Radio className="h-3.5 w-3.5" aria-hidden /> },
  simulated: { tone: 'demo', icon: <FlaskConical className="h-3.5 w-3.5" aria-hidden /> },
  manual: { tone: 'info', icon: <FlaskConical className="h-3.5 w-3.5" aria-hidden /> },
  stale: { tone: 'warning', icon: <SignalLow className="h-3.5 w-3.5" aria-hidden /> },
  unavailable: { tone: 'neutral', icon: <WifiOff className="h-3.5 w-3.5" aria-hidden /> },
};

export function FreshnessBadge({ freshness, className }: { freshness: LocationFreshness; className?: string }) {
  const m = freshnessMeta[freshness];
  return (
    <Badge tone={m.tone} className={cn(freshness === 'simulated' && 'tracking-wide', className)}>
      {m.icon}
      {FRESHNESS_LABELS[freshness]}
    </Badge>
  );
}

const adherenceMeta: Record<Adherence, { label: string; tone: Tone }> = {
  early: { label: 'Early', tone: 'info' },
  on_time: { label: 'On time', tone: 'success' },
  late: { label: 'Late', tone: 'warning' },
  unknown: { label: 'Schedule unknown', tone: 'neutral' },
};

export function AdherenceBadge({ adherence }: { adherence: Adherence }) {
  const m = adherenceMeta[adherence];
  return (
    <Badge tone={m.tone}>
      {adherence === 'late' ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : adherence === 'on_time' ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : <Clock className="h-3.5 w-3.5" aria-hidden />}
      {m.label}
    </Badge>
  );
}

const serviceMeta: Record<RouteServiceStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  normal: { label: 'Normal service', tone: 'success', icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
  delayed: { label: 'Delays', tone: 'warning', icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> },
  disrupted: { label: 'Disrupted', tone: 'danger', icon: <Ban className="h-3.5 w-3.5" aria-hidden /> },
  inactive: { label: 'Not running', tone: 'neutral', icon: <Ban className="h-3.5 w-3.5" aria-hidden /> },
  completed: { label: 'Completed today', tone: 'neutral', icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
};

export function ServiceStatusBadge({ status }: { status: RouteServiceStatus }) {
  const m = serviceMeta[status];
  return (
    <Badge tone={m.tone}>
      {m.icon}
      {m.label}
    </Badge>
  );
}

const confidenceLabel: Record<ConfidenceLevel, string> = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' };

export function ConfidenceMeter({ level, score, reasons }: { level: ConfidenceLevel; score: number; reasons: string[] }) {
  const bars = level === 'high' ? 3 : level === 'medium' ? 2 : level === 'low' ? 1 : 0;
  const color = level === 'high' ? 'bg-success' : level === 'medium' ? 'bg-warning' : 'bg-danger';
  return (
    <div className="flex items-center gap-2" title={reasons.join('\n')}>
      <span className="flex items-end gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn('w-1.5 rounded-sm', i === 0 ? 'h-2' : i === 1 ? 'h-3' : 'h-4', i < bars ? color : 'bg-border')} />
        ))}
      </span>
      <span className="text-sm">
        <span className="font-semibold">{confidenceLabel[level]} confidence</span>
        <span className="sr-only"> (score {score} of 100). {reasons.join('. ')}</span>
      </span>
    </div>
  );
}
