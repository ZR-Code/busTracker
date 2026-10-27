import { buildRoutePath, positionAlong, type LatLngTuple, type RoutePath } from './geo';
import type { SimulationBusPhase } from './constants';

export interface SimRouteStop {
  stopId: string;
  distanceAlongMeters: number;
  scheduleOffsetSeconds: number;
}

export interface SimRoute {
  id: string;
  path: RoutePath;
  stops: SimRouteStop[];
}

export interface SimBusConfig {
  busId: string;
  routeId: string;
  cruiseSpeedMps: number;
  speedFactor: number;
  initialProgressMeters: number;
  initialPhase: SimulationBusPhase;
  initialDelaySeconds: number;
  startDelaySeconds: number;
  autoRestart: boolean;
}

export interface SimBusState {
  busId: string;
  routeId: string;
  phase: SimulationBusPhase;
  progressMeters: number;
  speedMps: number;
  heading: number;
  segmentIndex: number;
  nextStopIndex: number;
  dwellRemainingSeconds: number;
  waitRemainingSeconds: number;
  tripNumber: number;
  tripScheduledStartSec: number;
}

export type SimEvent =
  | { type: 'trip_started'; busId: string; tripNumber: number }
  | { type: 'arrived'; busId: string; stopId: string; tripNumber: number }
  | { type: 'departed'; busId: string; stopId: string; tripNumber: number }
  | { type: 'completed'; busId: string; tripNumber: number };

export interface EngineOptions {
  dwellSeconds: number;
  restartDelaySeconds: number;
  maxStepSeconds?: number;
}

const ACCELERATION = 1.0;
const BRAKING = 1.2;
const MIN_APPROACH_SPEED = 1.5;

export function scheduleSecondsAt(route: SimRoute, distance: number): number {
  const stops = route.stops;
  if (stops.length === 0) return 0;
  if (distance <= stops[0]!.distanceAlongMeters) return stops[0]!.scheduleOffsetSeconds;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (distance <= b.distanceAlongMeters) {
      const span = b.distanceAlongMeters - a.distanceAlongMeters;
      const t = span > 0 ? (distance - a.distanceAlongMeters) / span : 1;
      return a.scheduleOffsetSeconds + t * (b.scheduleOffsetSeconds - a.scheduleOffsetSeconds);
    }
  }
  return stops[stops.length - 1]!.scheduleOffsetSeconds;
}

export function nextStopIndexFor(route: SimRoute, progress: number): number {
  const idx = route.stops.findIndex((s) => s.distanceAlongMeters > progress + 0.5);
  return idx === -1 ? route.stops.length : idx;
}

export function makeSimRoute(id: string, geometry: LatLngTuple[], stops: SimRouteStop[]): SimRoute {
  return { id, path: buildRoutePath(geometry), stops };
}

export class SimulationEngine {
  simClockSeconds = 0;
  private readonly routes = new Map<string, SimRoute>();
  private readonly configs = new Map<string, SimBusConfig>();
  private readonly states = new Map<string, SimBusState>();
  private readonly opts: Required<EngineOptions>;

  constructor(opts: EngineOptions) {
    this.opts = { maxStepSeconds: 1, ...opts };
  }

  load(routes: SimRoute[], configs: SimBusConfig[], persisted: Partial<Record<string, SimBusState>> = {}): void {
    this.routes.clear();
    for (const r of routes) this.routes.set(r.id, r);
    const keep = new Map(this.states);
    this.configs.clear();
    this.states.clear();
    for (const c of configs) {
      const route = this.routes.get(c.routeId);
      if (!route || route.stops.length === 0) continue;
      this.configs.set(c.busId, c);
      const prior = keep.get(c.busId) ?? persisted[c.busId];
      if (prior && prior.routeId === c.routeId && prior.progressMeters <= route.path.lengthMeters + 1) {
        let nextStopIndex = Math.min(prior.nextStopIndex, route.stops.length);
        const target = route.stops[nextStopIndex];
        if (prior.phase === 'moving' && target && target.distanceAlongMeters < prior.progressMeters - 1) nextStopIndex = nextStopIndexFor(route, prior.progressMeters);
        this.states.set(c.busId, { ...prior, nextStopIndex });
      } else {
        this.states.set(c.busId, this.initialState(c, route));
      }
    }
  }

  initialState(c: SimBusConfig, route: SimRoute): SimBusState {
    const progress = Math.max(0, Math.min(route.path.lengthMeters, c.initialProgressMeters));
    const pos = positionAlong(route.path, progress);
    const phase = c.initialPhase;
    const tripScheduledStartSec =
      phase === 'waiting' ? this.simClockSeconds + c.startDelaySeconds : this.simClockSeconds - scheduleSecondsAt(route, progress) - c.initialDelaySeconds;
    return {
      busId: c.busId,
      routeId: c.routeId,
      phase,
      progressMeters: progress,
      speedMps: phase === 'moving' ? c.cruiseSpeedMps * c.speedFactor * 0.8 : 0,
      heading: pos.heading,
      segmentIndex: pos.segmentIndex,
      nextStopIndex: nextStopIndexFor(route, progress - (phase === 'waiting' ? 1 : 0)),
      dwellRemainingSeconds: 0,
      waitRemainingSeconds: phase === 'waiting' ? c.startDelaySeconds : phase === 'completed' && c.autoRestart ? this.opts.restartDelaySeconds : 0,
      tripNumber: 1,
      tripScheduledStartSec,
    };
  }

