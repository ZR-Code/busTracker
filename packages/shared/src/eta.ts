import { ETA_THRESHOLDS, type BusStatus, type DataSource, type LocationFreshness } from './constants';

export type StopState = 'passed' | 'at_stop' | 'approaching' | 'next' | 'upcoming' | 'unknown';
export type Adherence = 'early' | 'on_time' | 'late' | 'unknown';
export type Movement = 'moving' | 'stopped_at_stop' | 'stopped' | 'waiting' | 'unknown';
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export interface EtaStopInput {
  stopId: string;
  name: string;
  order: number;
  distanceAlongMeters: number;
  scheduledAtMs: number | null;
  dwellSeconds: number;
}

export interface EtaLocationInput {
  progressMeters: number;
  speedMps: number;
  recordedAtMs: number;
  dataSource: DataSource;
  offRouteMeters?: number;
}

export interface EtaInput {
  nowMs: number;
  stops: EtaStopInput[];
  hasGeometry: boolean;
  location: EtaLocationInput | null;
  busStatus: BusStatus;
  cruiseSpeedMps: number;
  timeScale: number;
  staleAfterSeconds: number;
  dwellRemainingSeconds?: number;
  departsInSeconds?: number;
}

export interface StopEta {
  stopId: string;
  name: string;
  order: number;
  state: StopState;
  distanceMeters: number | null;
  etaSeconds: number | null;
  estimatedAtMs: number | null;
  scheduledAtMs: number | null;
  deviationSeconds: number | null;
}

export interface Confidence {
  level: ConfidenceLevel;
  score: number;
  reasons: string[];
}

export interface EtaResult {
  freshness: LocationFreshness;
  ageSeconds: number | null;
  movement: Movement;
  stops: StopEta[];
  nextStopId: string | null;
  adherence: Adherence;
  deviationSeconds: number | null;
  uncertain: boolean;
  confidence: Confidence;
}

export function classifyFreshness(
  location: Pick<EtaLocationInput, 'recordedAtMs' | 'dataSource'> | null,
  nowMs: number,
  staleAfterSeconds: number,
): { freshness: LocationFreshness; ageSeconds: number | null } {
  if (!location) return { freshness: 'unavailable', ageSeconds: null };
  const ageSeconds = Math.max(0, Math.round((nowMs - location.recordedAtMs) / 1000));
  if (ageSeconds > staleAfterSeconds) return { freshness: 'stale', ageSeconds };
  const byOrigin: Record<DataSource, LocationFreshness> = {
    district_gps: 'live',
    demo_simulation: 'simulated',
    manual_test: 'manual',
  };
  return { freshness: byOrigin[location.dataSource], ageSeconds };
}

export function effectiveSpeed(currentSpeedMps: number, cruiseSpeedMps: number): number {
  const cruise = Math.max(1, cruiseSpeedMps);
  if (!Number.isFinite(currentSpeedMps) || currentSpeedMps < ETA_THRESHOLDS.stationarySpeedMps) return cruise;
  return 0.4 * Math.min(currentSpeedMps, cruise * 1.5) + 0.6 * cruise;
}

export function classifyAdherence(deviationSeconds: number | null): Adherence {
  if (deviationSeconds === null) return 'unknown';
  if (deviationSeconds > ETA_THRESHOLDS.lateSeconds) return 'late';
  if (deviationSeconds < ETA_THRESHOLDS.earlySeconds) return 'early';
  return 'on_time';
}

export function computeConfidence(args: {
  freshness: LocationFreshness;
  ageSeconds: number | null;
  hasGeometry: boolean;
  movement: Movement;
  offRouteMeters?: number;
  distanceToTargetMeters?: number | null;
  hasEta: boolean;
}): Confidence {
  const reasons: string[] = [];
  if (args.freshness === 'unavailable' || !args.hasEta) {
    return { level: 'none', score: 0, reasons: ['Not enough location data for an arrival estimate'] };
  }
  let score = 100;
  if (args.freshness === 'stale') {
    score -= 50;
    reasons.push(`Last location update was ${formatAge(args.ageSeconds ?? 0)} ago`);
  }
  if (!args.hasGeometry) {
    score -= 30;
    reasons.push('Route geometry unavailable; using straight-line distance');
  }
  if (args.movement === 'stopped') {
    score -= 15;
    reasons.push('Bus is stationary away from a stop');
  }
  if (args.movement === 'waiting') {
    score -= 10;
    reasons.push('Bus has not departed yet');
  }
  if (args.freshness === 'manual') {
    score -= 10;
    reasons.push('Location was entered manually for testing');
  }
  if ((args.offRouteMeters ?? 0) > 100) {
    score -= 20;
    reasons.push('Bus is away from the planned route');
  }
  if ((args.distanceToTargetMeters ?? 0) > 5000) {
    score -= 10;
    reasons.push('Long distance remaining; traffic can change the estimate');
  }
  if (reasons.length === 0) reasons.push('Recent location, moving along known route geometry');
  score = Math.max(5, Math.min(100, score));
  const level: ConfidenceLevel = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';
  return { level, score, reasons };
}

