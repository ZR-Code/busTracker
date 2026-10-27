import type { PrismaClient } from '@prisma/client';
import { buildBusLive, toBusDto, type BusLiveDto, type EtaResult, type LiveBusRecord } from '@busbuddy/shared';
import { DEMO_DWELL_SECONDS } from '@busbuddy/shared/demo';
import { logger } from '../lib/logger';
import type { ProviderRegistry } from '../providers/registry';
import type { ProviderLocation } from '../providers/types';
import type { CachedRoute, RouteCache } from './route-cache';

export { toBusDto };

export interface BusRecord extends LiveBusRecord {
  isDemo: boolean;
}

export interface LiveResult {
  dto: BusLiveDto;
  eta: EtaResult;
  route: CachedRoute | undefined;
  bus: BusRecord;
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
    const route = bus.routeId ? await this.routes.get(bus.routeId) : undefined;
    const loc = await this.locationFor(bus);
    const { dto, eta } = buildBusLive({
      bus,
      route,
      loc,
      nowMs: Date.now(),
      staleAfterSeconds: this.opts.staleAfterSeconds,
      dwellSeconds: DEMO_DWELL_SECONDS,
      selectedStopId,
    });
    return { dto, eta, route, bus };
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
