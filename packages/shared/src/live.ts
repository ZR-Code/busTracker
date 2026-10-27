import type { BusDto, BusLiveDto, RouteServiceStatus } from './api-types';
import { ETA_THRESHOLDS, type BusStatus, type DataSource, type SimulationBusPhase } from './constants';
import { computeEta, confidenceForStop, type EtaResult, type EtaStopInput } from './eta';
import { projectPoint, type RoutePath } from './geo';
import { localDateParts, zonedTimeToUtcMs } from './time';

export const DEFAULT_CRUISE_MPS = 9;

export interface LiveBusRecord {
  id: string;
  busNumber: string;
  schoolId: string;
  routeId: string | null;
  routeName: string | null;
  routeNumber: string | null;
  status: BusStatus;
  dataSource: DataSource;
  capacity: number;
}

export interface LiveRouteStop {
  stopId: string;
  name: string;
  order: number;
  scheduledArrivalTime: string;
  distanceAlongMeters: number;
  scheduleOffsetSeconds: number;
}

export interface LiveRoute {
  timeZone: string;
  active: boolean;
  geometrySource: 'stored' | 'straight_line';
  path: RoutePath | null;
  stops: LiveRouteStop[];
}

export interface LiveLocation {
  busId: string;
  lat: number;
  lng: number;
  heading: number;
  speedMps: number;
  recordedAt: Date;
  dataSource: DataSource;
  tripId: string;
  progressMeters?: number;
  simulation?: {
    phase: SimulationBusPhase;
    dwellRemainingSeconds: number;
    departsInSeconds: number;
    tripScheduledStartMs: number;
    timeScale: number;
    cruiseSpeedMps: number;
    running: boolean;
    speedMultiplier: number;
  };
}

export function toBusDto(b: LiveBusRecord, status: BusStatus = b.status): BusDto {
  return {
    id: b.id,
    busNumber: b.busNumber,
    schoolId: b.schoolId,
    routeId: b.routeId,
    routeName: b.routeName,
    routeNumber: b.routeNumber,
    status,
    dataSource: b.dataSource,
    capacity: b.capacity,
  };
}

export interface BuildBusLiveInput {
  bus: LiveBusRecord;
  route: LiveRoute | undefined;
  loc: LiveLocation | null;
  nowMs: number;
  staleAfterSeconds: number;
  dwellSeconds: number;
  selectedStopId?: string | null;
}