  reset(): void {
    this.simClockSeconds = 0;
    for (const [busId, c] of this.configs) {
      const route = this.routes.get(c.routeId);
      if (route) this.states.set(busId, this.initialState(c, route));
    }
  }

  getState(busId: string): SimBusState | undefined {
    return this.states.get(busId);
  }

  getRoute(routeId: string): SimRoute | undefined {
    return this.routes.get(routeId);
  }

  getConfig(busId: string): SimBusConfig | undefined {
    return this.configs.get(busId);
  }

  allStates(): SimBusState[] {
    return [...this.states.values()];
  }

  position(busId: string): { lat: number; lng: number; heading: number } | null {
    const s = this.states.get(busId);
    const route = s && this.routes.get(s.routeId);
    if (!s || !route) return null;
    const p = positionAlong(route.path, s.progressMeters);
    return { lat: p.lat, lng: p.lng, heading: s.heading };
  }

  step(dtSeconds: number): SimEvent[] {
    const events: SimEvent[] = [];
    let remaining = Math.max(0, dtSeconds);
    while (remaining > 1e-9) {
      const dt = Math.min(this.opts.maxStepSeconds, remaining);
      remaining -= dt;
      this.simClockSeconds += dt;
      for (const s of this.states.values()) this.stepBus(s, dt, events);
    }
    return events;
  }

  private stepBus(s: SimBusState, dt: number, events: SimEvent[]): void {
    const c = this.configs.get(s.busId);
    const route = this.routes.get(s.routeId);
    if (!c || !route) return;

    switch (s.phase) {
      case 'out_of_service':
        return;
      case 'completed':
        if (!c.autoRestart) return;
        s.waitRemainingSeconds -= dt;
        if (s.waitRemainingSeconds <= 0) {
          s.phase = 'moving';
          s.progressMeters = 0;
          s.nextStopIndex = 0;
          s.speedMps = 0;
          s.tripNumber += 1;
          s.tripScheduledStartSec = this.simClockSeconds;
          s.waitRemainingSeconds = 0;
          events.push({ type: 'trip_started', busId: s.busId, tripNumber: s.tripNumber });
        }
        return;
      case 'waiting':
        s.waitRemainingSeconds -= dt;
        if (s.waitRemainingSeconds <= 0) {
          s.waitRemainingSeconds = 0;
          s.phase = 'moving';
          events.push({ type: 'trip_started', busId: s.busId, tripNumber: s.tripNumber });
        }
        return;
      case 'dwelling':
        s.dwellRemainingSeconds -= dt;
        if (s.dwellRemainingSeconds <= 0) {
          s.dwellRemainingSeconds = 0;
          s.phase = 'moving';
          const departed = route.stops[s.nextStopIndex - 1];
          if (departed) events.push({ type: 'departed', busId: s.busId, stopId: departed.stopId, tripNumber: s.tripNumber });
        }
        return;
      case 'moving':
        this.move(s, c, route, dt, events);
    }
  }

  private move(s: SimBusState, c: SimBusConfig, route: SimRoute, dt: number, events: SimEvent[]): void {
    const target = route.stops[s.nextStopIndex];
    const targetDistance = target ? target.distanceAlongMeters : route.path.lengthMeters;
    const toTarget = Math.max(0, targetDistance - s.progressMeters);

    const variation = 0.85 + 0.15 * Math.sin(s.progressMeters / 220);
    const cruise = c.cruiseSpeedMps * c.speedFactor * variation;
    const brakingLimit = Math.max(MIN_APPROACH_SPEED, Math.sqrt(2 * BRAKING * toTarget));
    const desired = Math.min(cruise, brakingLimit);
    s.speedMps = s.speedMps < desired ? Math.min(desired, s.speedMps + ACCELERATION * dt) : desired;

    const travel = s.speedMps * dt;
    if (travel >= toTarget) {
      s.progressMeters = targetDistance;
      s.speedMps = 0;
      this.updateHeading(s, route);
      if (!target || s.nextStopIndex >= route.stops.length - 1) {
        if (target) events.push({ type: 'arrived', busId: s.busId, stopId: target.stopId, tripNumber: s.tripNumber });
        s.nextStopIndex = route.stops.length;
        s.phase = 'completed';
        s.waitRemainingSeconds = c.autoRestart ? this.opts.restartDelaySeconds : 0;
        events.push({ type: 'completed', busId: s.busId, tripNumber: s.tripNumber });
        return;
      }
      events.push({ type: 'arrived', busId: s.busId, stopId: target.stopId, tripNumber: s.tripNumber });
      s.nextStopIndex += 1;
      s.phase = 'dwelling';
      s.dwellRemainingSeconds = this.opts.dwellSeconds;
      return;
    }
    s.progressMeters += travel;
    this.updateHeading(s, route);
  }

  private updateHeading(s: SimBusState, route: SimRoute): void {
    const p = positionAlong(route.path, s.progressMeters);
    s.heading = p.heading;
    s.segmentIndex = p.segmentIndex;
  }
}
