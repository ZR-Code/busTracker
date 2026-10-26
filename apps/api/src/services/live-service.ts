import type { PrismaClient } from '@prisma/client';
import {
  computeEta,
  confidenceForStop,
  ETA_THRESHOLDS,
  projectPoint,
  type BusDto,
  type BusLiveDto,
  type BusStatus,
  type EtaResult,
  type EtaStopInput,
} from '@busbuddy/shared';
import { DEMO_DWELL_SECONDS } from '@busbuddy/shared/demo';
import { localDateParts, zonedTimeToUtcMs } from '../lib/time';
import { logger } from '../lib/logger';
import type { ProviderRegistry } from '../providers/registry';
import type { ProviderLocation } from '../providers/types';
import type { CachedRoute, RouteCache } from './route-cache';

export interface BusRecord {
  id: string;
  busNumber: string;
  schoolId: string;
  routeId: string | null;
  routeName: string | null;
  routeNumber: string | null;
  status: BusStatus;
  dataSource: BusDto['dataSource'];
  capacity: number;
  isDemo: boolean;
}

export interface LiveResult {
  dto: BusLiveDto;
  eta: EtaResult;
  route: CachedRoute | undefined;
  bus: BusRecord;
}

const DEFAULT_CRUISE_MPS = 9;

export function toBusDto(b: BusRecord, status: BusStatus = b.status): BusDto {
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

export class LiveService {
  private busCache: { at: number; map: Map<string, BusRecord> } | null = null;
  private statusTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly routes: RouteCache,
    private readonly providers: ProviderRegistry,
    private readonly opts: { staleAfterSeconds: number },
  ) {}

  invalidate(): void {
    this.busCache = null;
  }

  async buses(): Promise<Map<string, BusRecord>> {
    if (this.busCache && Date.now() - this.busCache.at < 5000) return this.busCache.map;
    const rows = await this.prisma.bus.findMany({ include: { route: { select: { name: true, number: true } } }, orderBy: { busNumber: 'asc' } });
    const map = new Map<string, BusRecord>();
    for (const b of rows) {
      map.set(b.id, {
        id: b.id,
        busNumber: b.busNumber,
        schoolId: b.schoolId,
        routeId: b.routeId,
        routeName: b.route?.name ?? null,
        routeNumber: b.route?.number ?? null,
        status: b.status,
        dataSource: b.dataSource,
        capacity: b.capacity,
        isDemo: b.isDemo,
      });
    }
    this.busCache = { at: Date.now(), map };
    return map;
  }

  async bus(busId: string): Promise<BusRecord | undefined> {
    return (await this.buses()).get(busId);
  }

  private async locationFor(bus: BusRecord): Promise<ProviderLocation | null> {
    const provider = this.providers.forSource(bus.dataSource);
    const loc = await provider.getBusLocation(bus.id);
    if (loc) return loc;
    const row = await this.prisma.busLocation.findFirst({ where: { busId: bus.id }, orderBy: { recordedAt: 'desc' } });
    if (!row) return null;
    return {
      busId: bus.id,
      lat: row.lat,
      lng: row.lng,
      heading: row.heading,
      speedMps: row.speedMps,
      recordedAt: row.recordedAt,
      dataSource: row.dataSource,
      tripId: `${row.dataSource}-${bus.id}-${row.recordedAt.toISOString().slice(0, 10)}`,
    };
  }

  async compute(bus: BusRecord, selectedStopId?: string | null): Promise<LiveResult> {
    const nowMs = Date.now();
    const route = bus.routeId ? await this.routes.get(bus.routeId) : undefined;
    const loc = await this.locationFor(bus);
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
      dwellSeconds: DEMO_DWELL_SECONDS,
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
      staleAfterSeconds: this.opts.staleAfterSeconds,
      dwellRemainingSeconds: sim?.dwellRemainingSeconds,
      departsInSeconds: sim?.departsInSeconds,
    });
    if (loc && progressMeters === null && eta.freshness === 'unavailable') {
      const ageSeconds = Math.round((nowMs - loc.recordedAt.getTime()) / 1000);
      eta.ageSeconds = ageSeconds;
      eta.freshness = ageSeconds > this.opts.staleAfterSeconds ? 'stale' : loc.dataSource === 'demo_simulation' ? 'simulated' : loc.dataSource === 'manual_test' ? 'manual' : 'live';
    }

    const status = this.deriveStatus(bus, eta, loc);
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
    return { dto, eta, route, bus };
  }

  deriveStatus(bus: BusRecord, eta: EtaResult, loc: ProviderLocation | null): BusStatus {
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

  async computeMany(filter: (b: BusRecord) => boolean): Promise<LiveResult[]> {
    const out: LiveResult[] = [];
    for (const b of (await this.buses()).values()) if (filter(b)) out.push(await this.compute(b));
    return out;
  }

  startStatusSync(intervalMs = 5000): void {
    this.statusTimer = setInterval(() => void this.syncStatuses(), intervalMs);
  }

  stopStatusSync(): void {
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.statusTimer = null;
  }

  async syncStatuses(): Promise<void> {
    try {
      const results = await this.computeMany((b) => b.status !== 'out_of_service');
      for (const r of results) {
        if (r.dto.bus.status !== r.bus.status) {
          await this.prisma.bus.update({ where: { id: r.bus.id }, data: { status: r.dto.bus.status } });
          r.bus.status = r.dto.bus.status;
        }
      }
    } catch (e) {
      logger.warn('Status sync failed', { error: e instanceof Error ? e.message : String(e) });
    }
  }
}