export function buildBusLive({ bus, route, loc, nowMs, staleAfterSeconds, dwellSeconds, selectedStopId }: BuildBusLiveInput): { dto: BusLiveDto; eta: EtaResult } {
  const sim = loc?.simulation;

  let scheduleFor: (offsetSeconds: number, hhmm: string) => number | null;
  if (sim) {
    scheduleFor = (offset) => sim.tripScheduledStartMs + (offset / sim.timeScale) * 1000;
  } else if (route) {
    const today = localDateParts(nowMs, route.timeZone);
    scheduleFor = (_offset, hhmm) => zonedTimeToUtcMs(today, hhmm, route.timeZone);
  } else {
    scheduleFor = () => null;
  }

  const stops: EtaStopInput[] = (route?.stops ?? []).map((s) => ({
    stopId: s.stopId,
    name: s.name,
    order: s.order,
    distanceAlongMeters: s.distanceAlongMeters,
    scheduledAtMs: scheduleFor(s.scheduleOffsetSeconds, s.scheduledArrivalTime),
    dwellSeconds,
  }));

  let progressMeters: number | null = null;
  let offRouteMeters: number | undefined;
  if (loc && route?.path) {
    if (loc.progressMeters !== undefined) progressMeters = loc.progressMeters;
    else {
      const proj = projectPoint(route.path, [loc.lat, loc.lng]);
      progressMeters = proj.distanceAlong;
      offRouteMeters = proj.offsetMeters;
    }
  }

  const terminal: BusStatus | null = bus.status === 'out_of_service' ? 'out_of_service' : sim?.phase === 'completed' ? 'completed' : null;
  const eta = computeEta({
    nowMs,
    stops,
    hasGeometry: route?.geometrySource === 'stored',
    location:
      loc && progressMeters !== null
        ? { progressMeters, speedMps: loc.speedMps, recordedAtMs: loc.recordedAt.getTime(), dataSource: loc.dataSource, offRouteMeters }
        : null,
    busStatus: terminal ?? 'in_transit',
    cruiseSpeedMps: sim?.cruiseSpeedMps ?? DEFAULT_CRUISE_MPS,
    timeScale: sim?.timeScale ?? 1,
    staleAfterSeconds,
    dwellRemainingSeconds: sim?.dwellRemainingSeconds,
    departsInSeconds: sim?.departsInSeconds,
  });
  if (loc && progressMeters === null && eta.freshness === 'unavailable') {
    const ageSeconds = Math.round((nowMs - loc.recordedAt.getTime()) / 1000);
    eta.ageSeconds = ageSeconds;
    eta.freshness = ageSeconds > staleAfterSeconds ? 'stale' : loc.dataSource === 'demo_simulation' ? 'simulated' : loc.dataSource === 'manual_test' ? 'manual' : 'live';
  }

  const status = deriveBusStatus(bus, eta, loc);
  const selected = selectedStopId && stops.some((s) => s.stopId === selectedStopId) ? selectedStopId : null;
  const confidence = selected ? confidenceForStop(eta, selected, route?.geometrySource === 'stored') : eta.confidence;
  const dto: BusLiveDto = {
    bus: toBusDto(bus, status),
    location: loc
      ? { lat: loc.lat, lng: loc.lng, heading: loc.heading, speedMps: loc.speedMps, recordedAt: loc.recordedAt.toISOString(), dataSource: loc.dataSource }
      : null,
    freshness: eta.freshness,
    ageSeconds: eta.ageSeconds,
    movement: eta.movement,
    progressMeters: progressMeters === null ? null : Math.round(progressMeters),
    routeLengthMeters: route?.path ? Math.round(route.path.lengthMeters) : null,
    stops: eta.stops.map((s) => ({
      stopId: s.stopId,
      name: s.name,
      order: s.order,
      state: s.state,
      distanceMeters: s.distanceMeters,
      etaSeconds: s.etaSeconds,
      estimatedAt: s.estimatedAtMs === null ? null : new Date(s.estimatedAtMs).toISOString(),
      scheduledAt: s.scheduledAtMs === null ? null : new Date(s.scheduledAtMs).toISOString(),
      deviationSeconds: s.deviationSeconds,
    })),
    nextStopId: eta.nextStopId,
    selectedStopId: selected,
    adherence: eta.adherence,
    deviationSeconds: eta.deviationSeconds,
    uncertain: eta.uncertain,
    confidence,
    tripId: loc?.tripId ?? null,
    simulation: sim ? { phase: sim.phase, running: sim.running, speedMultiplier: sim.speedMultiplier } : null,
    serverTime: new Date(nowMs).toISOString(),
  };
  return { dto, eta };
}

export function deriveBusStatus(bus: LiveBusRecord, eta: EtaResult, loc: LiveLocation | null): BusStatus {
  if (bus.status === 'out_of_service') return 'out_of_service';
  const phase = loc?.simulation?.phase;
  if (phase === 'completed') return 'completed';
  if (phase === 'waiting') return 'scheduled';
  if (!loc || eta.freshness === 'unavailable') return bus.status === 'completed' ? 'completed' : 'scheduled';
  if ((eta.deviationSeconds ?? 0) >= ETA_THRESHOLDS.delayedSeconds) return 'delayed';
  const next = eta.stops.find((s) => s.stopId === eta.nextStopId);
  if (phase === 'dwelling' || next?.state === 'at_stop') return 'at_stop';
  if (next?.state === 'approaching') return 'approaching_stop';
  if (!next) return 'completed';
  return 'in_transit';
}

export function serviceStatusFor(route: { active: boolean }, busStatuses: BusStatus[], disruption: 'delayed' | 'disrupted' | undefined): RouteServiceStatus {
  if (!route.active) return 'inactive';
  if (disruption === 'disrupted') return 'disrupted';
  if (disruption === 'delayed' || busStatuses.includes('delayed')) return 'delayed';
  const operating = busStatuses.filter((s) => s !== 'out_of_service');
  if (operating.length > 0 && operating.every((s) => s === 'completed')) return 'completed';
  return 'normal';
}