function formatAge(seconds: number): string {
  if (seconds < 90) return `${seconds} seconds`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round(seconds / 3600)} hours`;
}

export function computeEta(input: EtaInput): EtaResult {
  const { freshness, ageSeconds } = classifyFreshness(input.location, input.nowMs, input.staleAfterSeconds);
  const timeScale = input.timeScale > 0 ? input.timeScale : 1;
  const terminal = input.busStatus === 'completed' || input.busStatus === 'out_of_service';

  const unknownStops = (state: StopState): StopEta[] =>
    input.stops.map((s) => ({
      stopId: s.stopId,
      name: s.name,
      order: s.order,
      state,
      distanceMeters: null,
      etaSeconds: null,
      estimatedAtMs: null,
      scheduledAtMs: s.scheduledAtMs,
      deviationSeconds: null,
    }));

  if (!input.location || freshness === 'unavailable' || terminal) {
    const state: StopState = input.busStatus === 'completed' ? 'passed' : 'unknown';
    return {
      freshness,
      ageSeconds,
      movement: 'unknown',
      stops: unknownStops(state),
      nextStopId: null,
      adherence: 'unknown',
      deviationSeconds: null,
      uncertain: true,
      confidence: computeConfidence({ freshness: 'unavailable', ageSeconds, hasGeometry: input.hasGeometry, movement: 'unknown', hasEta: false }),
    };
  }

  const loc = input.location;
  const speed = effectiveSpeed(loc.speedMps, input.cruiseSpeedMps);
  const waiting = (input.departsInSeconds ?? 0) > 0;
  const nearestStopGap = Math.min(...input.stops.map((s) => Math.abs(s.distanceAlongMeters - loc.progressMeters)));
  const movement: Movement = waiting
    ? 'waiting'
    : loc.speedMps >= ETA_THRESHOLDS.stationarySpeedMps
      ? 'moving'
      : nearestStopGap <= ETA_THRESHOLDS.atStopMeters
        ? 'stopped_at_stop'
        : 'stopped';

  let nextAssigned = false;
  let accumulatedDwell = 0;
  const stops: StopEta[] = [];
  for (const s of input.stops) {
    const remaining = s.distanceAlongMeters - loc.progressMeters;
    const atThisStop = movement === 'stopped_at_stop' && Math.abs(remaining) <= ETA_THRESHOLDS.atStopMeters;
    const departed = remaining < 0 && movement === 'moving';
    if (remaining < -ETA_THRESHOLDS.passedToleranceMeters || departed) {
      stops.push({
        stopId: s.stopId,
        name: s.name,
        order: s.order,
        state: 'passed',
        distanceMeters: 0,
        etaSeconds: null,
        estimatedAtMs: null,
        scheduledAtMs: s.scheduledAtMs,
        deviationSeconds: null,
      });
      continue;
    }
    const distanceMeters = Math.max(0, remaining);
    const travelSeconds = distanceMeters / speed;
    const scheduleSeconds = (input.departsInSeconds ?? 0) + (atThisStop ? 0 : (input.dwellRemainingSeconds ?? 0)) + accumulatedDwell + travelSeconds;
    const etaSeconds = Math.max(atThisStop ? 0 : 1, Math.round(scheduleSeconds / timeScale));
    const estimatedAtMs = input.nowMs + etaSeconds * 1000;
    const deviationSeconds =
      s.scheduledAtMs === null ? null : Math.round(scheduleSeconds - ((s.scheduledAtMs - input.nowMs) / 1000) * timeScale);

    let state: StopState;
    if (atThisStop) state = 'at_stop';
    else if (!nextAssigned) state = distanceMeters <= ETA_THRESHOLDS.approachingMeters && !waiting ? 'approaching' : 'next';
    else state = 'upcoming';
    nextAssigned = true;

    stops.push({ stopId: s.stopId, name: s.name, order: s.order, state, distanceMeters: Math.round(distanceMeters), etaSeconds, estimatedAtMs, scheduledAtMs: s.scheduledAtMs, deviationSeconds });
    accumulatedDwell += atThisStop ? 0 : s.dwellSeconds;
  }

  const next = stops.find((s) => s.state !== 'passed') ?? null;
  const deviationSeconds = next?.deviationSeconds ?? null;
  const uncertain = freshness === 'stale' || !input.hasGeometry;
  return {
    freshness,
    ageSeconds,
    movement,
    stops,
    nextStopId: next?.stopId ?? null,
    adherence: classifyAdherence(deviationSeconds),
    deviationSeconds,
    uncertain,
    confidence: computeConfidence({
      freshness,
      ageSeconds,
      hasGeometry: input.hasGeometry,
      movement,
      offRouteMeters: loc.offRouteMeters,
      distanceToTargetMeters: next?.distanceMeters ?? null,
      hasEta: next !== null,
    }),
  };
}

export function confidenceForStop(result: EtaResult, stopId: string, hasGeometry: boolean): Confidence {
  const stop = result.stops.find((s) => s.stopId === stopId);
  return computeConfidence({
    freshness: result.freshness,
    ageSeconds: result.ageSeconds,
    hasGeometry,
    movement: result.movement,
    distanceToTargetMeters: stop?.distanceMeters ?? null,
    hasEta: stop?.etaSeconds !== null && stop?.etaSeconds !== undefined,
  });
}
